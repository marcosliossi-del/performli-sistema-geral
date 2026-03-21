/**
 * Health Scorer
 *
 * Recalcula os HealthScores de um cliente para a semana atual
 * a partir dos MetricSnapshots existentes no banco.
 *
 * Regras:
 *   ≥ 90% da meta  → OTIMO
 *   70–89%          → REGULAR
 *   < 70%           → RUIM
 *
 * Para métricas "lower is better" (CPL, CPA, CPC):
 *   achievement% = (target / actual) * 100
 *   ex: meta CPL = 25, actual = 20 → 125% → OTIMO
 *       meta CPL = 25, actual = 35 → 71%  → REGULAR
 */

import { prisma } from '@/lib/prisma'
import { classifyHealth } from '@/lib/health'
import { MetricType, HealthStatus } from '@prisma/client'
import { getWeekRange } from '@/lib/utils'

/** Métricas onde menor valor = melhor resultado */
const LOWER_IS_BETTER: Set<MetricType> = new Set([
  'CPL',
  'CPA',
  'CPC',
  'SPEND',
])

/** Agrega MetricSnapshots da semana em um único valor por métrica */
function aggregateSnapshots(
  snapshots: {
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
  }[],
  metric: MetricType
): number | null {
  const toNum = (v: unknown) => (v != null ? Number(v) : null)

  const values = snapshots.map((s) => {
    switch (metric) {
      case 'ROAS':         return toNum(s.roas)
      case 'CPL':          return toNum(s.cpl)
      case 'CPA':          return toNum(s.cpa)
      case 'INVESTMENT':
      case 'SPEND':        return toNum(s.spend)
      case 'CONVERSIONS':  return toNum(s.conversions)
      case 'SALES':        return toNum(s.conversionValue)
      case 'CTR':          return toNum(s.ctr)
      case 'CPC':          return toNum(s.cpc)
      case 'IMPRESSIONS':  return toNum(s.impressions)
      case 'REACH':        return toNum(s.reach)
      case 'CLICKS':       return toNum(s.clicks)
      case 'FREQUENCY':    return toNum(s.frequency)
      default:             return null
    }
  }).filter((v): v is number => v !== null)

  if (values.length === 0) return null

  // Sum-based metrics (totals)
  const SUM_METRICS: MetricType[] = ['INVESTMENT', 'SPEND', 'CONVERSIONS', 'SALES', 'IMPRESSIONS', 'REACH', 'CLICKS']
  if (SUM_METRICS.includes(metric)) {
    return values.reduce((a, b) => a + b, 0)
  }

  // Average-based metrics (rates)
  return values.reduce((a, b) => a + b, 0) / values.length
}

function computeAchievementPct(actual: number, target: number, lowerIsBetter: boolean): number {
  if (target === 0) return 0
  if (lowerIsBetter) {
    // lower actual = better: achievement = target / actual * 100
    return (target / actual) * 100
  }
  return (actual / target) * 100
}

export type ScoredMetric = { metric: MetricType; status: HealthStatus; achievementPct: number }

export async function recalculateClientHealth(clientId: string): Promise<{
  created: number
  updated: number
  scores: ScoredMetric[]
}> {
  const { start: weekStart, end: weekEnd } = getWeekRange()

  // Load active weekly goals for this client in the current week
  const goals = await prisma.goal.findMany({
    where: {
      clientId,
      period: 'WEEKLY',
      startDate: { lte: weekEnd },
      endDate:   { gte: weekStart },
    },
  })

  if (goals.length === 0) return { created: 0, updated: 0, scores: [] }

  // Load all MetricSnapshots for this client in the current week
  const snapshots = await prisma.metricSnapshot.findMany({
    where: {
      clientId,
      date: { gte: weekStart, lte: weekEnd },
    },
  })

  let created = 0
  let updated = 0
  const scores: ScoredMetric[] = []

  for (const goal of goals) {
    const actual = aggregateSnapshots(snapshots as Parameters<typeof aggregateSnapshots>[0], goal.metric)

    if (actual === null) continue // no data yet

    const target = Number(goal.targetValue)
    const lowerIsBetter = LOWER_IS_BETTER.has(goal.metric)
    const pct = computeAchievementPct(actual, target, lowerIsBetter)
    const status = classifyHealth(lowerIsBetter ? target : actual, lowerIsBetter ? actual : target)

    const data = {
      clientId,
      goalId:        goal.id,
      metric:        goal.metric,
      period:        goal.period,
      periodStart:   weekStart,
      periodEnd:     weekEnd,
      targetValue:   target,
      actualValue:   actual,
      achievementPct: pct,
      status,
      calculatedAt:  new Date(),
    }

    const existing = await prisma.healthScore.findUnique({
      where: { clientId_goalId_periodStart: { clientId, goalId: goal.id, periodStart: weekStart } },
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
