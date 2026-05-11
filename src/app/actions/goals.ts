'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { MetricType } from '@prisma/client'

export type GoalUpsert = {
  clientId: string
  metric: MetricType
  value: number
  startDate: string // 'YYYY-MM-DD'
  endDate: string   // 'YYYY-MM-DD'
}

export async function upsertMonthlyGoals(goals: GoalUpsert[]): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession()
  if (session.role !== 'ADMIN') return { ok: false, error: 'Sem permissão.' }

  for (const g of goals) {
    if (isNaN(g.value) || g.value < 0) continue
    const startDate = new Date(g.startDate)
    const endDate   = new Date(g.endDate)

    await prisma.goal.upsert({
      where: {
        clientId_metric_period_startDate: {
          clientId:  g.clientId,
          metric:    g.metric,
          period:    'MONTHLY',
          startDate,
        },
      },
      update: { targetValue: g.value, endDate },
      create: {
        clientId:    g.clientId,
        metric:      g.metric,
        period:      'MONTHLY',
        targetValue: g.value,
        startDate,
        endDate,
      },
    })
  }

  revalidatePath('/agency/metas')
  revalidatePath('/clients')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function fetchMonthlyGoals(
  clientIds: string[],
  year: number,
  month: number,
): Promise<Record<string, { FATURAMENTO: number | null; ROAS: number | null; SPEND: number | null }>> {
  await requireSession()

  const monthStart = new Date(year, month, 1)
  const monthEnd   = new Date(year, month + 1, 0)

  const goals = await prisma.goal.findMany({
    where: {
      clientId: { in: clientIds },
      period: 'MONTHLY',
      startDate: { lte: monthEnd },
      endDate:   { gte: monthStart },
      metric:    { in: ['FATURAMENTO', 'ROAS', 'SPEND'] },
    },
    select: { clientId: true, metric: true, targetValue: true },
  })

  const result: Record<string, { FATURAMENTO: number | null; ROAS: number | null; SPEND: number | null }> = {}
  for (const id of clientIds) {
    result[id] = { FATURAMENTO: null, ROAS: null, SPEND: null }
  }
  for (const g of goals) {
    const row = result[g.clientId]
    if (!row) continue
    const val = Number(g.targetValue)
    if (g.metric === 'FATURAMENTO') row.FATURAMENTO = val
    else if (g.metric === 'ROAS')   row.ROAS = val
    else if (g.metric === 'SPEND')  row.SPEND = val
  }
  return result
}

export type GoalState = {
  error?: string
  success?: boolean
}

export async function createGoal(prevState: GoalState, formData: FormData): Promise<GoalState> {
  await requireSession()

  const clientId = formData.get('clientId') as string
  const metric = formData.get('metric') as string
  const targetValue = formData.get('targetValue') as string
  const startDate = formData.get('startDate') as string
  const endDate = formData.get('endDate') as string
  const notes = formData.get('notes') as string
  const periodRaw = formData.get('period') as string

  if (!clientId || !metric || !targetValue || !startDate || !endDate) {
    return { error: 'Preencha todos os campos obrigatórios.' }
  }

  const target = parseFloat(targetValue)
  if (isNaN(target) || target < 0) {
    return { error: 'Valor da meta inválido.' }
  }

  const start = new Date(startDate)
  const end = new Date(endDate)
  if (end < start) {
    return { error: 'A data de fim deve ser após a data de início.' }
  }

  // Check client exists
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { slug: true },
  })
  if (!client) return { error: 'Cliente não encontrado.' }

  try {
    const period = periodRaw === 'MONTHLY' ? 'MONTHLY' : 'WEEKLY'
    await prisma.goal.create({
      data: {
        clientId,
        metric: metric as MetricType,
        period,
        targetValue: target,
        startDate: start,
        endDate: end,
        notes: notes || null,
      },
    })
  } catch (e: unknown) {
    const err = e as { code?: string }
    if (err?.code === 'P2002') {
      return { error: 'Já existe uma meta para esta métrica neste período.' }
    }
    return { error: 'Erro ao salvar meta. Tente novamente.' }
  }

  revalidatePath(`/clients/${client.slug}`)
  revalidatePath('/agency/metas')
  return { success: true }
}
