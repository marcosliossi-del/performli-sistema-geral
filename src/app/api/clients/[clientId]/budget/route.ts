import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { assertClientMutationAccess } from '@/lib/audit'
import { normalizeRole, can } from '@/lib/rbac'
import { getMonthRange } from '@/lib/utils'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const session = await getSession()
  // Budget de mídia (investimento) é dado de performance — clientes.update.
  // Staff amplo edita qualquer cliente; GESTOR só a carteira (posse abaixo).
  if (!session || !can(normalizeRole(session.role), 'update', 'clientes')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { clientId } = await params

  // Posse: staff amplo em qualquer cliente; GESTOR só nos atribuídos.
  try {
    await assertClientMutationAccess(session, clientId, { allowCS: true })
  } catch {
    return NextResponse.json({ error: 'Sem acesso a este cliente' }, { status: 403 })
  }

  const body = await request.json()
  const value = typeof body.value === 'number' ? body.value : parseFloat(body.value)
  if (isNaN(value) || value < 0) {
    return NextResponse.json({ error: 'Invalid value' }, { status: 400 })
  }

  const today = new Date()
  const { start: monthStart, end: monthEnd } = getMonthRange(today)

  const goal = await prisma.goal.upsert({
    where: {
      clientId_metric_period_startDate: {
        clientId,
        metric: 'SPEND',
        period: 'MONTHLY',
        startDate: monthStart,
      },
    },
    update: { targetValue: value, endDate: monthEnd },
    create: {
      clientId,
      metric: 'SPEND',
      period: 'MONTHLY',
      targetValue: value,
      startDate: monthStart,
      endDate: monthEnd,
    },
  })

  return NextResponse.json({ ok: true, goalId: goal.id, targetValue: Number(goal.targetValue) })
}
