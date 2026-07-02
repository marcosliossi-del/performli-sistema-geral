/**
 * Health Scorer — dual-signal evaluation
 *
 * Signal 1 — MTD pace:
 *   Compares the accumulated value this month against the pro-rated target
 *   (e.g. on day 14 of 31, target = full_target × 14/31).
 *   ≥ 90% → OTIMO  |  70–89% → REGULAR  |  < 70% → RUIM
 *
 * Signal 2 — recent trend:
 *   Compares last 7 days vs prior 7 days for the same metric.
 *   A change ≥ 20% in the wrong direction drops MTD status one level.
 *   A change ≥ 20% in the right direction raises MTD status one level.
 *   Only applied to MONTHLY scores (weekly scores already reflect recency).
 *
 * Data source by business type:
 *   ECOMMERCE → GA4 is the source of truth for revenue + purchases.
 *   LOCAL      → Meta Ads is the source of truth for all conversion metrics.
 */

import { prisma } from '@/lib/prisma'
import { classifyHealth } from '@/lib/health'
import { MetricType, HealthStatus, BusinessType } from '@prisma/client'
import { getWeekRange, getMonthRange } from '@/lib/utils'

// Item 7 (fallback de meta via ficha do Client): NÃO plugável aqui sem migration.
// HealthScore.goalId é FK obrigatória (schema:430, parte do unique), então não há
// como gerar um score de FATURAMENTO/CPA a partir de Client.faturamentoEsperado/
// cpaMaximo sem um Goal real. Precedência Goal > Client fica registrada; o plug
// depende de tornar goalId opcional (fora do escopo da Onda 1). Deixado como está.
const LOWER_IS_BETTER: Set<MetricType> = new Set([
  'CPL', 'CPA', 'CAC', 'CPC', 'SPEND', 'CPS', 'CPM',
])

const PRORATE_METRICS: Set<MetricType> = new Set([
  'FATURAMENTO', 'SALES',
  'SPEND', 'INVESTMENT',
  'LEADS', 'CONVERSIONS',
  'MENSAGENS', 'SEGUIDORES',
  'AGENDAMENTOS', 'LIGACOES', 'VISITAS_PERFIL',
  'IMPRESSIONS', 'CLICKS', 'REACH',
])

// Trend beyond this threshold (in either direction) shifts the status one level.
const TREND_THRESHOLD_PCT = 20

export type AggregatableSnapshot = {
  spend:            unknown
  roas:             unknown
  cpl:              unknown
  cpa:              unknown
  ctr:              unknown
  cpc:              unknown
  conversions:      unknown
  conversionValue:  unknown
  impressions:      unknown
  reach:            unknown
  clicks:           unknown
  frequency:        unknown
  mensagens:        unknown
  landingPageViews: unknown
  platformAccount: { platform: string }
}

// Alias interno para manter as assinaturas existentes deste módulo.
type Snapshot = AggregatableSnapshot

// ── Aggregation ───────────────────────────────────────────────────────────────

/**
 * Aggregate a list of MetricSnapshots into a single scalar for `metric`.
 * businessType controls which platform is the source of truth:
 *   ECOMMERCE → GA4 for revenue/purchases (strict — no Meta fallback)
 *   LOCAL      → Meta Ads for all conversion metrics
 */
