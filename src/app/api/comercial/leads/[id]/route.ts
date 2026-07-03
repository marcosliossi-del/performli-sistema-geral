import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { z } from 'zod'

const patchSchema = z.object({
  name:            z.string().min(1).optional(),
  email:           z.string().email().optional().or(z.literal('')),
  phone:           z.string().optional(),
  company:         z.string().optional(),
  source:          z.string().optional(),
  status:          z.enum(['NOVO','EM_CONTATO','REUNIAO_AGENDADA','PROPOSTA_ENVIADA','PROPOSTA_ACEITA','FECHADO','PERDIDO']).optional(),
  value:           z.number().positive().optional(),
  probability:     z.number().min(0).max(100).optional(),
  expectedCloseAt: z.string().optional().nullable(),
  lostReason:      z.string().optional(),
  notes:           z.string().optional(),
  ownerId:         z.string().nullable().optional(),
})

/** PATCH /api/comercial/leads/[id] — update lead (including drag-and-drop status change) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  // RBAC v2: pipeline comercial é SÓ ADMIN (matriz comercial).
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body   = await request.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const existing = await prisma.agencyLead.findUnique({ where: { id }, select: { status: true, name: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data = parsed.data

  // Valida responsável (quando informado e não-nulo): precisa existir e estar ativo.
  if (data.ownerId) {
    const owner = await prisma.user.findFirst({ where: { id: data.ownerId, active: true }, select: { id: true } })
    if (!owner) return NextResponse.json({ error: 'Responsável informado não existe ou está inativo.' }, { status: 400 })
  }
  const closedAt =
    data.status === 'FECHADO' || data.status === 'PERDIDO'
      ? new Date()
      : undefined

  const updated = await prisma.agencyLead.update({
    where: { id },
    data: {
      ...data,
      email:           data.email || undefined,
      expectedCloseAt: data.expectedCloseAt ? new Date(data.expectedCloseAt) : data.expectedCloseAt === null ? null : undefined,
      closedAt,
    },
    include: { activities: { orderBy: { occurredAt: 'desc' }, take: 5 } },
  })

  // Log status change
  if (data.status && data.status !== existing.status) {
    const statusLabels: Record<string, string> = {
      NOVO: 'Novo', EM_CONTATO: 'Em contato', REUNIAO_AGENDADA: 'Reunião agendada',
      PROPOSTA_ENVIADA: 'Proposta enviada', PROPOSTA_ACEITA: 'Proposta aceita',
      FECHADO: 'Fechado', PERDIDO: 'Perdido',
    }
    await prisma.agencyActivity.create({
      data: {
        type:  'STATUS_CHANGE',
        title: `Status alterado para ${statusLabels[data.status] ?? data.status}`,
        userId: session.userId,
        leadId: id,
      },
    })
  }

  return NextResponse.json(updated)
}

/** DELETE /api/comercial/leads/[id] — soft delete */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  // RBAC v2: excluir lead do pipeline comercial é SÓ ADMIN.
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  await prisma.agencyLead.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
