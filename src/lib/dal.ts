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
  const prevWeekStart = new Date(weekStart)
  prevWeekStart.setDate(prevWeekStart.getDate() - 7)

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
        where: { periodStart: { gte: prevWeekStart } },
        orderBy: { calculatedAt: 'desc' },
      },
    },
    orderBy: { name: 'asc' },
  })

  const summaries: ClientHealthSummary[] = clients.map((client) => {
    const allScores = client.healthScores
    const scores = allScores.filter((s) => s.periodStart >= weekStart)
    const prevScores = allScores.filter((s) => s.periodStart < weekStart)

    const avgOf = (arr: typeof scores) =>
      arr.length > 0
        ? arr.reduce((sum, s) => sum + Number(s.achievementPct), 0) / arr.length
        : 0

    const avgPct = avgOf(scores)
    const prevAvgPct = avgOf(prevScores)

    const trend: 'up' | 'down' | 'stable' =
      scores.length === 0 || prevScores.length === 0
        ? 'stable'
        : avgPct > prevAvgPct + 2
        ? 'up'
        : avgPct < prevAvgPct - 2
        ? 'down'
        : 'stable'

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
      trend,
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

// ─── Clients for select dropdowns ─────────────────────────────────────────────

export const getClientsForSelect = cache(async (userId: string, role: string) => {
  const where: Prisma.ClientWhereInput =
    role === 'ADMIN' ? {} : { assignments: { some: { userId } } }

  return prisma.client.findMany({
    where,
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' },
  })
})

// ─── Operations ───────────────────────────────────────────────────────────────

export const getOperations = cache(async (
  userId: string,
  role: string,
  filters: { clientId?: string; search?: string; page?: number } = {}
) => {
  const { clientId, search, page = 1 } = filters
  const PER_PAGE = 20

  const where: Prisma.OperationWhereInput = {
    ...(role !== 'ADMIN' && { client: { assignments: { some: { userId } } } }),
    ...(clientId && { clientId }),
    ...(search && {
      OR: [
        { subject: { contains: search, mode: 'insensitive' } },
        { requested: { contains: search, mode: 'insensitive' } },
        { done: { contains: search, mode: 'insensitive' } },
      ],
    }),
  }

  const [items, total] = await Promise.all([
    prisma.operation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        client: { select: { name: true, slug: true } },
        user: { select: { name: true } },
      },
    }),
    prisma.operation.count({ where }),
  ])

  return { items, total, page, perPage: PER_PAGE, totalPages: Math.ceil(total / PER_PAGE) }
})

// ─── Reports ──────────────────────────────────────────────────────────────────

export type ReportWeek = {
  label: string        // "17/03 – 23/03"
  start: Date
  end: Date
  offset: number       // 0 = current, -1 = last week, etc.
}

export function getWeekOptions(count = 8): ReportWeek[] {
  const weeks: ReportWeek[] = []
  for (let i = 0; i > -count; i--) {
    const anchor = new Date()
    anchor.setDate(anchor.getDate() + i * 7)
    const { start, end } = getWeekRange(anchor)
    const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    weeks.push({ label: `${fmt(start)} – ${fmt(end)}`, start, end, offset: i })
  }
  return weeks
}

export const getReportData = cache(async (
  clientId: string,
  weekStart: Date,
  weekEnd: Date
) => {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, slug: true },
  })
  if (!client) return null

  const goals = await prisma.goal.findMany({
    where: {
      clientId,
      period: 'WEEKLY',
      startDate: { lte: weekEnd },
      endDate: { gte: weekStart },
    },
    include: {
      healthScores: {
        where: { periodStart: { gte: weekStart, lte: weekEnd } },
        orderBy: { calculatedAt: 'desc' },
        take: 1,
      },
    },
  })

  const metrics = goals.map((g) => {
    const hs = g.healthScores[0]
    return {
      metric: g.metric,
      label: metricLabels[g.metric] ?? g.metric,
      target: Number(g.targetValue),
      actual: hs ? Number(hs.actualValue) : null,
      status: hs?.status ?? null,
      pct: hs ? Math.round(Number(hs.achievementPct)) : null,
      lowerIsBetter: ['CPL', 'CPA', 'CPC'].includes(g.metric),
      unit: ['CPL', 'CPA', 'CPC', 'INVESTMENT', 'SPEND'].includes(g.metric)
        ? 'R$'
        : g.metric === 'CTR'
        ? '%'
        : g.metric === 'ROAS'
        ? 'x'
        : '',
    }
  })

  return { client, metrics }
})

// ─── Tasks ────────────────────────────────────────────────────────────────────

export const getTasks = cache(async (userId: string, role: string) => {
  const where =
    role === 'ADMIN'
      ? {}
      : { assignedTo: userId }

  return prisma.task.findMany({
    where,
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    include: {
      client: { select: { name: true, slug: true } },
      user: { select: { name: true } },
    },
  })
})

// ─── Team ─────────────────────────────────────────────────────────────────────

export const getTeamMembers = cache(async () => {
  return prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      avatarUrl: true,
      createdAt: true,
      _count: { select: { managedClients: true } },
    },
  })
})

// ─── Managers overview ────────────────────────────────────────────────────────

export type ManagerClientRow = {
  id: string
  name: string
  slug: string
  overallStatus: HealthStatus | null
  platforms: string[]
  goalsTotal: number
  goalsHit: number   // metas com status OTIMO
}