export function aggregateSnapshots(
  snapshots:    AggregatableSnapshot[],
  metric:       MetricType,
  businessType: BusinessType,
): number | null {
  if (snapshots.length === 0) return null

  const toNum = (v: unknown) => (v != null ? Number(v) : 0)

  const ga4  = snapshots.filter((x) => x.platformAccount.platform === 'GA4')
  const ads  = snapshots.filter((x) => x.platformAccount.platform !== 'GA4')
  const meta = snapshots.filter((x) => x.platformAccount.platform === 'META_ADS')

  const ga4Revenue    = ga4.reduce((s, x) => s + toNum(x.conversionValue), 0)
  const ga4Purchases  = ga4.reduce((s, x) => s + toNum(x.conversions), 0)
  const ga4Sessions   = ga4.reduce((s, x) => s + toNum(x.clicks), 0)

  const metaRevenue    = meta.reduce((s, x) => s + toNum(x.conversionValue), 0)
  const metaConv       = meta.reduce((s, x) => s + toNum(x.conversions), 0)
  const metaMensagens  = meta.reduce((s, x) => s + toNum(x.mensagens), 0)
  const metaLandViews  = meta.reduce((s, x) => s + toNum(x.landingPageViews), 0)
  const metaSpend      = meta.reduce((s, x) => s + toNum(x.spend), 0)

  const totalSpend    = ads.reduce((s, x) => s + toNum(x.spend), 0)
  const adImpressions = ads.reduce((s, x) => s + toNum(x.impressions), 0)

  // Source selection per business type
  const revenue   = businessType === 'LOCAL' ? metaRevenue  : ga4Revenue
  const purchases = businessType === 'LOCAL' ? metaConv     : ga4Purchases

  // ── Derived metrics ───────────────────────────────────────────────────────

  if (metric === 'ROAS') {
    const spend = businessType === 'LOCAL' ? metaSpend : totalSpend
    return spend > 0 && revenue > 0 ? revenue / spend : null
  }

  if (metric === 'FATURAMENTO' || metric === 'SALES') {
    return revenue > 0 ? revenue : null
  }

  if (metric === 'CONVERSIONS') {
    return purchases > 0 ? purchases : null
  }

  if (metric === 'MENSAGENS') {
    if (businessType === 'LOCAL') {
      return metaMensagens > 0 ? metaMensagens : null
    }
    return null
  }

  if (metric === 'LEADS') {
    // Lead form campaigns → conversions field; WhatsApp campaigns → mensagens field
    if (metaConv > 0) return metaConv
    if (businessType === 'LOCAL' && metaMensagens > 0) return metaMensagens
    return null
  }

  if (metric === 'TAXA_CONVERSAO') {
    return ga4Sessions > 0 && ga4Purchases > 0 ? (ga4Purchases / ga4Sessions) * 100 : null
  }

  if (metric === 'TICKET_MEDIO') {
    return purchases > 0 && revenue > 0 ? revenue / purchases : null
  }

  if (metric === 'CPS') {
    return ga4Sessions > 0 && totalSpend > 0 ? totalSpend / ga4Sessions : null
  }

  if (metric === 'CPM') {
    return adImpressions > 0 && totalSpend > 0 ? (totalSpend / adImpressions) * 1000 : null
  }

  if (metric === 'CPA' || metric === 'CPL' || metric === 'CAC') {
    // For LOCAL WhatsApp campaigns, mensagens serve as the conversion denominator
    const denom = purchases > 0
      ? purchases
      : (businessType === 'LOCAL' && metaMensagens > 0 ? metaMensagens : 0)
    return totalSpend > 0 && denom > 0 ? totalSpend / denom : null
  }

  if (metric === 'VISITAS_PERFIL' || metric === 'LIGACOES' || metric === 'AGENDAMENTOS') {
    if (businessType === 'LOCAL') {
      if (metric === 'VISITAS_PERFIL') return metaLandViews > 0 ? metaLandViews : null
      return metaConv > 0 ? metaConv : null
    }
    return null
  }

  // ── Direct / summable metrics ─────────────────────────────────────────────

  const values = snapshots.map((s) => {
    switch (metric) {
      case 'INVESTMENT':
      case 'SPEND':       return toNum(s.spend) || null
      case 'CTR':         return toNum(s.ctr)   || null
      case 'CPC':         return toNum(s.cpc)   || null
      case 'IMPRESSIONS': return toNum(s.impressions) || null
      case 'REACH':       return toNum(s.reach) || null
      case 'CLICKS':      return toNum(s.clicks) || null
      case 'FREQUENCY':   return toNum(s.frequency) || null
      default:            return null
    }
  }).filter((v): v is number => v !== null)

  if (values.length === 0) return null

  const SUM_METRICS: MetricType[] = ['INVESTMENT', 'SPEND', 'IMPRESSIONS', 'REACH', 'CLICKS']
  if (SUM_METRICS.includes(metric)) return values.reduce((a, b) => a + b, 0)

  return values.reduce((a, b) => a + b, 0) / values.length
}

// ── Trend signal ──────────────────────────────────────────────────────────────

function computeTrend(
  recent:       Snapshot[],
  prior:        Snapshot[],
  metric:       MetricType,
  businessType: BusinessType,
): number | null {
  const recentVal = aggregateSnapshots(recent, metric, businessType)
  const priorVal  = aggregateSnapshots(prior,  metric, businessType)
  if (recentVal === null || priorVal === null || priorVal === 0) return null
  return ((recentVal - priorVal) / Math.abs(priorVal)) * 100
}

/**
 * Adjusts MTD status using the trend signal.
 * Worsening trend (≥ THRESHOLD in the wrong direction) → lower one level.
 * Improving trend (≥ THRESHOLD in the right direction) → raise one level.
 */
