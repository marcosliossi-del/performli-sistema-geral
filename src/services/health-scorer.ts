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
  // GA4 tem spend=0; ad platforms (Meta/Google) têm spend>0.
  // Sessões vêm do GA4 (clicks); spend/impressões vêm dos ad platforms.
  // Helpers: separa GA4 de plataformas de anúncio pelo campo platform
  const isGA4 = (x: Snapshot) => x.platformAccount.platform === 'GA4'
  const isAd  = (x: Snapshot) => x.platformAccount.platform !== 'GA4'

  // Receita e compras sempre do GA4
  const ga4Revenue  = snapshots.filter(isGA4).reduce((s, x) => s + toNum(x.conversionValue), 0)
  const ga4Purchases = snapshots.filter(isGA4).reduce((s, x) => s + toNum(x.conversions), 0)
  const ga4Sessions  = snapshots.filter(isGA4).reduce((s, x) => s + toNum(x.clicks), 0)
  // Investimento de todas as plataformas de anúncio
  const totalSpend   = snapshots.filter(isAd).reduce((s, x) => s + toNum(x.spend), 0)

  if (metric === 'TAXA_CONVERSAO') {
    return ga4Sessions > 0 && ga4Purchases > 0 ? (ga4Purchases / ga4Sessions) * 100 : null
  }

  if (metric === 'TICKET_MEDIO') {
    return ga4Purchases > 0 && ga4Revenue > 0 ? ga4Revenue / ga4Purchases : null
  }

  if (metric === 'CPS') {
    return ga4Sessions > 0 && totalSpend > 0 ? totalSpend / ga4Sessions : null
  }

  if (metric === 'CPM') {
    const adImpressions = snapshots.filter(isAd).reduce((s, x) => s + toNum(x.impressions), 0)
    return adImpressions > 0 && totalSpend > 0 ? (totalSpend / adImpressions) * 1000 : null
  }

  if (metric === 'FATURAMENTO') {
    return ga4Revenue > 0 ? ga4Revenue : null
  }

  // Helper de compras (usado abaixo)
  const purchasesNoDouble = (() => ga4Purchases)

  if (metric === 'ROAS') {
    // GA4 receita / investimento total (Meta + Google + TikTok)
    return totalSpend > 0 && ga4Revenue > 0 ? ga4Revenue / totalSpend : null
  }

  if (metric === 'CPA') {
    const spend = snapshots.filter((x) => toNum(x.spend) > 0).reduce((s, x) => s + toNum(x.spend), 0)
    const purchases = purchasesNoDouble()
    return spend > 0 && purchases > 0 ? spend / purchases : null
  }

  if (metric === 'CPL') {
    const spend = snapshots.filter((x) => toNum(x.spend) > 0).reduce((s, x) => s + toNum(x.spend), 0)
    const purchases = purchasesNoDouble()
    return spend > 0 && purchases > 0 ? spend / purchases : null
  }

  if (metric === 'CAC') {
    // CAC = spend / novos compradores (purchases GA4)
    const spend     = snapshots.filter((x) => toNum(x.spend) > 0).reduce((s, x) => s + toNum(x.spend), 0)
    const purchases = snapshots.filter((x) => toNum(x.spend) === 0).reduce((s, x) => s + toNum(x.conversions), 0)
    return spend > 0 && purchases > 0 ? spend / purchases : null
  }

  if (metric === 'CONVERSIONS') {
    const val = purchasesNoDouble()
    return val > 0 ? val : null
  }

  if (metric === 'SALES') {
    // Same as FATURAMENTO — prefer GA4 revenue
    const ga4Rev = snapshots.filter((x) => toNum(x.spend) === 0).reduce((s, x) => s + toNum(x.conversionValue), 0)
    const adRev  = snapshots.filter((x) => toNum(x.spend) > 0).reduce((s, x) => s + toNum(x.conversionValue), 0)
    const total  = ga4Rev > 0 ? ga4Rev : adRev
    return total > 0 ? total : null
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

  for (const goal of goals) {
    const actual = aggregateSnapshots(snapshots, goal.metric)
    if (actual === null) continue

    const target = typeof goal.targetValue === 'number' ? goal.targetValue : goal.targetValue.toNumber()
    const lowerIsBetter = LOWER_IS_BETTER.has(goal.metric)
    const pct = computeAchievementPct(actual, target, lowerIsBetter)
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

  // ── Weekly goals ──────────────────────────────────────────────────────────
  const weeklyGoals = await prisma.goal.findMany({
    where: {
      clientId,
      period: 'WEEKLY',
      startDate: { lte: weekEnd },
      endDate:   { gte: weekStart },
    },
  })

  const snapInclude = { platformAccount: { select: { platform: true } } } as const

  const weeklySnapshots = await prisma.metricSnapshot.findMany({
    where: { clientId, date: { gte: weekStart, lte: weekEnd } },
    include: snapInclude,
  })

  const weeklyResult = await processGoals(clientId, weeklyGoals, weeklySnapshots, weekStart, weekEnd)

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
    created: weeklyResult.created + monthlyResult.created,
    updated: weeklyResult.updated + monthlyResult.updated,
    scores: [...weeklyResult.scores, ...monthlyResult.scores],
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
  }

  return { clientsProcessed: clients.length, totalCreated, totalUpdated }
}
