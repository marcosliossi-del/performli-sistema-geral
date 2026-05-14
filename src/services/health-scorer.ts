/**
 * Health Scorer
 *
 * Recalcula os HealthScores de um cliente para a semana atual (metas semanais)
 * e para o mês atual (metas mensais).
 *
 * Regras:
 *   ≥ 90% da meta  → OTIMO
 *   70–89%          → REGULAR
 *   < 70%           → RUIM
 *
 * Para métricas "lower is better" (CPL, CPA, CPC, CPS, CPM):
 *   achievement% = (target / actual) * 100
 */

import { prisma } from '@/lib/prisma'
import { classifyHealth } from '@/lib/health'
import { MetricType, HealthStatus } from '@prisma/client'
import { getWeekRange, getMonthRange } from '@/lib/utils'

/** Métricas onde menor valor = melhor resultado */
const LOWER_IS_BETTER: Set<MetricType> = new Set([
  'CPL',
  'CPA',
  'CAC',
  'CPC',
  'SPEND',
  'CPS',
  'CPM',
])

/**
 * Métricas que se ACUMULAM ao longo do período (não são taxas/razões).
 * Para essas, quando o período ainda está em progresso, comparamos o
 * valor acumulado até hoje contra a META PROPORCIONAL ao tempo decorrido.
 *
 * Ex: meta mensal R$100k, dia 14 de 31, ritmo esperado = R$45.2k.
 * Se faturou R$50k → 110% do esperado = ÓTIMO (sem prorating seria 50% = RUIM).
 *
 * Métricas de taxa (ROAS, CTR, TAXA_CONVERSAO, TICKET_MEDIO, CPL, etc.)
 * NÃO entram aqui — são medidas pontualmente, sem acumulação linear.
 */
const PRORATE_METRICS: Set<MetricType> = new Set([
  'FATURAMENTO', 'SALES',
  'SPEND', 'INVESTMENT',
  'LEADS', 'CONVERSIONS',
  'MENSAGENS', 'SEGUIDORES',
  'AGENDAMENTOS', 'LIGACOES', 'VISITAS_PERFIL',
  'IMPRESSIONS', 'CLICKS', 'REACH',
])

type Snapshot = {
  spend: unknown
  roas: unknown
  cpl: unknown
  cpa: unknown
  ctr: unknown
  cpc: unknown
  conversions: unknown
  conversionValue: unknown
  impressions: unknown
  reach: unknown
  clicks: unknown
  frequency: unknown
  platformAccount: { platform: string }
}

