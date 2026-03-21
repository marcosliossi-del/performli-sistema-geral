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
