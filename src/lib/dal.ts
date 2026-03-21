import 'server-only'
import { cache } from 'react'
import { prisma } from './prisma'
import { getSession } from './session'
import { redirect } from 'next/navigation'
import { HealthStatus, Prisma } from '@prisma/client'
import { getWeekRange } from './utils'

// ─── Auth guard ───────────────────────────────────────────────────────────────

export const requireSession = cache(async () => {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
})

// ─── Dashboard ────────────────────────────────────────────────────────────────

export type ClientHealthSummary = {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  primaryManager: string | null
  overallStatus: HealthStatus
  achievementPct: number
  trend: 'up' | 'down' | 'stable'
  metrics: { name: string; status: HealthStatus; pct: number }[]
}

export const getDashboardData = cache(async (userId: string, role: string) => {
  const { start: weekStart } = getWeekRange()

  // For MANAGER: only their clients. For ADMIN: all clients.
  const clientsWhere: Prisma.ClientWhereInput =
    role === 'ADMIN'
      ? { status: 'ACTIVE' }
      : { status: 'ACTIVE', assignments: { some: { userId } } }

  const clients = await prisma.client.findMany({
    where: clientsWhere,
    include: {
      assignments: {
        where: { isPrimary: true },
        include: { user: { select: { name: true } } },
        take: 1,
      },
      healthScores: {
        where: { periodStart: { gte: weekStart } },
        orderBy: { calculatedAt: 'desc' },
      },
    },
    orderBy: { name: 'asc' },
  })

  const summaries: ClientHealthSummary[] = clients.map((client) => {
    const scores = client.healthScores
    const avgPct =
      scores.length > 0
        ? scores.reduce((sum, s) => sum + Number(s.achievementPct), 0) / scores.length
        : 0

    // Overall = worst status
    const overallStatus: HealthStatus =
      scores.some((s) => s.status === 'RUIM')
        ? 'RUIM'
        : scores.some((s) => s.status === 'REGULAR')
        ? 'REGULAR'
        : scores.length > 0
        ? 'OTIMO'
        : 'RUIM'

    return {
      id: client.id,
      name: client.name,
      slug: client.slug,
      logoUrl: client.logoUrl,
      primaryManager: client.assignments[0]?.user.name ?? null,
      overallStatus,
      achievementPct: Math.round(avgPct),
      trend: 'stable' as const, // TODO: compare with previous week
      metrics: scores.slice(0, 4).map((s) => ({
        name: s.metric,
        status: s.status,
        pct: Math.round(Number(s.achievementPct)),
      })),
    }
  })

  const otimo = summaries.filter((c) => c.overallStatus === 'OTIMO').length
  const regular = summaries.filter((c) => c.overallStatus === 'REGULAR').length
  const ruim = summaries.filter((c) => c.overallStatus === 'RUIM').length

  // Recent alerts
  const alerts = await prisma.alert.findMany({
    where:
      role === 'ADMIN'
        ? { read: false }
        : { read: false, client: { assignments: { some: { userId } } } },
    include: { client: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  return { clients: summaries, totals: { total: summaries.length, otimo, regular, ruim }, alerts }
})

// ─── Clients list ─────────────────────────────────────────────────────────────

export type ClientListItem = {
  id: string
  name: string
  slug: string
  industry: string | null
  status: string
  primaryManager: string | null
  overallStatus: HealthStatus | null
  achievementPct: number
  platforms: string[]
}

export const getClientsList = cache(async (userId: string, role: string) => {
  const { start: weekStart } = getWeekRange()

  const where: Prisma.ClientWhereInput =
    role === 'ADMIN'
      ? {}
      : { assignments: { some: { userId } } }

  const clients = await prisma.client.findMany({
    where,
    include: {
      assignments: {
        where: { isPrimary: true },
        include: { user: { select: { name: true } } },
        take: 1,
      },
      platformAccounts: { where: { active: true }, select: { platform: true } },
      healthScores: {
        where: { periodStart: { gte: weekStart } },
        select: { status: true, achievementPct: true },
      },
    },
    orderBy: { name: 'asc' },
  })

  return clients.map((c): ClientListItem => {
    const scores = c.healthScores
    const avgPct =
      scores.length > 0
        ? scores.reduce((sum, s) => sum + Number(s.achievementPct), 0) / scores.length
        : 0

    const overallStatus: HealthStatus | null =
      scores.length === 0
        ? null
        : scores.some((s) => s.status === 'RUIM')
        ? 'RUIM'
        : scores.some((s) => s.status === 'REGULAR')
        ? 'REGULAR'
        : 'OTIMO'

    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      industry: c.industry,
      status: c.status,
      primaryManager: c.assignments[0]?.user.name ?? null,
      overallStatus,
      achievementPct: Math.round(avgPct),
      platforms: [...new Set(c.platformAccounts.map((p) => p.platform))],
    }
  })
})

// ─── Client detail ────────────────────────────────────────────────────────────

export const getClientDetail = cache(async (slug: string) => {
  const { start: weekStart, end: weekEnd } = getWeekRange()

  const client = await prisma.client.findUnique({
    where: { slug },
    include: {
      assignments: {
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      },
      platformAccounts: { where: { active: true } },
      goals: {
        where: { period: 'WEEKLY', startDate: { lte: weekEnd }, endDate: { gte: weekStart } },
        include: {
          healthScores: {
            where: { periodStart: { gte: weekStart } },
            orderBy: { calculatedAt: 'desc' },
            take: 1,
          },
        },
      },
      alerts: {
        where: { read: false },
        orderBy: { createdAt: 'desc' },
        take: 3,
      },
      operations: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { user: { select: { name: true } } },
      },
    },
  })

  return client
})

// ─── Metric labels ────────────────────────────────────────────────────────────

export const metricLabels: Record<string, string> = {
  ROAS: 'ROAS',
  CPL: 'CPL',
  CPA: 'CPA',
  INVESTMENT: 'Investimento',
  CONVERSIONS: 'Conversões',
  SALES: 'Vendas',
  CTR: 'CTR',
  CPC: 'CPC',
  IMPRESSIONS: 'Impressões',
  REACH: 'Alcance',
  FREQUENCY: 'Frequência',
  CLICKS: 'Cliques',
  SPEND: 'Gasto',
}

// ─── Metric history (charts) ──────────────────────────────────────────────────

export type MetricHistoryPoint = {
  date: string // 'YYYY-MM-DD'
  spend: number | null
  impressions: number | null
  clicks: number | null
  reach: number | null
  conversions: number | null
  roas: number | null
  ctr: number | null
  cpc: number | null
  cpl: number | null
}

/**
 * Returns the last `days` of daily aggregated MetricSnapshots for a client
 * (summing across all platform accounts).
 */
export const getClientMetricHistory = cache(async (clientId: string, days = 14): Promise<MetricHistoryPoint[]> => {
  const since = new Date()
  since.setDate(since.getDate() - days + 1)
  since.setHours(0, 0, 0, 0)

  const snapshots = await prisma.metricSnapshot.findMany({
    where: { clientId, date: { gte: since } },
    orderBy: { date: 'asc' },
  })

  // Group by date string, aggregate across accounts
  const byDate = new Map<string, {
    spend: number; impressions: number; clicks: number; reach: number;
    conversions: number; conversionValue: number; hasData: boolean;
    ctrSum: number; cpcSum: number; cplSum: number; count: number;
  }>()

  for (const s of snapshots) {
    const key = s.date.toISOString().slice(0, 10)
    if (!byDate.has(key)) {
      byDate.set(key, { spend: 0, impressions: 0, clicks: 0, reach: 0, conversions: 0, conversionValue: 0, hasData: false, ctrSum: 0, cpcSum: 0, cplSum: 0, count: 0 })
    }
    const d = byDate.get(key)!
    d.hasData = true
    d.count++
    d.spend += Number(s.spend ?? 0)
    d.impressions += s.impressions ?? 0
    d.clicks += s.clicks ?? 0
    d.reach += s.reach ?? 0
    d.conversions += s.conversions ?? 0
    d.conversionValue += Number(s.conversionValue ?? 0)
    d.ctrSum += Number(s.ctr ?? 0)
    d.cpcSum += Number(s.cpc ?? 0)
    d.cplSum += Number(s.cpl ?? 0)
  }

  // Fill every day in range (including days with no data as null)
  const result: MetricHistoryPoint[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(since)
    d.setDate(since.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    const agg = byDate.get(key)

    if (!agg || !agg.hasData) {
      result.push({ date: key, spend: null, impressions: null, clicks: null, reach: null, conversions: null, roas: null, ctr: null, cpc: null, cpl: null })
    } else {
      const roas = agg.spend > 0 ? agg.conversionValue / agg.spend : null
      result.push({
        date: key,
        spend: agg.spend,
        impressions: agg.impressions || null,
        clicks: agg.clicks || null,
        reach: agg.reach || null,
        conversions: agg.conversions || null,
        roas,
        ctr: agg.count > 0 ? agg.ctrSum / agg.count : null,
        cpc: agg.count > 0 ? agg.cpcSum / agg.count : null,
        cpl: agg.count > 0 ? agg.cplSum / agg.count : null,
      })
    }
  }

  return result
})