function applyTrend(
  mtdStatus:    HealthStatus,
  trendPct:     number | null,
  lowerIsBetter: boolean,
): HealthStatus {
  if (trendPct === null) return mtdStatus

  const isWorsening = lowerIsBetter
    ? trendPct >=  TREND_THRESHOLD_PCT
    : trendPct <= -TREND_THRESHOLD_PCT

  const isImproving = lowerIsBetter
    ? trendPct <= -TREND_THRESHOLD_PCT
    : trendPct >=  TREND_THRESHOLD_PCT

  if (isWorsening) {
    if (mtdStatus === 'OTIMO')   return 'REGULAR'
    if (mtdStatus === 'REGULAR') return 'RUIM'
  }
  if (isImproving) {
    if (mtdStatus === 'RUIM')    return 'REGULAR'
    if (mtdStatus === 'REGULAR') return 'OTIMO'
  }
  return mtdStatus
}

// ── Core processing ───────────────────────────────────────────────────────────

function computeAchievementPct(actual: number, target: number, lowerIsBetter: boolean): number {
  if (target === 0) return 0
  return lowerIsBetter ? (target / actual) * 100 : (actual / target) * 100
}

export type ScoredMetric = {
  metric:        MetricType
  status:        HealthStatus
  achievementPct: number
  trendPct:      number | null
}

