'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { MetricType } from '@prisma/client'
import { getWeekRange, getMonthRange } from '@/lib/utils'

// Métricas onde a meta é a mesma independente do período (taxas, médias, razões)
const RATE_METRICS = new Set<MetricType>([
  'ROAS', 'CTR', 'TAXA_CONVERSAO', 'TICKET_MEDIO', 'CPS', 'CPL', 'CPA', 'CAC', 'CPM',
])
const WEEKS_PER_MONTH = 4.33

/** Calcula o valor semanal equivalente a uma meta mensal */
function weeklyTarget(metric: MetricType, monthlyValue: number): number {
  const weekly = RATE_METRICS.has(metric)
    ? monthlyValue
    : Math.round((monthlyValue / WEEKS_PER_MONTH) * 100) / 100
  return weekly
}

/**
 * Cria ou atualiza a meta SEMANAL da semana atual para um único cliente/métrica.
 * Chamado automaticamente toda vez que uma meta mensal é salva.
 */
async function upsertWeeklyGoalForMonth(
  clientId: string,
  metric: MetricType,
  monthlyValue: number,
): Promise<void> {
  const { start: weekStart, end: weekEnd } = getWeekRange()
  const weekly = weeklyTarget(metric, monthlyValue)

  await prisma.goal.upsert({
    where: {
      clientId_metric_period_startDate: {
        clientId,
        metric,
        period: 'WEEKLY',
        startDate: weekStart,
      },
    },
    update: { targetValue: weekly, endDate: weekEnd },
    create: {
      clientId,
      metric,
      period:      'WEEKLY',
      targetValue: weekly,
      startDate:   weekStart,
      endDate:     weekEnd,
    },
  })
}

/**
 * Sincronização em massa: para cada cliente ativo com meta MENSAL no mês atual,
 * cria/atualiza a meta SEMANAL equivalente para a semana corrente.
 */
export async function syncWeeklyGoalsFromMonthly(): Promise<{
  created: number
  total: number
  error?: string
}> {
  await requireSession()

  const now = new Date()
  const { start: weekStart, end: weekEnd } = getWeekRange()
  const { start: monthStart, end: monthEnd } = getMonthRange(now)

  const monthlyGoals = await prisma.goal.findMany({
    where: {
      period:    'MONTHLY',
      startDate: { lte: monthEnd },
      endDate:   { gte: monthStart },
      client:    { status: 'ACTIVE' },
    },
    select: { clientId: true, metric: true, targetValue: true },
  })

  if (monthlyGoals.length === 0) return { created: 0, total: 0 }

  const toCreate = monthlyGoals.map((g) => ({
    clientId:    g.clientId,
    metric:      g.metric,
    period:      'WEEKLY' as const,
    targetValue: weeklyTarget(g.metric, Number(g.targetValue)),
    startDate:   weekStart,
    endDate:     weekEnd,
  }))

  const result = await prisma.goal.createMany({ data: toCreate, skipDuplicates: true })

  revalidatePath('/agency/metas')
  revalidatePath('/clients')
  revalidatePath('/dashboard')
  return { created: result.count, total: monthlyGoals.length }
}

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

  const now = new Date()
  const { start: monthStart, end: monthEnd } = getMonthRange(now)

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

    // Auto-sync: se a meta mensal salva é do mês atual, atualiza a meta semanal da semana corrente
    const isCurrentMonth = startDate <= monthEnd && endDate >= monthStart
    if (isCurrentMonth) {
      await upsertWeeklyGoalForMonth(g.clientId, g.metric, g.value)
    }
  }

  revalidatePath('/agency/metas')
  revalidatePath('/clients')
  revalidatePath('/dashboard')
  return { ok: true }
}

export type MonthlyGoalsRow = {
  FATURAMENTO: number | null
  ROAS:        number | null
  SPEND:       number | null
  LEADS:       number | null
  CPL:         number | null
}

export async function fetchMonthlyGoals(
  clientIds: string[],
  year: number,
  month: number,
): Promise<Record<string, MonthlyGoalsRow>> {
  await requireSession()

  const monthStart = new Date(year, month, 1)
  const monthEnd   = new Date(year, month + 1, 0)

  const goals = await prisma.goal.findMany({
    where: {
      clientId: { in: clientIds },
      period: 'MONTHLY',
      startDate: { lte: monthEnd },
      endDate:   { gte: monthStart },
      metric:    { in: ['FATURAMENTO', 'ROAS', 'SPEND', 'LEADS', 'CPL'] },
    },
    select: { clientId: true, metric: true, targetValue: true },
  })

  const result: Record<string, MonthlyGoalsRow> = {}
  for (const id of clientIds) {
    result[id] = { FATURAMENTO: null, ROAS: null, SPEND: null, LEADS: null, CPL: null }
  }
  for (const g of goals) {
    const row = result[g.clientId]
    if (!row) continue
    const val = Number(g.targetValue)
    if      (g.metric === 'FATURAMENTO') row.FATURAMENTO = val
    else if (g.metric === 'ROAS')        row.ROAS = val
    else if (g.metric === 'SPEND')       row.SPEND = val
    else if (g.metric === 'LEADS')       row.LEADS = val
    else if (g.metric === 'CPL')         row.CPL = val
  }
  return result
}

export type GoalState = {
  error?: string
  success?: boolean
}

export async function createGoal(prevState: GoalState, formData: FormData): Promise<GoalState> {
  await requireSession()

  const clientId   = formData.get('clientId') as string
  const metric     = formData.get('metric') as string
  const targetValue = formData.get('targetValue') as string
  const startDate  = formData.get('startDate') as string
  const endDate    = formData.get('endDate') as string
  const notes      = formData.get('notes') as string
  const periodRaw  = formData.get('period') as string

  if (!clientId || !metric || !targetValue || !startDate || !endDate) {
    return { error: 'Preencha todos os campos obrigatórios.' }
  }

  const target = parseFloat(targetValue)
  if (isNaN(target) || target < 0) {
    return { error: 'Valor da meta inválido.' }
  }

  const start = new Date(startDate)
  const end   = new Date(endDate)
  if (end < start) {
    return { error: 'A data de fim deve ser após a data de início.' }
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { slug: true },
  })
  if (!client) return { error: 'Cliente não encontrado.' }

  const period = periodRaw === 'MONTHLY' ? 'MONTHLY' : 'WEEKLY'

  try {
    await prisma.goal.create({
      data: {
        clientId,
        metric:      metric as MetricType,
        period,
        targetValue: target,
        startDate:   start,
        endDate:     end,
        notes:       notes || null,
      },
    })
  } catch (e: unknown) {
    const err = e as { code?: string }
    if (err?.code === 'P2002') {
      return { error: 'Já existe uma meta para esta métrica neste período.' }
    }
    return { error: 'Erro ao salvar meta. Tente novamente.' }
  }

  // Auto-sync: ao criar uma meta MENSAL do mês atual, gera a semanal automaticamente
  if (period === 'MONTHLY') {
    const now = new Date()
    const { start: monthStart, end: monthEnd } = getMonthRange(now)
    const isCurrentMonth = start <= monthEnd && end >= monthStart
    if (isCurrentMonth) {
      await upsertWeeklyGoalForMonth(clientId, metric as MetricType, target)
    }
  }

  revalidatePath(`/clients/${client.slug}`)
  revalidatePath('/agency/metas')
  return { success: true }
}
