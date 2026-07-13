import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { z } from 'zod'
import { AgencyLeadStatus } from '@prisma/client'

// Etapas iniciais válidas ao criar um lead (kanban aberto — exclui os estados
// finais FECHADO/PERDIDO, que só são atingidos por conversão/perda).
const INITIAL_STAGES = [
  'NOVO',
  'EM_CONTATO',
  'REUNIAO_AGENDADA',
  'PROPOSTA_ENVIADA',
  'PROPOSTA_ACEITA',
] as const

const createSchema = z.object({
  name:            z.string().min(1),
  email:           z.string().email().optional().or(z.literal('')),
  phone:           z.string().optional(),
  company:         z.string().optional(),
  source:          z.string().optional(),
  value:           z.number().positive().optional(),
  probability:     z.number().min(0).max(100).optional(),
  expectedCloseAt: z.string().optional(),
  notes:           z.string().optional(),
  status:          z.enum(INITIAL_STAGES).optional(),
  ownerId:         z.string().optional(),
})

/** GET /api/comercial/leads — list all active leads */
export async function GET(_request: NextRequest) {
  const session = await getSession()
  // RBAC v2: pipeline comercial é SÓ ADMIN (matriz comercial). Espelha o guard
  // de PATCH/DELETE/convert — sem isto, qualquer autenticado lê o funil inteiro.
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const leads = await prisma.agencyLead.findMany({
    where: { deletedAt: null },
    include: {
      activities: {
        orderBy: { occurredAt: 'desc' },
        take: 1,
        include: { user: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(leads)
}

/** POST /api/comercial/leads — create a new lead */
export async function POST(request: NextRequest) {
  const session = await getSession()
  // RBAC v2: pipeline comercial é SÓ ADMIN (matriz comercial).
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { name, email, phone, company, source, value, probability, expectedCloseAt, notes, status, ownerId } = parsed.data

  // Valida que o responsável informado existe e está ativo (evita ownerId órfão).
  let validOwnerId: string | null = null
  if (ownerId) {
    const owner = await prisma.user.findFirst({ where: { id: ownerId, active: true }, select: { id: true } })
    if (!owner) return NextResponse.json({ error: 'Responsável informado não existe ou está inativo.' }, { status: 400 })
    validOwnerId = owner.id
  }

  const lead = await prisma.agencyLead.create({
    data: {
      name,
      email:           email || null,
      phone:           phone || null,
      company:         company || null,
      source:          source || null,
      value:           value ?? null,
      probability:     probability ?? null,
      expectedCloseAt: expectedCloseAt ? new Date(expectedCloseAt) : null,
      notes:           notes || null,
      status:          (status as AgencyLeadStatus | undefined) ?? 'NOVO',
      ownerId:         validOwnerId,
    },
    include: { activities: true },
  })

  // Log activity
  await prisma.agencyActivity.create({
    data: {
      type:   'NOTA',
      title:  'Lead criado',
      body:   `Lead ${name} adicionado ao pipeline`,
      userId: session.userId,
      leadId: lead.id,
    },
  })

  return NextResponse.json(lead, { status: 201 })
}
