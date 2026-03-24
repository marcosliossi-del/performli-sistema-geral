import 'server-only'
import { cache } from 'react'
import { prisma } from './prisma'
import { getSession } from './session'
import { redirect } from 'next/navigation'
import { HealthStatus, Prisma } from '@prisma/client'
import { getWeekRange, getMonthRange } from './utils'

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

  // Recent alerts (non-oscillation)
  const alerts = await prisma.alert.findMany({
    where:
      role === 'ADMIN'
        ? { read: false, type: { notIn: ['KPI_DROP_24H', 'KPI_SPIKE_24H'] } }
        : { read: false, type: { notIn: ['KPI_DROP_24H', 'KPI_SPIKE_24H'] }, client: { assignments: { some: { userId } } } },
    include: { client: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  // Today's oscillation alerts (KPI_DROP_24H / KPI_SPIKE_24H)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const oscillationAlerts = await prisma.alert.findMany({
    where:
      role === 'ADMIN'
        ? { type: { in: ['KPI_DROP_24H', 'KPI_SPIKE_24H'] }, createdAt: { gte: todayStart } }
        : {
            type: { in: ['KPI_DROP_24H', 'KPI_SPIKE_24H'] },
            createdAt: { gte: todayStart },
            client: { assignments: { some: { userId } } },
          },
    include: { client: { select: { name: true, slug: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  // Last sync timestamp (most recent lastSyncAt across all platform accounts)
  const lastSyncAccount = await prisma.platformAccount.findFirst({
    where:
      role === 'ADMIN'
        ? { active: true, lastSyncAt: { not: null } }
        : { active: true, lastSyncAt: { not: null }, client: { assignments: { some: { userId } } } },
    orderBy: { lastSyncAt: 'desc' },
    select: { lastSyncAt: true },
  })

  return {
    clients: summaries,
    totals: { total: summaries.length, otimo, regular, ruim },
    alerts,
    oscillationAlerts,
    lastSyncAt: lastSyncAccount?.lastSyncAt ?? null,
  }
})

// ─── Operational dashboard table ──────────────────────────────────────────────

export type ClientOperationalRow = {
  id: string
  name: string
  slug: string
  primaryManager: string | null
  // e-commerce KPIs (current month, null = no data yet)
  vendas: number | null         // conversions (purchases)
  cpa: number | null            // cost per acquisition
  roas: number | null           // return on ad spend
  gasto: number | null          // total ad spend
  cps: number | null            // cost per session
  taxaConversao: number | null  // conversion rate %
  // health
  overallStatus: HealthStatus | null
  // budget
  budgetConsumed: number | null  // actual spend this week
  budgetPlanned: number | null   // target spend from Goal (SPEND/WEEKLY)
}

export const getClientsOperationalTable = cache(async (
  userId: string,
  role: string,
): Promise<ClientOperationalRow[]> => {
  const today = new Date()
  const { start: monthStart } = getMonthRange(today)

  const where: Prisma.ClientWhereInput =
    role === 'ADMIN'
      ? { status: 'ACTIVE' }
      : { status: 'ACTIVE', assignments: { some: { userId } } }

  const { start: weekStart, end: weekEnd } = getWeekRange()

  const clients = await prisma.client.findMany({
    where,
    include: {
      assignments: {
        where: { isPrimary: true },
        include: { user: { select: { name: true } } },
        take: 1,
      },
      metricSnapshots: {
        where: { date: { gte: monthStart, lte: today } },
        select: {
          spend: true,
          clicks: true,
          conversions: true,
          conversionValue: true,
          date: true,
        },
      },
      healthScores: {
        where: { periodStart: { gte: weekStart } },
        select: { status: true },
      },
      goals: {
        where: {
          metric: 'SPEND',
          period: 'WEEKLY',
          startDate: { lte: weekEnd },
          endDate: { gte: weekStart },
        },
        select: { targetValue: true },
        take: 1,
      },
    },
    orderBy: { name: 'asc' },
  })

  return clients.map((c): ClientOperationalRow => {
    const snaps = c.metricSnapshots

    const ga4  = snaps.filter((x) => Number(x.spend ?? 0) === 0)
    const ads  = snaps.filter((x) => Number(x.spend ?? 0) > 0)

    const spend     = ads.reduce((s, x) => s + Number(x.spend ?? 0), 0)
    const sessions  = ga4.reduce((s, x) => s + (x.clicks ?? 0), 0)
    const purchases = snaps.reduce((s, x) => s + (x.conversions ?? 0), 0)
    const ga4Rev    = ga4.reduce((s, x) => s + Number(x.conversionValue ?? 0), 0)
    const adRev     = ads.reduce((s, x) => s + Number(x.conversionValue ?? 0), 0)
    const revenue   = ga4Rev > 0 ? ga4Rev : adRev

    const roas          = spend > 0 && revenue > 0 ? revenue / spend : null
    const cpa           = spend > 0 && purchases > 0 ? spend / purchases : null
    const cps           = spend > 0 && sessions > 0 ? spend / sessions : null
    const taxaConversao = sessions > 0 && purchases > 0 ? (purchases / sessions) * 100 : null

    const scores = c.healthScores
    const overallStatus: HealthStatus | null =
      scores.length === 0
        ? null
        : scores.some((s) => s.status === 'RUIM')
        ? 'RUIM'
        : scores.some((s) => s.status === 'REGULAR')
        ? 'REGULAR'
        : 'OTIMO'

    // Budget: consumed = this week's spend, planned = SPEND/WEEKLY goal
    const weekSnaps = ads.filter((x) => {
      const d = new Date(x.date)
      return d >= weekStart && d <= weekEnd
    })
    const budgetConsumed = weekSnaps.reduce((s, x) => s + Number(x.spend ?? 0), 0)
    const budgetPlanned = c.goals[0] ? Number(c.goals[0].targetValue) : null

    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      primaryManager: c.assignments[0]?.user.name ?? null,
      vendas: purchases > 0 ? purchases : null,
      cpa,
      roas,
      gasto: spend > 0 ? spend : null,
      cps,
      taxaConversao,
      overallStatus,
      budgetConsumed: budgetConsumed > 0 ? budgetConsumed : null,
      budgetPlanned,
    }
  })
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
  const { start: monthStart, end: monthEnd } = getMonthRange()

  const client = await prisma.client.findUnique({
    where: { slug },
    include: {
      assignments: {
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      },
      platformAccounts: { where: { active: true } },
      goals: {
        where: {
          OR: [
            { period: 'WEEKLY',  startDate: { lte: weekEnd },  endDate: { gte: weekStart } },
            { period: 'MONTHLY', startDate: { lte: monthEnd }, endDate: { gte: monthStart } },
          ],
        },
        include: {
          healthScores: {
            where: {
              OR: [
                { periodStart: { gte: weekStart } },
                { periodStart: { gte: monthStart } },
              ],
            },
            orderBy: { calculatedAt: 'desc' },
            take: 1,
          },
        },
        orderBy: [{ period: 'asc' }, { createdAt: 'asc' }],
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

// ─── Client KPIs (current month computed) ─────────────────────────────────────

export type ClientKPIs = {
  periodLabel: string
  daysElapsed: number
  daysInMonth: number
  // Financeiro
  faturamento: number
  faturamentoTrend: number | null
  investimento: number
  investimentoTrend: number | null
  roas: number | null
  roasTrend: number | null
  projecaoMes: number | null
  // Conversão
  compras: number
  comprasTrend: number | null
  taxaConversao: number | null
  taxaConversaoTrend: number | null
  ticketMedio: number | null
  ticketMedioTrend: number | null
  // Tráfego
  sessoes: number
  sessoesTrend: number | null
  cps: number | null
  cpsTrend: number | null
  cpm: number | null
  cpmTrend: number | null
  cpa: number | null
  cpaTrend: number | null
}

export const getClientKPIs = cache(async (clientId: string): Promise<ClientKPIs> => {
  const today = new Date()
  const { start: monthStart } = getMonthRange(today)
  const daysElapsed = today.getDate()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()

  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const lastMonthSameDay = new Date(today.getFullYear(), today.getMonth() - 1, daysElapsed)
  lastMonthSameDay.setHours(23, 59, 59, 999)

  const [currSnaps, prevSnaps] = await Promise.all([
    prisma.metricSnapshot.findMany({ where: { clientId, date: { gte: monthStart, lte: today } } }),
    prisma.metricSnapshot.findMany({ where: { clientId, date: { gte: lastMonthStart, lte: lastMonthSameDay } } }),
  ])

  /**
   * Separamos GA4 (spend=0) dos ad platforms (spend>0) para evitar misturar:
   *  - sessões GA4 com cliques de anúncio (Meta)
   *  - impressões de página (GA4) com impressões de anúncio (Meta) para CPM
   *  - all-events-conversions (GA4) com purchase-conversions (Meta)
   */
  function compute(snaps: typeof currSnaps) {
    const ga4  = snaps.filter((x) => Number(x.spend ?? 0) === 0)
    const ads  = snaps.filter((x) => Number(x.spend ?? 0) > 0)

    const spend       = ads.reduce((s, x) => s + Number(x.spend ?? 0), 0)
    const adImpr      = ads.reduce((s, x) => s + (x.impressions ?? 0), 0)  // impressões de anúncio
    const sessions    = ga4.reduce((s, x) => s + (x.clicks ?? 0), 0)       // sessões do site (GA4)

    // Compras: ecommercePurchases do GA4 + actions_purchase do Meta (ambos já corrigidos nos transformers)
    const purchases   = snaps.reduce((s, x) => s + (x.conversions ?? 0), 0)

    // Faturamento: prefere GA4 totalRevenue (todas as vendas), cai em Meta se GA4 = 0
    const ga4Revenue  = ga4.reduce((s, x) => s + Number(x.conversionValue ?? 0), 0)
    const adRevenue   = ads.reduce((s, x) => s + Number(x.conversionValue ?? 0), 0)
    const revenue     = ga4Revenue > 0 ? ga4Revenue : adRevenue

    return {
      spend, sessions, purchases, revenue, adImpr,
      roas:          spend > 0 && revenue > 0 ? revenue / spend : null,
      ticketMedio:   purchases > 0 && revenue > 0 ? revenue / purchases : null,
      taxaConversao: sessions > 0 && purchases > 0 ? (purchases / sessions) * 100 : null,
      cps:           sessions > 0 && spend > 0 ? spend / sessions : null,
      cpm:           adImpr > 0 && spend > 0 ? (spend / adImpr) * 1000 : null,
      cpa:           purchases > 0 && spend > 0 ? spend / purchases : null,
    }
  }

  const curr = compute(currSnaps)
  const prev = compute(prevSnaps)

  const pctChange = (c: number | null, p: number | null): number | null =>
    c !== null && p !== null && p !== 0 ? ((c - p) / Math.abs(p)) * 100 : null

  const projecaoMes = daysElapsed > 0 && curr.revenue > 0
    ? (curr.revenue / daysElapsed) * daysInMonth
    : null

  const periodLabel = today.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return {
    periodLabel,
    daysElapsed,
    daysInMonth,
    faturamento: curr.revenue,
    faturamentoTrend: pctChange(curr.revenue, prev.revenue),
    investimento: curr.spend,
    investimentoTrend: pctChange(curr.spend, prev.spend),
    roas: curr.roas,
    roasTrend: pctChange(curr.roas, prev.roas),
    projecaoMes,
    compras: curr.purchases,
    comprasTrend: pctChange(curr.purchases, prev.purchases),
    taxaConversao: curr.taxaConversao,
    taxaConversaoTrend: pctChange(curr.taxaConversao, prev.taxaConversao),
    ticketMedio: curr.ticketMedio,
    ticketMedioTrend: pctChange(curr.ticketMedio, prev.ticketMedio),
    sessoes: curr.sessions,
    sessoesTrend: pctChange(curr.sessions, prev.sessions),
    cps: curr.cps,
    cpsTrend: pctChange(curr.cps, prev.cps),
    cpm: curr.cpm,
    cpmTrend: pctChange(curr.cpm, prev.cpm),
    cpa: curr.cpa,
    cpaTrend: pctChange(curr.cpa, prev.cpa),
  }
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
  SPEND: 'Investimento (Budget)',
  FATURAMENTO: 'Faturamento',
  TICKET_MEDIO: 'Ticket Médio',
  TAXA_CONVERSAO: 'Taxa de Conversão',
  CPS: 'Custo por Sessão',
  CPM: 'CPM',
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

// ─── Manager stats (for manager cards) ────────────────────────────────────────

export type ManagerStat = {
  userId: string
  name: string
  role: string
  avatarUrl: string | null
  totalClients: number
  totalSpend: number
  avgRoas: number | null
  totalSales: number
  avgCpa: number | null
  clientsHealthy: number
  clientsWarning: number
  clientsCritical: number
  vsLastWeek: number | null  // % change in totalSales vs previous 7 days
}

export const getManagerStats = cache(async (): Promise<ManagerStat[]> => {
  const { start: weekStart, end: weekEnd } = getWeekRange()
  const prevWeekStart = new Date(weekStart)
  prevWeekStart.setDate(prevWeekStart.getDate() - 7)
  const prevWeekEnd = new Date(weekStart)
  prevWeekEnd.setDate(prevWeekEnd.getDate() - 1)

  // Get all active clients with their primary manager and relevant data
  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    include: {
      assignments: {
        where: { isPrimary: true },
        include: {
          user: {
            select: { id: true, name: true, role: true, avatarUrl: true },
          },
        },
        take: 1,
      },
      metricSnapshots: {
        where: { date: { gte: weekStart, lte: weekEnd } },
        select: { spend: true, conversions: true, conversionValue: true, roas: true, cpa: true },
      },
      // For previous week comparison
      healthScores: {
        where: { periodStart: { gte: weekStart } },
        select: { status: true },
      },
    },
  })

  // Also get previous week snapshots
  const clientIds = clients.map((c) => c.id)
  const prevSnapshots = clientIds.length > 0
    ? await prisma.metricSnapshot.findMany({
        where: {
          clientId: { in: clientIds },
          date: { gte: prevWeekStart, lte: prevWeekEnd },
          spend: { gt: 0 },
        },
        select: { clientId: true, conversions: true },
      })
    : []

  type SnapItem = (typeof clients)[number]['metricSnapshots'][number]
  type HealthItem = { status: HealthStatus }

  // Group by manager
  const managerMap = new Map<string, {
    user: { id: string; name: string; role: string; avatarUrl: string | null }
    clientData: Array<{
      snaps: SnapItem[]
      healthScores: HealthItem[]
      prevSales: number
    }>
  }>()

  for (const client of clients) {
    const assignment = client.assignments[0]
    if (!assignment) continue
    const { user } = assignment

    if (!managerMap.has(user.id)) {
      managerMap.set(user.id, { user, clientData: [] })
    }

    const prevSales = prevSnapshots
      .filter((s) => s.clientId === client.id)
      .reduce((sum, s) => sum + (s.conversions ?? 0), 0)

    managerMap.get(user.id)!.clientData.push({
      snaps: client.metricSnapshots,
      healthScores: client.healthScores,
      prevSales,
    })
  }

  const result: ManagerStat[] = []

  for (const [, { user, clientData }] of managerMap) {
    const totalClients = clientData.length

    let totalSpend = 0
    let totalSales = 0
    let totalPrevSales = 0
    const roasValues: number[] = []
    const cpaValues: number[] = []
    let clientsHealthy = 0
    let clientsWarning = 0
    let clientsCritical = 0

    for (const { snaps, healthScores, prevSales } of clientData) {
      const adsSnaps = snaps.filter((x) => Number(x.spend ?? 0) > 0)
      const clientSpend = adsSnaps.reduce((s, x) => s + Number(x.spend ?? 0), 0)
      const clientSales = snaps.reduce((s, x) => s + (x.conversions ?? 0), 0)

      totalSpend += clientSpend
      totalSales += clientSales
      totalPrevSales += prevSales

      if (clientSpend > 0) {
        const roasArr = adsSnaps.map((x) => Number(x.roas ?? 0)).filter((v) => v > 0)
        if (roasArr.length > 0) {
          roasValues.push(roasArr.reduce((a, b) => a + b, 0) / roasArr.length)
        }
        const cpaArr = adsSnaps.map((x) => Number(x.cpa ?? 0)).filter((v) => v > 0)
        if (cpaArr.length > 0) {
          cpaValues.push(cpaArr.reduce((a, b) => a + b, 0) / cpaArr.length)
        }
      }

      const overallStatus: HealthStatus | null =
        healthScores.length === 0
          ? null
          : healthScores.some((s) => s.status === 'RUIM')
          ? 'RUIM'
          : healthScores.some((s) => s.status === 'REGULAR')
          ? 'REGULAR'
          : 'OTIMO'

      if (overallStatus === 'OTIMO') clientsHealthy++
      else if (overallStatus === 'REGULAR') clientsWarning++
      else if (overallStatus === 'RUIM') clientsCritical++
    }

    const avgRoas = roasValues.length > 0
      ? roasValues.reduce((a, b) => a + b, 0) / roasValues.length
      : null
    const avgCpa = cpaValues.length > 0
      ? cpaValues.reduce((a, b) => a + b, 0) / cpaValues.length
      : null

    const vsLastWeek =
      totalPrevSales > 0
        ? ((totalSales - totalPrevSales) / totalPrevSales) * 100
        : totalSales > 0
        ? 100
        : null

    result.push({
      userId: user.id,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
      totalClients,
      totalSpend,
      avgRoas,
      totalSales,
      avgCpa,
      clientsHealthy,
      clientsWarning,
      clientsCritical,
      vsLastWeek,
    })
  }

  // Sort by totalClients desc
  result.sort((a, b) => b.totalClients - a.totalClients)

  return result
})