/** Agrega MetricSnapshots em um único valor por métrica */
function aggregateSnapshots(snapshots: Snapshot[], metric: MetricType): number | null {
  if (snapshots.length === 0) return null
  const toNum = (v: unknown) => (v != null ? Number(v) : 0)

  // ── Métricas derivadas (requerem numerador + denominador separados) ─────────
  const isGA4 = (x: Snapshot) => x.platformAccount.platform === 'GA4'
  const isAd  = (x: Snapshot) => x.platformAccount.platform !== 'GA4'

  const ga4Revenue   = snapshots.filter(isGA4).reduce((s, x) => s + toNum(x.conversionValue), 0)
  const ga4Purchases = snapshots.filter(isGA4).reduce((s, x) => s + toNum(x.conversions), 0)
  const ga4Sessions  = snapshots.filter(isGA4).reduce((s, x) => s + toNum(x.clicks), 0)
  const adRevenue    = snapshots.filter(isAd).reduce((s, x) => s + toNum(x.conversionValue), 0)
  const adPurchases  = snapshots.filter(isAd).reduce((s, x) => s + toNum(x.conversions), 0)
  const totalSpend   = snapshots.filter(isAd).reduce((s, x) => s + toNum(x.spend), 0)

  // Revenue = GA4 only (source of truth). No fallback to ad platform data —
  // using pixel revenue (Meta/Google) would produce different numbers than
  // the weekly report and KPI panel, which are GA4-exclusive.
  const revenue   = ga4Revenue
  // GA4 purchases for revenue-derived metrics (TICKET_MEDIO, TAXA_CONVERSAO, CONVERSIONS).
  // Ad-platform conversions used only as fallback for cost-per-event metrics (CPA, CPL, CAC)
  // where the goal is tracking campaign events, not monetary transactions.
  const purchases = ga4Purchases > 0 ? ga4Purchases : adPurchases

  if (metric === 'TAXA_CONVERSAO') {
    return ga4Sessions > 0 && ga4Purchases > 0 ? (ga4Purchases / ga4Sessions) * 100 : null
  }

  if (metric === 'TICKET_MEDIO') {
    return ga4Purchases > 0 && revenue > 0 ? revenue / ga4Purchases : null
  }

  if (metric === 'CPS') {
    return ga4Sessions > 0 && totalSpend > 0 ? totalSpend / ga4Sessions : null
  }

  if (metric === 'CPM') {
    const adImpressions = snapshots.filter(isAd).reduce((s, x) => s + toNum(x.impressions), 0)
    return adImpressions > 0 && totalSpend > 0 ? (totalSpend / adImpressions) * 1000 : null
  }

  if (metric === 'FATURAMENTO') {
    return revenue > 0 ? revenue : null
  }

  if (metric === 'ROAS') {
    return totalSpend > 0 && revenue > 0 ? revenue / totalSpend : null
  }

  if (metric === 'CPA') {
    return totalSpend > 0 && purchases > 0 ? totalSpend / purchases : null
  }

  if (metric === 'CPL') {
    return totalSpend > 0 && purchases > 0 ? totalSpend / purchases : null
  }

  if (metric === 'CAC') {
    return totalSpend > 0 && purchases > 0 ? totalSpend / purchases : null
  }

  if (metric === 'CONVERSIONS') {
    return purchases > 0 ? purchases : null
  }

  if (metric === 'SALES') {
    return revenue > 0 ? revenue : null
  }

  // ── LEADS: evento de lead — fonte Meta Ads (conversões da campanha) ────────
  // Clientes com meta de tráfego/lead usam Meta Ads como fonte primária.
  // ga4Purchases NÃO é usado aqui porque GA4 registra compras, não leads.
  if (metric === 'LEADS') {
    const adConversions = snapshots.filter(isAd).reduce((s, x) => s + toNum(x.conversions), 0)
    return adConversions > 0 ? adConversions : null
  }

  // ── Métricas de negócios locais ───────────────────────────────────────────
  // MENSAGENS, VISITAS_PERFIL, LIGACOES, AGENDAMENTOS: dados provenientes de
  // Meta Ads (conversões customizadas) ou entrada manual futura.
  // Por enquanto retorna null até haver snapshot com esses valores.
  if (metric === 'MENSAGENS' || metric === 'VISITAS_PERFIL' ||
      metric === 'LIGACOES'  || metric === 'AGENDAMENTOS') {
    // Tenta conversões de Meta Ads como proxy (ex: lead/mensagem configurado como evento)
    const adConversions = snapshots.filter(isAd).reduce((s, x) => s + toNum(x.conversions), 0)
    return adConversions > 0 ? adConversions : null
  }

  // ── Métricas diretas ──────────────────────────────────────────────────────
  const values = snapshots.map((s) => {
    switch (metric) {
      case 'INVESTMENT':
      case 'SPEND':        return toNum(s.spend) || null
      case 'CTR':          return toNum(s.ctr) || null
      case 'CPC':          return toNum(s.cpc) || null
      case 'IMPRESSIONS':  return toNum(s.impressions) || null
      case 'REACH':        return toNum(s.reach) || null
      case 'CLICKS':       return toNum(s.clicks) || null
      case 'FREQUENCY':    return toNum(s.frequency) || null
      default:             return null
    }
  }).filter((v): v is number => v !== null)

  if (values.length === 0) return null

  const SUM_METRICS: MetricType[] = ['INVESTMENT', 'SPEND', 'IMPRESSIONS', 'REACH', 'CLICKS']
  if (SUM_METRICS.includes(metric)) {
    return values.reduce((a, b) => a + b, 0)
  }

  return values.reduce((a, b) => a + b, 0) / values.length
}

function computeAchievementPct(actual: number, target: number, lowerIsBetter: boolean): number {
  if (target === 0) return 0
  if (lowerIsBetter) {
    return (target / actual) * 100
  }
  return (actual / target) * 100
}

export type ScoredMetric = { metric: MetricType; status: HealthStatus; achievementPct: number }