export type ManagerWithStats = {
  id: string
  name: string
  role: string
  clientCount: number
  goalsHit: number   // clientes com overallStatus OTIMO ("meta batida")
  goalsOff: number   // clientes com overallStatus RUIM ou sem dados
  clients: ManagerClientRow[]
}

export const getManagersOverview = cache(async (): Promise<ManagerWithStats[]> => {
  const { start: weekStart } = getWeekRange()

  // Todos os usuários com atribuições a clientes ativos
  const users = await prisma.user.findMany({
    where: {
      active: true,
      managedClients: { some: { client: { status: 'ACTIVE' } } },
    },
    select: {
      id: true,
      name: true,
      role: true,
      managedClients: {
        where: { client: { status: 'ACTIVE' } },
        include: {
          client: {
            include: {
              platformAccounts: { where: { active: true }, select: { platform: true } },
              healthScores: {
                where: { periodStart: { gte: weekStart } },
                select: { status: true, metric: true },
              },
              goals: {
                where: {
                  period: 'WEEKLY',
                  startDate: { lte: new Date() },
                  endDate: { gte: weekStart },
                },
                select: { id: true },
              },
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  return users.map((user) => {
    const clientRows: ManagerClientRow[] = user.managedClients.map((assignment) => {
      const c = assignment.client
      const scores = c.healthScores

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
        overallStatus,
        platforms: [...new Set(c.platformAccounts.map((p) => p.platform))],
        goalsTotal: c.goals.length,
        goalsHit: scores.filter((s) => s.status === 'OTIMO').length,
      }
    })

    const goalsHit = clientRows.filter((c) => c.overallStatus === 'OTIMO').length
    const goalsOff = clientRows.filter(
      (c) => c.overallStatus === 'RUIM' || c.overallStatus === null
    ).length

    return {
      id: user.id,
      name: user.name,
      role: user.role,
      clientCount: clientRows.length,
      goalsHit,
      goalsOff,
      clients: clientRows,
    }
  })
})


export type AtRiskClient = {
  id: string
  name: string
  slug: string
  primaryManager: string | null
  consecutiveRuimWeeks: number
  riskLevel: 'ALTO' | 'MÉDIO' | 'BAIXO'
  worstMetric: string | null
  worstPct: number | null
}

export const getAtRiskClients = cache(async (userId: string, role: string): Promise<AtRiskClient[]> => {
  const where: Prisma.ClientWhereInput =
    role === 'ADMIN' ? { status: 'ACTIVE' } : { status: 'ACTIVE', assignments: { some: { userId } } }

  // Fetch clients with last 6 weeks of health scores
  const sixWeeksAgo = new Date()
  sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42)

  const clients = await prisma.client.findMany({
    where,
    select: {
      id: true,
      name: true,
      slug: true,
      assignments: {
        where: { isPrimary: true },
        include: { user: { select: { name: true } } },
        take: 1,
      },
      healthScores: {
        where: { periodStart: { gte: sixWeeksAgo } },
        orderBy: { periodStart: 'desc' },
        select: { periodStart: true, status: true, metric: true, achievementPct: true },
      },
    },
    orderBy: { name: 'asc' },
  })

  const result: AtRiskClient[] = []

  for (const client of clients) {
    // Group by week (periodStart)
    const byWeek = new Map<string, typeof client.healthScores>()
    for (const hs of client.healthScores) {
      const key = hs.periodStart.toISOString().slice(0, 10)
      if (!byWeek.has(key)) byWeek.set(key, [])
      byWeek.get(key)!.push(hs)
    }

    // Sort weeks descending
    const weeks = Array.from(byWeek.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))

    if (weeks.length === 0) continue

    // Determine overall status per week
    const weekStatuses = weeks.map(([, scores]) => {
      const isRuim = scores.some((s) => s.status === 'RUIM')
      const isRegular = scores.some((s) => s.status === 'REGULAR')
      return isRuim ? 'RUIM' : isRegular ? 'REGULAR' : 'OTIMO'
    })

    // Count consecutive RUIM weeks from the most recent
    let consecutiveRuimWeeks = 0
    for (const status of weekStatuses) {
      if (status === 'RUIM') consecutiveRuimWeeks++
      else break
    }

    if (consecutiveRuimWeeks === 0) continue // not at risk

    // Worst metric (lowest pct in most recent week)
    const latestWeekScores = weeks[0][1]
    const ruimScores = latestWeekScores
      .filter((s) => s.status === 'RUIM')
      .sort((a, b) => Number(a.achievementPct) - Number(b.achievementPct))

    const worst = ruimScores[0] ?? null

    result.push({
      id: client.id,
      name: client.name,
      slug: client.slug,
      primaryManager: client.assignments[0]?.user.name ?? null,
      consecutiveRuimWeeks,
      riskLevel: consecutiveRuimWeeks >= 3 ? 'ALTO' : consecutiveRuimWeeks >= 1 ? 'MÉDIO' : 'BAIXO',
      worstMetric: worst ? (metricLabels[worst.metric] ?? worst.metric) : null,
      worstPct: worst ? Math.round(Number(worst.achievementPct)) : null,
    })
  }

  // Sort by risk: ALTO first, then by consecutive weeks desc
  result.sort((a, b) => {
    if (a.riskLevel !== b.riskLevel) {
      const rank = { ALTO: 0, MÉDIO: 1, BAIXO: 2 }
      return rank[a.riskLevel] - rank[b.riskLevel]
    }
    return b.consecutiveRuimWeeks - a.consecutiveRuimWeeks
  })

  return result
})
