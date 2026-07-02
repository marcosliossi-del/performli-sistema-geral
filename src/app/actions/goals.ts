'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { assertClientMutationAccess, writeAuditLog } from '@/lib/audit'
import { MetricType } from '@prisma/client'
import { getMonthRange } from '@/lib/utils'
import { parseDateInput } from '@/lib/tasks/dateInput'
import {
  upsertWeeklyGoalForMonth,
  syncWeeklyGoalsFromMonthly as syncWeeklyGoalsFromMonthlyService,
} from '@/services/weekly-goals-sync'

/**
 * Server action: sincroniza metas mensais → semanais.
 *
 * Mantém o guard (auth + papel ADMIN) e delega a LÓGICA à função de serviço
 * pura `@/services/weekly-goals-sync`. O cron chama a função de serviço
 * diretamente, sem passar por aqui (S0-001: `requireSession` redirecionava e a
 * sincronização automática de segunda nunca rodava).
 */
export async function syncWeeklyGoalsFromMonthly(): Promise<{
  created: number
  total: number
  error?: string
}> {
  const session = await requireSession()
  if (session.role !== 'ADMIN') return { created: 0, total: 0, error: 'Sem permissão.' }

  const result = await syncWeeklyGoalsFromMonthlyService()

  revalidatePath('/agency/metas')
  revalidatePath('/clients')
  revalidatePath('/dashboard')
  return { created: result.created, total: result.total }
}

export type GoalUpsert = {
  clientId: string
  metric: MetricType
  value: number
  startDate: string // 'YYYY-MM-DD'
  endDate: string   // 'YYYY-MM-DD'
}

export async function upsertMonthlyGoals(
  goals: GoalUpsert[],
): Promise<{ ok: boolean; error?: string; saved?: number; ignored?: number }> {
  const session = await requireSession()
  if (session.role !== 'ADMIN') return { ok: false, error: 'Sem permissão.' }

  const now = new Date()
  const { start: monthStart, end: monthEnd } = getMonthRange(now)

  let saved = 0
  let ignored = 0

  for (const g of goals) {
    // Valor 0/negativo/NaN NÃO é alvo válido: tratado como "sem meta" e ignorado
    // (S1-012). Um 0 gravado faria "meta batida"/"péssimo" falso nos motores.
    if (isNaN(g.value) || g.value <= 0) { ignored++; continue }
    const startDate = parseDateInput(g.startDate)
    const endDate   = parseDateInput(g.endDate)

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
    saved++
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'goals.upsertMonthly',
    entityType: 'Goal',
    entityId: 'bulk',
    metadata: {
      count: goals.length,
      saved,
      ignored,
      clientIds: Array.from(new Set(goals.map((g) => g.clientId))),
    },
  })

  revalidatePath('/agency/metas')
  revalidatePath('/clients')
  revalidatePath('/dashboard')
  return { ok: true, saved, ignored }
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
  const session = await requireSession()

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
  // 0/negativo = "sem meta": não é alvo válido (S1-012)
  if (isNaN(target) || target <= 0) {
    return { error: 'Valor da meta deve ser maior que zero.' }
  }

  const start = parseDateInput(startDate)
  const end   = parseDateInput(endDate)
  if (end < start) {
    return { error: 'A data de fim deve ser após a data de início.' }
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { slug: true },
  })
  if (!client) return { error: 'Cliente não encontrado.' }

  try {
    await assertClientMutationAccess(session, clientId)
  } catch (e) {
    return { error: (e as Error).message }
  }

  const period = periodRaw === 'MONTHLY' ? 'MONTHLY' : 'WEEKLY'

  try {
    // Re-salvar a MESMA meta (clientId+metric+period+startDate) é o caminho
    // normal do modal (métricas locais MENSAGENS/LEADS/AGENDAMENTOS…). `create`
    // batia no @@unique e retornava P2002 "já existe". UPSERT pela chave única
    // (mesmo padrão de `upsertMonthlyGoals`): atualiza targetValue+endDate+notes,
    // cria o resto.
    await prisma.goal.upsert({
      where: {
        clientId_metric_period_startDate: {
          clientId,
          metric: metric as MetricType,
          period,
          startDate: start,
        },
      },
      update: { targetValue: target, endDate: end, notes: notes || null },
      create: {
        clientId,
        metric:      metric as MetricType,
        period,
        targetValue: target,
        startDate:   start,
        endDate:     end,
        notes:       notes || null,
      },
    })
  } catch {
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