async function processGoals(
  clientId:    string,
  goals:       { id: string; metric: MetricType; period: 'WEEKLY' | 'MONTHLY'; targetValue: { toNumber: () => number } | number }[],
  snapshots:   Snapshot[],
  periodStart: Date,
  periodEnd:   Date,
  opts: {
    businessType: BusinessType
    trendRecent?: Snapshot[]
    trendPrior?:  Snapshot[]
  },
): Promise<{ created: number; updated: number; scores: ScoredMetric[] }> {
  let created = 0
  let updated = 0
  const scores: ScoredMetric[] = []

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startDay = new Date(periodStart); startDay.setHours(0, 0, 0, 0)
  const endDay   = new Date(periodEnd);   endDay.setHours(0, 0, 0, 0)

  const periodInProgress = today < endDay
  const totalDays   = Math.round((endDay.getTime() - startDay.getTime()) / 86_400_000) + 1
  const elapsedDays = Math.min(
    Math.floor((today.getTime() - startDay.getTime()) / 86_400_000) + 1,
    totalDays,
  )
  const elapsedFraction = Math.max(elapsedDays, 1) / totalDays

  for (const goal of goals) {
    const actual = aggregateSnapshots(snapshots, goal.metric, opts.businessType)
    if (actual === null) continue

    const rawTarget     = typeof goal.targetValue === 'number' ? goal.targetValue : goal.targetValue.toNumber()
    const lowerIsBetter = LOWER_IS_BETTER.has(goal.metric)

    const target = (periodInProgress && PRORATE_METRICS.has(goal.metric))
      ? rawTarget * elapsedFraction
      : rawTarget

    const pct       = computeAchievementPct(actual, target, lowerIsBetter)
    const mtdStatus = classifyHealth(lowerIsBetter ? target : actual, lowerIsBetter ? actual : target)

    // Trend: only for MONTHLY scores; weekly already reflects the recent window
    let trendPct: number | null = null
    let finalStatus = mtdStatus
    if (goal.period === 'MONTHLY' && opts.trendRecent && opts.trendPrior) {
      trendPct    = computeTrend(opts.trendRecent, opts.trendPrior, goal.metric, opts.businessType)
      finalStatus = applyTrend(mtdStatus, trendPct, lowerIsBetter)
    }

    const scoreData = {
      clientId,
      goalId:         goal.id,
      metric:         goal.metric,
      period:         goal.period,
      periodStart,
      periodEnd,
      targetValue:    target,
      actualValue:    actual,
      achievementPct: pct,
      status:         finalStatus,
      trendPct:       trendPct ?? undefined,
      calculatedAt:   new Date(),
    }

    const existing = await prisma.healthScore.findUnique({
      where: { clientId_goalId_periodStart: { clientId, goalId: goal.id, periodStart } },
    })

    if (existing) {
      await prisma.healthScore.update({
        where: { id: existing.id },
        data: {
          actualValue:    actual,
          achievementPct: pct,
          status:         finalStatus,
          trendPct:       trendPct ?? null,
          calculatedAt:   new Date(),
        },
      })
      updated++
    } else {
      await prisma.healthScore.create({ data: scoreData })
      created++
    }

    scores.push({ metric: goal.metric, status: finalStatus, achievementPct: pct, trendPct })
  }

  return { created, updated, scores }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function recalculateClientHealth(clientId: string): Promise<{
  created: number
  updated: number
  scores: ScoredMetric[]
}> {
  const { start: weekStart,  end: weekEnd  } = getWeekRange()
  const { start: monthStart, end: monthEnd } = getMonthRange()
  const today = new Date()

  const client = await prisma.client.findUnique({
    where:  { id: clientId },
    select: { businessType: true },
  })
  const businessType: BusinessType = client?.businessType ?? 'ECOMMERCE'

  const snapInclude = { platformAccount: { select: { platform: true } } } as const

  // ── Current week ──────────────────────────────────────────────────────────
  const weeklyGoals = await prisma.goal.findMany({
    where: { clientId, period: 'WEEKLY', startDate: { lte: weekEnd }, endDate: { gte: weekStart } },
  })
  const weeklySnapshots = await prisma.metricSnapshot.findMany({
    where: { clientId, date: { gte: weekStart, lte: weekEnd } },
    include: snapInclude,
  })
  const weeklyResult = await processGoals(
    clientId, weeklyGoals, weeklySnapshots, weekStart, weekEnd,
    { businessType },
  )

  // ── Previous week (finalise with late-arriving data) ─────────────────────
  const { start: prevWeekStart, end: prevWeekEnd } = getWeekRange(
    new Date(today.getTime() - 7 * 86_400_000),
  )
  const prevWeeklyGoals = await prisma.goal.findMany({
    where: { clientId, period: 'WEEKLY', startDate: { lte: prevWeekEnd }, endDate: { gte: prevWeekStart } },
  })
  const prevWeeklySnapshots = await prisma.metricSnapshot.findMany({
    where: { clientId, date: { gte: prevWeekStart, lte: prevWeekEnd } },
    include: snapInclude,
  })
  await processGoals(
    clientId, prevWeeklyGoals, prevWeeklySnapshots, prevWeekStart, prevWeekEnd,
    { businessType },
  )

  // ── Monthly + trend ───────────────────────────────────────────────────────
  const monthlyGoals = await prisma.goal.findMany({
    where: { clientId, period: 'MONTHLY', startDate: { lte: monthEnd }, endDate: { gte: monthStart } },
  })
  const monthlySnapshots = await prisma.metricSnapshot.findMany({
    where: { clientId, date: { gte: monthStart, lte: today } },
    include: snapInclude,
  })

  const trendRecentStart = new Date(today.getTime() - 7  * 86_400_000)
  const trendPriorStart  = new Date(today.getTime() - 14 * 86_400_000)
  const [trendRecent, trendPrior] = await Promise.all([
    prisma.metricSnapshot.findMany({
      where: { clientId, date: { gte: trendRecentStart, lte: today } },
      include: snapInclude,
    }),
    prisma.metricSnapshot.findMany({
      where: { clientId, date: { gte: trendPriorStart, lt: trendRecentStart } },
      include: snapInclude,
    }),
  ])

  const monthlyResult = await processGoals(
    clientId, monthlyGoals, monthlySnapshots, monthStart, monthEnd,
    { businessType, trendRecent, trendPrior },
  )

  return {
    created: weeklyResult.created + monthlyResult.created,
    updated: weeklyResult.updated + monthlyResult.updated,
    scores:  [...weeklyResult.scores, ...monthlyResult.scores],
  }
}

// ── Streak ────────────────────────────────────────────────────────────────────

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

  const status: HealthStatus =
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
    const prevStatus = existing?.status ?? null
    await prisma.clientStatusStreak.upsert({
      where:  { clientId },
      update: { status, prevStatus, since: today, days: 1 },
      create: { clientId, status, prevStatus: prevStatus ?? undefined, since: today, days: 1 },
    })
  }
}

// ── Batch ─────────────────────────────────────────────────────────────────────

export async function recalculateAllClientsHealth(): Promise<{
  clientsProcessed: number
  totalCreated: number
  totalUpdated: number
  failed: number
}> {
  const clients = await prisma.client.findMany({
    where:  { status: 'ACTIVE' },
    select: { id: true },
  })

  let totalCreated = 0
  let totalUpdated = 0
  let failed = 0

  // Resiliência (CLAUDE.md regra 7): a falha em um cliente NÃO pode derrubar a
  // rotina inteira — isola cada cliente em try/catch e segue para o próximo.
  for (const client of clients) {
    try {
      const result = await recalculateClientHealth(client.id)
      totalCreated += result.created
      totalUpdated += result.updated
      await updateStreak(client.id)
    } catch (err) {
      failed++
      console.error(`[health-scorer] falha ao recalcular cliente ${client.id}:`, err)
    }
  }

  return { clientsProcessed: clients.length, totalCreated, totalUpdated, failed }
}