async function processGoals(
  clientId: string,
  goals: { id: string; metric: MetricType; period: 'WEEKLY' | 'MONTHLY'; targetValue: { toNumber: () => number } | number }[],
  snapshots: Snapshot[],
  periodStart: Date,
  periodEnd: Date
): Promise<{ created: number; updated: number; scores: ScoredMetric[] }> {
  let created = 0
  let updated = 0
  const scores: ScoredMetric[] = []

  // ── Pace calculation for in-progress periods ─────────────────────────────
  // Compare against prorated target (elapsed/total) for accumulative metrics.
  // Completed periods always use the full target (100%).
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const startDay = new Date(periodStart); startDay.setHours(0, 0, 0, 0)
  const endDay   = new Date(periodEnd);   endDay.setHours(0, 0, 0, 0)

  const periodInProgress = today < endDay

  const totalDays   = Math.round((endDay.getTime()   - startDay.getTime()) / 86_400_000) + 1
  const elapsedDays = Math.min(
    Math.floor((today.getTime() - startDay.getTime()) / 86_400_000) + 1,
    totalDays,
  )
  // Guard: never below 1 day to avoid division by zero or extreme early-period distortion
  const elapsedFraction = Math.max(elapsedDays, 1) / totalDays

  for (const goal of goals) {
    const actual = aggregateSnapshots(snapshots, goal.metric)
    if (actual === null) continue

    const rawTarget     = typeof goal.targetValue === 'number' ? goal.targetValue : goal.targetValue.toNumber()
    const lowerIsBetter = LOWER_IS_BETTER.has(goal.metric)

    // For accumulative metrics during an open period, scale the target to
    // the expected amount by today. Rate/ratio metrics are compared as-is.
    const target = (periodInProgress && PRORATE_METRICS.has(goal.metric))
      ? rawTarget * elapsedFraction
      : rawTarget

    const pct    = computeAchievementPct(actual, target, lowerIsBetter)
    const status = classifyHealth(lowerIsBetter ? target : actual, lowerIsBetter ? actual : target)

    const data = {
      clientId,
      goalId:        goal.id,
      metric:        goal.metric,
      period:        goal.period,
      periodStart,
      periodEnd,
      targetValue:   target,
      actualValue:   actual,
      achievementPct: pct,
      status,
      calculatedAt:  new Date(),
    }

    const existing = await prisma.healthScore.findUnique({
      where: { clientId_goalId_periodStart: { clientId, goalId: goal.id, periodStart } },
    })

    if (existing) {
      await prisma.healthScore.update({
        where: { id: existing.id },
        data: { actualValue: actual, achievementPct: pct, status, calculatedAt: new Date() },
      })
      updated++
    } else {
      await prisma.healthScore.create({ data })
      created++
    }

    scores.push({ metric: goal.metric, status, achievementPct: pct })
  }

  return { created, updated, scores }
}

