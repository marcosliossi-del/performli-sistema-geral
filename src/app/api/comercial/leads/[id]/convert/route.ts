import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { z } from 'zod'

const schema = z.object({
  // Client fields
  clientName:    z.string().min(1),
  phone:         z.string().optional(),
  email:         z.string().email().optional().or(z.literal('')),
  industry:      z.string().optional(),
  // Contract
  contractStart:  z.string().min(1),        // ISO date string
  contractMonths: z.number().int().min(1).optional(),
  contractValue:  z.number().positive().optional(),
  // Assignment
  managerId:     z.string().optional(),
  // Goal
  monthlyGoal:   z.number().positive().optional(),
  goalMetric:    z.string().optional(),
})

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base)
  let suffix = 0
  while (true) {
    const candidate = suffix === 0 ? slug : `${slug}-${suffix}`
    const existing = await prisma.client.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!existing) return candidate
    suffix++
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  // Converter lead cria Client + Contract + Assignment — mesma barreira de
  // createClient/createContract: apenas ADMIN.
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body   = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const lead = await prisma.agencyLead.findUnique({ where: { id }, select: { id: true, convertedClientId: true, source: true } })
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (lead.convertedClientId) return NextResponse.json({ error: 'Lead já convertido', clientId: lead.convertedClientId }, { status: 409 })

  const d = parsed.data
  const slug  = await uniqueSlug(d.clientName)
  const start = new Date(d.contractStart)

  const client = await prisma.client.create({
    data: {
      name:          d.clientName,
      slug,
      email:         d.email || null,
      phone:         d.phone || null,
      industry:      d.industry || null,
      source:        lead.source ?? null,
      contractValue: d.contractValue ?? null,
      contractStart: start,
      status:        'ACTIVE',
    },
  })

  // Assign manager
  if (d.managerId) {
    await prisma.clientAssignment.create({
      data: { clientId: client.id, userId: d.managerId, isPrimary: true },
    })
  }

  // Create monthly goal (endDate = last day of start month)
  if (d.monthlyGoal && d.monthlyGoal > 0) {
    const endDate = new Date(start.getFullYear(), start.getMonth() + 1, 0)
    await prisma.goal.create({
      data: {
        clientId:    client.id,
        metric:      (d.goalMetric ?? 'FATURAMENTO') as any,
        period:      'MONTHLY',
        targetValue: d.monthlyGoal,
        startDate:   start,
        endDate,
      },
    })
  }

  // Auto-create contract in RASCUNHO so the team fills in the details
  if (d.contractValue && d.contractValue > 0) {
    const months  = d.contractMonths ?? 12
    const endDate = new Date(start.getFullYear(), start.getMonth() + months, start.getDate())
    await prisma.contract.create({
      data: {
        clientId:     client.id,
        responsibleId: d.managerId ?? null,
        status:       'RASCUNHO',
        type:         'FEE_MENSAL',
        feeValue:     d.contractValue,
        startDate:    start,
        endDate,
        noticeDays:   30,
      },
    })
  }

  // Mark lead as converted
  await prisma.agencyLead.update({
    where: { id },
    data: {
      status:           'FECHADO',
      closedAt:         new Date(),
      convertedClientId: client.id,
      convertedAt:      new Date(),
    },
  })

  // Activity log
  await prisma.agencyActivity.create({
    data: {
      type:   'STATUS_CHANGE',
      title:  'Lead convertido em cliente',
      body:   `Cliente "${client.name}" criado com sucesso.`,
      leadId: id,
      userId: session.userId,
    },
  })

  return NextResponse.json({ ok: true, clientId: client.id, clientSlug: client.slug })
}