export async function recalculateClientHealth(clientId: string): Promise<{
  created: number
  updated: number
  scores: ScoredMetric[]
}> {
  const { start: weekStart, end: weekEnd } = getWeekRange()
  const { start: monthStart, end: monthEnd } = getMonthRange()
  const today = new Date()

  const snapInclude = { platformAccount: { select: { platform: true } } } as const

  // ── Current week goals ────────────────────────────────────────────────────
  const weeklyGoals = await prisma.goal.findMany({
    where: {
      clientId,
      period: 'WEEKLY',
      startDate: { lte: weekEnd },
      endDate:   { gte: weekStart },
    },
  })

  const weeklySnapshots = await prisma.metricSnapshot.findMany({
    where: { clientId, date: { gte: weekStart, lte: weekEnd } },
    include: snapInclude,
  })

  const weeklyResult = await processGoals(clientId, weeklyGoals, weeklySnapshots, weekStart, weekEnd)

  // ── Previous week goals (finaliza a semana que acabou de fechar) ──────────
  // Re-calculates last week every time so late-arriving GA4 data is reflected.
  const { start: prevWeekStart, end: prevWeekEnd } = getWeekRange(
    new Date(today.getTime() - 7 * 86_400_000)
  )

  const prevWeeklyGoals = await prisma.goal.findMany({
    where: {
      clientId,
      period: 'WEEKLY',
      startDate: { lte: prevWeekEnd },
      endDate:   { gte: prevWeekStart },
    },
  })

  const prevWeeklySnapshots = await prisma.metricSnapshot.findMany({
    where: { clientId, date: { gte: prevWeekStart, lte: prevWeekEnd } },
    include: snapInclude,
  })

  const prevWeeklyResult = await processGoals(
    clientId, prevWeeklyGoals, prevWeeklySnapshots, prevWeekStart, prevWeekEnd
  )

  // ── Monthly goals ─────────────────────────────────────────────────────────
  const monthlyGoals = await prisma.goal.findMany({
    where: {
      clientId,
      period: 'MONTHLY',
      startDate: { lte: monthEnd },
      endDate:   { gte: monthStart },
    },
  })

  const monthlySnapshots = await prisma.metricSnapshot.findMany({
    where: { clientId, date: { gte: monthStart, lte: today } },
    include: snapInclude,
  })

  const monthlyResult = await processGoals(clientId, monthlyGoals, monthlySnapshots, monthStart, monthEnd)

  return {
    created: weeklyResult.created + prevWeeklyResult.created + monthlyResult.created,
    updated: weeklyResult.updated + prevWeeklyResult.updated + monthlyResult.updated,
    // Streak uses current week scores only (not previous week)
    scores: [...weeklyResult.scores, ...monthlyResult.scores],
  }
}

const STATUS_RANK: Record<HealthStatus, number> = { RUIM: 0, REGULAR: 1, OTIMO: 2 }

function dominantStatus(scores: ScoredMetric[]): HealthStatus | null {
  if (scores.length === 0) return null
  return scores.reduce((worst, s) =>
    STATUS_RANK[s.status] < STATUS_RANK[worst] ? s.status : worst,
    scores[0].status,
  )
}

// Derives the current status from stored HealthScore records using the same
// weekly-priority logic as the dashboard and daily digest. This avoids
// streak resets caused by mismatches when snapshots haven't arrived yet for
// the current week (which would make processGoals return no scores).
async function updateStreak(clientId: string): Promise<void> {
  const { start: weekStart }  = getWeekRange()
  const { start: monthStart } = getMonthRange()

  const healthScores = await prisma.healthScore.findMany({
    where: {
      clientId,
      OR: [
        { period: 'WEEKLY',  periodStart: { gte: weekStart } },
        { period: 'MONTHLY', periodStart: { gte: monthStart } },
      ],
    },
    select: { status: true, period: true },
  })

  const weeklyScores  = healthScores.filter((s) => s.period === 'WEEKLY')
  const monthlyScores = healthScores.filter((s) => s.period === 'MONTHLY')
  const scores = weeklyScores.length > 0 ? weeklyScores : monthlyScores
  if (scores.length === 0) return

  const status =
    scores.some((s) => s.status === 'RUIM')    ? 'RUIM'    :
    scores.some((s) => s.status === 'REGULAR') ? 'REGULAR' : 'OTIMO'

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const existing = await prisma.clientStatusStreak.findUnique({ where: { clientId } })

  if (existing && existing.status === status) {
    const sinceDay = new Date(existing.since)
    sinceDay.setHours(0, 0, 0, 0)
    const days = Math.floor((today.getTime() - sinceDay.getTime()) / 86_400_000) + 1
    await prisma.clientStatusStreak.update({ where: { clientId }, data: { days } })
  } else {
    // Status changed — save previous status so UI can show trend arrow
    const prevStatus = existing?.status ?? null
    await prisma.clientStatusStreak.upsert({
      where:  { clientId },
      update: { status, prevStatus, since: today, days: 1 },
      create: { clientId, status, prevStatus: prevStatus ?? undefined, since: today, days: 1 },
    })
  }
}

export async function recalculateAllClientsHealth(): Promise<{
  clientsProcessed: number
  totalCreated: number
  totalUpdated: number
}> {
  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  })

  let totalCreated = 0
  let totalUpdated = 0

  for (const client of clients) {
    const result = await recalculateClientHealth(client.id)
    totalCreated += result.created
    totalUpdated += result.updated
    await updateStreak(client.id)
  }

  return { clientsProcessed: clients.length, totalCreated, totalUpdated }
}
