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
  overallStatus: HealthStatus | null
  achievementPct: number
  trend: 'up' | 'down' | 'stable'
  metrics: { name: string; status: HealthStatus; pct: number }[]
}

export const getDashboardData = cache(async (userId: string, role: string) => {
  const { start: weekStart } = getWeekRange()
  const { start: monthStart } = getMonthRange()
  // Fetch from start of month so monthly health scores (periodStart=1st) are included
  const fetchFrom = monthStart < weekStart ? monthStart : weekStart

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
        where: { periodStart: { gte: fetchFrom } },
        orderBy: { calculatedAt: 'desc' },
      },
    },
    orderBy: { name: 'asc' },
  })

  const summaries: ClientHealthSummary[] = clients.map((client) => {
    const allScores = client.healthScores

    // Prefer current-week WEEKLY scores; fall back to current-month MONTHLY scores
    const weeklyScores  = allScores.filter((s) => s.period === 'WEEKLY'  && s.periodStart >= weekStart)
    const monthlyScores = allScores.filter((s) => s.period === 'MONTHLY' && s.periodStart >= monthStart)
    const scores = weeklyScores.length > 0 ? weeklyScores : monthlyScores

    // Previous reference: last week's weekly scores or previous monthly scores
    const prevScores = allScores.filter((s) => !scores.includes(s))

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

    // Overall = worst status; null when no scores (sem metas configuradas)
    const overallStatus: HealthStatus | null =
      scores.length === 0
        ? null
        : scores.some((s) => s.status === 'RUIM')
        ? 'RUIM'
        : scores.some((s) => s.status === 'REGULAR')
        ? 'REGULAR'
        : 'OTIMO'

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
          platformAccount: { select: { platform: true } },
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

    const ga4  = snaps.filter((x) => x.platformAccount.platform === 'GA4')
    const ads  = snaps.filter((x) => x.platformAccount.platform !== 'GA4')

    const spend        = ads.reduce((s, x) => s + Number(x.spend ?? 0), 0)
    const sessions     = ga4.reduce((s, x) => s + (x.clicks ?? 0), 0)
    // Prefer GA4 ecommerce_purchases to avoid double-counting with Meta actions_purchase
    const ga4Purchases = ga4.reduce((s, x) => s + (x.conversions ?? 0), 0)
    const adPurchases  = ads.reduce((s, x) => s + (x.conversions ?? 0), 0)
    const purchases    = ga4Purchases > 0 ? ga4Purchases : adPurchases
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
  monthRevenue: number
  monthSpend: number
  monthRoas: number | null
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

  // Fetch current month KPIs for all clients in one query
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const allSnaps = await prisma.metricSnapshot.findMany({
    where: { clientId: { in: clients.map((c) => c.id) }, date: { gte: monthStart } },
    select: { clientId: true, spend: true, conversionValue: true, platformAccount: { select: { platform: true } } },
  })
  const kpiMap = new Map<string, { revenue: number; spend: number }>()
  for (const s of allSnaps) {
    if (!kpiMap.has(s.clientId)) kpiMap.set(s.clientId, { revenue: 0, spend: 0 })
    const k = kpiMap.get(s.clientId)!
    if (s.platformAccount.platform === 'GA4') {
      k.revenue += Number(s.conversionValue ?? 0)
    } else {
      k.spend += Number(s.spend ?? 0)
    }
  }

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
      monthRevenue: kpiMap.get(c.id)?.revenue ?? 0,
      monthSpend:   kpiMap.get(c.id)?.spend ?? 0,
      monthRoas:    (() => {
        const k = kpiMap.get(c.id)
        return k && k.spend > 0 && k.revenue > 0 ? Math.round((k.revenue / k.spend) * 100) / 100 : null
      })(),
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
  // Financeiro (receita sempre do GA4)
  faturamento: number
  faturamentoTrend: number | null
  // Investimento total + breakdown por plataforma
  investimento: number
  investimentoTrend: number | null
  investimentoMeta: number
  investimentoGoogle: number
  investimentoTiktok: number
  // ROAS total e por plataforma (GA4 revenue / platform spend)
  roas: number | null
  roasTrend: number | null
  roasMeta: number | null
  roasGoogle: number | null
  roasTiktok: number | null
  projecaoMes: number | null
  // Conversão (sempre GA4)
  compras: number
  comprasTrend: number | null
  taxaConversao: number | null
  taxaConversaoTrend: number | null
  ticketMedio: number | null
  ticketMedioTrend: number | null
  // Tráfego (sempre GA4)
  sessoes: number
  sessoesTrend: number | null
  cps: number | null
  cpsTrend: number | null
  cpm: number | null
  cpmTrend: number | null
  cpa: number | null
  cpaTrend: number | null
  // CAC — investimento total / novos usuários GA4
  cac: number | null
  cacTrend: number | null
}

export const getClientKPIs = cache(async (
  clientId: string,
  fromStr?: string,
  toStr?: string,
): Promise<ClientKPIs> => {
  const today = new Date()

  // Default: 1st of current month → yesterday
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1)
  const defaultTo   = new Date(today); defaultTo.setDate(defaultTo.getDate() - 1)
  defaultTo.setHours(23, 59, 59, 999)

  const rangeFrom = fromStr ? new Date(fromStr + 'T00:00:00') : defaultFrom
  const rangeTo   = toStr   ? new Date(toStr   + 'T23:59:59') : defaultTo

  // Comparison period: same duration immediately before rangeFrom
  const durationMs   = rangeTo.getTime() - rangeFrom.getTime()
  const prevTo       = new Date(rangeFrom.getTime() - 1)           // 1ms before start
  const prevFrom     = new Date(prevTo.getTime() - durationMs)

  const daysInRange  = Math.round(durationMs / 86_400_000) + 1
  const daysInMonth  = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()

  // For projection: only relevant when range starts on 1st of a month
  const isMTD = rangeFrom.getDate() === 1 && rangeFrom.getMonth() === rangeTo.getMonth()

  const snapInclude = { platformAccount: { select: { platform: true } } } as const

  const [currSnaps, prevSnaps] = await Promise.all([
    prisma.metricSnapshot.findMany({ where: { clientId, date: { gte: rangeFrom, lte: rangeTo } }, include: snapInclude }),
    prisma.metricSnapshot.findMany({ where: { clientId, date: { gte: prevFrom, lte: prevTo } }, include: snapInclude }),
  ])

  /**
   * Fontes de dados:
   *  - Receita / Compras / Sessões / CAC → sempre GA4
   *  - Investimento → soma de todas as plataformas de anúncio (Meta + Google + TikTok)
   *  - ROAS total = GA4 revenue / investimento total
   *  - ROAS por plataforma = GA4 revenue / platform spend
   */
  function compute(snaps: typeof currSnaps) {
    const ga4    = snaps.filter((x) => x.platformAccount.platform === 'GA4')
    const meta   = snaps.filter((x) => x.platformAccount.platform === 'META_ADS')
    const google = snaps.filter((x) => x.platformAccount.platform === 'GOOGLE_ADS')
    const tiktok = snaps.filter((x) => x.platformAccount.platform === 'TIKTOK_ADS')

    const metaSpend   = meta.reduce((s, x) => s + Number(x.spend ?? 0), 0)
    const googleSpend = google.reduce((s, x) => s + Number(x.spend ?? 0), 0)
    const tiktokSpend = tiktok.reduce((s, x) => s + Number(x.spend ?? 0), 0)
    const totalSpend  = metaSpend + googleSpend + tiktokSpend

    const revenue  = ga4.reduce((s, x) => s + Number(x.conversionValue ?? 0), 0)
    const purchases = ga4.reduce((s, x) => s + (x.conversions ?? 0), 0)
    const sessions  = ga4.reduce((s, x) => s + (x.clicks ?? 0), 0)
    const newUsers  = ga4.reduce((s, x) => s + (x.newUsers ?? 0), 0)
    const adImpr    = meta.reduce((s, x) => s + (x.impressions ?? 0), 0)

    const roas       = totalSpend  > 0 && revenue > 0 ? revenue / totalSpend  : null
    const roasMeta   = metaSpend   > 0 && revenue > 0 ? revenue / metaSpend   : null
    const roasGoogle = googleSpend > 0 && revenue > 0 ? revenue / googleSpend : null
    const roasTiktok = tiktokSpend > 0 && revenue > 0 ? revenue / tiktokSpend : null

    return {
      spend: totalSpend, metaSpend, googleSpend, tiktokSpend,
      sessions, purchases, revenue, adImpr, newUsers,
      roas, roasMeta, roasGoogle, roasTiktok,
      ticketMedio:   purchases > 0 && revenue > 0 ? revenue / purchases : null,
      taxaConversao: sessions > 0 && purchases > 0 ? (purchases / sessions) * 100 : null,
      cps:           sessions > 0 && totalSpend > 0 ? totalSpend / sessions : null,
      cpm:           adImpr > 0 && metaSpend > 0 ? (metaSpend / adImpr) * 1000 : null,
      cpa:           purchases > 0 && totalSpend > 0 ? totalSpend / purchases : null,
      cac:           purchases > 0 && totalSpend > 0 ? totalSpend / purchases : null,
    }
  }

  const curr = compute(currSnaps)
  const prev = compute(prevSnaps)

  const pctChange = (c: number | null, p: number | null): number | null =>
    c !== null && p !== null && p !== 0 ? ((c - p) / Math.abs(p)) * 100 : null

  const projecaoMes = isMTD && daysInRange > 0 && curr.revenue > 0
    ? (curr.revenue / daysInRange) * daysInMonth
    : null

  const fmtShort = (d: Date) =>
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

  const periodLabel = isMTD && !fromStr
    ? today.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : `${fmtShort(rangeFrom)} – ${fmtShort(rangeTo)}`

  return {
    periodLabel,
    daysElapsed: daysInRange,
    daysInMonth,
    faturamento: curr.revenue,
    faturamentoTrend: pctChange(curr.revenue, prev.revenue),
    investimento: curr.spend,
    investimentoTrend: pctChange(curr.spend, prev.spend),
    investimentoMeta:   curr.metaSpend,
    investimentoGoogle: curr.googleSpend,
    investimentoTiktok: curr.tiktokSpend,
    roas: curr.roas,
    roasTrend: pctChange(curr.roas, prev.roas),
    roasMeta:   curr.roasMeta,
    roasGoogle: curr.roasGoogle,
    roasTiktok: curr.roasTiktok,
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
    cac: curr.cac,
    cacTrend: pctChange(curr.cac, prev.cac),
  }
})

// ─── Metric labels ────────────────────────────────────────────────────────────

export const metricLabels: Record<string, string> = {
  ROAS: 'ROAS',
  CPL: 'CPL',
  CPA: 'CPA (Custo por Venda)',
  CAC: 'CAC (Custo por Novo Cliente)',
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
  spend: number | null       // investimento total (todas as plataformas de anúncio)
  conversions: number | null // compras GA4
  roas: number | null        // GA4 revenue / spend total
  taxaConversao: number | null // GA4 purchases / GA4 sessions × 100
  ticketMedio: number | null   // GA4 revenue / GA4 purchases
  cps: number | null           // spend total / GA4 sessions
}

/**
 * Últimos `days` dias de métricas diárias agregadas para um cliente.
 * Receita/compras/sessões → GA4 | Investimento → plataformas de anúncio.
 */
export const getClientMetricHistory = cache(async (clientId: string, days = 14): Promise<MetricHistoryPoint[]> => {
  const since = new Date()
  since.setDate(since.getDate() - days + 1)
  since.setHours(0, 0, 0, 0)

  const snapshots = await prisma.metricSnapshot.findMany({
    where: { clientId, date: { gte: since } },
    orderBy: { date: 'asc' },
    include: { platformAccount: { select: { platform: true } } },
  })

  const byDate = new Map<string, {
    spend: number; ga4Revenue: number; ga4Purchases: number; ga4Sessions: number; hasData: boolean;
  }>()

  for (const s of snapshots) {
    const key = s.date.toISOString().slice(0, 10)
    if (!byDate.has(key)) {
      byDate.set(key, { spend: 0, ga4Revenue: 0, ga4Purchases: 0, ga4Sessions: 0, hasData: false })
    }
    const d = byDate.get(key)!
    d.hasData = true
    if (s.platformAccount.platform === 'GA4') {
      d.ga4Revenue   += Number(s.conversionValue ?? 0)
      d.ga4Purchases += s.conversions ?? 0
      d.ga4Sessions  += s.clicks ?? 0  // GA4: clicks = sessões
    } else {
      d.spend += Number(s.spend ?? 0)
    }
  }

  const result: MetricHistoryPoint[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(since)
    d.setDate(since.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    const agg = byDate.get(key)

    if (!agg || !agg.hasData) {
      result.push({ date: key, spend: null, conversions: null, roas: null, taxaConversao: null, ticketMedio: null, cps: null })
    } else {
      result.push({
        date: key,
        spend:         agg.spend || null,
        conversions:   agg.ga4Purchases || null,
        roas:          agg.spend > 0 && agg.ga4Revenue > 0 ? agg.ga4Revenue / agg.spend : null,
        taxaConversao: agg.ga4Sessions > 0 && agg.ga4Purchases > 0 ? (agg.ga4Purchases / agg.ga4Sessions) * 100 : null,
        ticketMedio:   agg.ga4Purchases > 0 && agg.ga4Revenue > 0 ? agg.ga4Revenue / agg.ga4Purchases : null,
        cps:           agg.ga4Sessions > 0 && agg.spend > 0 ? agg.spend / agg.ga4Sessions : null,
      })
    }
  }

  return result
})

// ─── Client daily revenue (for revenue pace chart) ────────────────────────────

export type DailyRevenuePoint = {
  date: string       // 'YYYY-MM-DD'
  revenue: number    // daily GA4 revenue
  spend: number      // daily ad spend
  accumulated: number // running total
}

export async function getClientDailyRevenue(
  clientId: string,
  fromStr: string,
  toStr: string
): Promise<DailyRevenuePoint[]> {
  const from = new Date(fromStr + 'T00:00:00')
  const to = new Date(toStr + 'T23:59:59')

  const snapshots = await prisma.metricSnapshot.findMany({
    where: { clientId, date: { gte: from, lte: to } },
    select: {
      date: true,
      spend: true,
      conversionValue: true,
      platformAccount: { select: { platform: true } },
    },
    orderBy: { date: 'asc' },
  })

  const byDate = new Map<string, { revenue: number; spend: number }>()
  for (const s of snapshots) {
    const key = s.date.toISOString().slice(0, 10)
    if (!byDate.has(key)) byDate.set(key, { revenue: 0, spend: 0 })
    const d = byDate.get(key)!
    if (s.platformAccount.platform === 'GA4') {
      d.revenue += Number(s.conversionValue ?? 0)
    } else {
      d.spend += Number(s.spend ?? 0)
    }
  }

  const result: DailyRevenuePoint[] = []
  let accumulated = 0
  const current = new Date(from)
  while (current <= to) {
    const key = current.toISOString().slice(0, 10)
    const agg = byDate.get(key) ?? { revenue: 0, spend: 0 }
    accumulated += agg.revenue
    result.push({ date: key, revenue: agg.revenue, spend: agg.spend, accumulated })
    current.setDate(current.getDate() + 1)
  }
  return result
}

// ─── Client monthly comparison (for 6-month chart) ────────────────────────────

export type MonthlyDataPoint = {
  month: string      // 'Jan 26'
  revenue: number
  spend: number
  roas: number | null
}

export async function getClientMonthlyComparison(
  clientId: string,
  months = 6
): Promise<MonthlyDataPoint[]> {
  const now = new Date()
  const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const result: MonthlyDataPoint[] = []

  for (let i = months - 1; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
    monthEnd.setHours(23, 59, 59, 999)

    const snapshots = await prisma.metricSnapshot.findMany({
      where: { clientId, date: { gte: monthStart, lte: monthEnd } },
      select: {
        spend: true,
        conversionValue: true,
        platformAccount: { select: { platform: true } },
      },
    })

    let revenue = 0, spend = 0
    for (const s of snapshots) {
      if (s.platformAccount.platform === 'GA4') {
        revenue += Number(s.conversionValue ?? 0)
      } else {
        spend += Number(s.spend ?? 0)
      }
    }

    result.push({
      month: `${MONTH_NAMES[monthDate.getMonth()]} ${String(monthDate.getFullYear()).slice(2)}`,
      revenue,
      spend,
      roas: spend > 0 && revenue > 0 ? Math.round((revenue / spend) * 100) / 100 : null,
    })
  }
  return result
}

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

// ─── Manager MRR (Receita Recorrente Mensal gerenciada) ───────────────────────

export type ManagerMRR = {
  userId: string
  name: string
  mrr: number          // soma dos budgets mensais (metas SPEND/INVESTMENT MONTHLY)
  clientCount: number
  avgBudgetPerClient: number
}

export const getManagersMRR = cache(async (): Promise<ManagerMRR[]> => {
  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)

  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    include: {
      assignments: {
        where: { isPrimary: true },
        include: { user: { select: { id: true, name: true } } },
        take: 1,
      },
      goals: {
        where: {
          period: 'MONTHLY',
          metric: { in: ['SPEND', 'INVESTMENT'] },
          startDate: { lte: monthEnd },
          endDate: { gte: monthStart },
        },
        select: { targetValue: true },
        take: 1,
      },
    },
  })

  const managerMap = new Map<string, { name: string; mrr: number; clientCount: number }>()

  for (const client of clients) {
    const mgr = client.assignments[0]?.user
    if (!mgr) continue

    const budget = client.goals[0] ? Number(client.goals[0].targetValue) : 0

    if (!managerMap.has(mgr.id)) {
      managerMap.set(mgr.id, { name: mgr.name, mrr: 0, clientCount: 0 })
    }
    const entry = managerMap.get(mgr.id)!
    entry.mrr += budget
    entry.clientCount += 1
  }

  return [...managerMap.entries()]
    .map(([userId, { name, mrr, clientCount }]) => ({
      userId,
      name,
      mrr,
      clientCount,
      avgBudgetPerClient: clientCount > 0 ? Math.round(mrr / clientCount) : 0,
    }))
    .sort((a, b) => b.mrr - a.mrr)
})

// ─── Churn risk score history ──────────────────────────────────────────────────

export type ChurnRiskPoint = {
  weekStart: string
  score: number
  consecutiveRuimWeeks: number
  avgAchievementPct: number
  trend: number
}

export const getClientChurnHistory = cache(async (clientId: string, weeks = 12): Promise<ChurnRiskPoint[]> => {
  const since = new Date()
  since.setDate(since.getDate() - weeks * 7)

  const scores = await prisma.churnRiskScore.findMany({
    where: { clientId, weekStart: { gte: since } },
    orderBy: { weekStart: 'asc' },
  })

  return scores.map((s) => {
    const factors = s.factors as Record<string, unknown>
    return {
      weekStart: s.weekStart.toISOString().slice(0, 10),
      score: s.score,
      consecutiveRuimWeeks: (factors?.consecutiveRuimWeeks as number) ?? 0,
      avgAchievementPct: (factors?.avgAchievementPct as number) ?? 0,
      trend: (factors?.trend as number) ?? 0,
    }
  })
})

// ─── Weekly checklist ─────────────────────────────────────────────────────────

export const getWeeklyChecklist = cache(async (managerId: string) => {
  const { start: weekStart } = getWeekRange()

  const checklist = await prisma.weeklyChecklist.findUnique({
    where: { managerId_weekStart: { managerId, weekStart } },
  })

  return checklist
})

// ─── Weekly report for client ─────────────────────────────────────────────────

export const getClientWeeklyReport = cache(async (clientId: string) => {
  const { start: weekStart } = getWeekRange()

  // Try current week first, fall back to most recent
  const report = await prisma.weeklyReport.findFirst({
    where: { clientId },
    orderBy: { weekStart: 'desc' },
  })

  return report
})

// ─── Client chat ──────────────────────────────────────────────────────────────

export const getClientChat = cache(async (clientId: string) => {
  const chat = await prisma.clientChat.findUnique({
    where: { clientId },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 100,
        include: {
          user: { select: { id: true, name: true, avatarUrl: true, role: true } },
        },
      },
    },
  })

  return chat
})

// ─── Goal pace metrics (daily / weekly targets from monthly goal) ─────────────

export type GoalPaceMetrics = {
  goalId: string
  metric: string
  period: string
  targetValue: number
  dailyTarget: number | null
  weeklyTarget: number | null
  actualValue: number | null
  paceExpected: number | null   // what should have been achieved by today
  paceAchievement: number | null  // actual / paceExpected * 100
  projectedMonth: number | null   // pace extrapolated to full month
  status: HealthStatus | null
  achievementPct: number | null
}

export const getGoalPaceMetrics = cache(async (clientId: string): Promise<GoalPaceMetrics[]> => {
  const today = new Date()
  const daysElapsed = today.getDate()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const { start: monthStart, end: monthEnd } = getMonthRange(today)

  const goals = await prisma.goal.findMany({
    where: {
      clientId,
      period: 'MONTHLY',
      startDate: { lte: monthEnd },
      endDate: { gte: monthStart },
    },
    include: {
      healthScores: {
        where: { periodStart: { gte: monthStart } },
        orderBy: { calculatedAt: 'desc' },
        take: 1,
      },
    },
  })

  return goals.map((goal): GoalPaceMetrics => {
    const target = Number(goal.targetValue)
    const dailyTarget = daysInMonth > 0 ? target / daysInMonth : null
    const weeklyTarget = daysInMonth > 0 ? (target / daysInMonth) * 7 : null
    const hs = goal.healthScores[0]
    const actualValue = hs ? Number(hs.actualValue) : null
    const paceExpected = dailyTarget !== null ? dailyTarget * daysElapsed : null
    const paceAchievement =
      actualValue !== null && paceExpected !== null && paceExpected > 0
        ? (actualValue / paceExpected) * 100
        : null
    const projectedMonth =
      actualValue !== null && daysElapsed > 0
        ? (actualValue / daysElapsed) * daysInMonth
        : null

    return {
      goalId: goal.id,
      metric: goal.metric,
      period: goal.period,
      targetValue: target,
      dailyTarget,
      weeklyTarget,
      actualValue,
      paceExpected,
      paceAchievement,
      projectedMonth,
      status: hs?.status ?? null,
      achievementPct: hs ? Math.round(Number(hs.achievementPct)) : null,
    }
  })
})

// ─── Campaign AI Insight (último gerado) ─────────────────────────────────────

export const getLatestCampaignInsight = cache(async (clientId: string) => {
  return prisma.clientInsight.findFirst({
    where: { clientId, metric: 'CAMPAIGN_ANALYSIS', dismissed: false },
    orderBy: { createdAt: 'desc' },
  })
})

// ─── Campaign breakdown (Meta Ads, por campanha/adset) ────────────────────────

export type CampaignRow = {
  campaignId: string
  campaignName: string
  adSetId: string   // '' = sem adset
  adSetName: string | null
  platform: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  conversionValue: number
  roas: number | null
  cpl: number | null
  spendShare: number  // % do total de spend do cliente no período
}

export const getClientCampaigns = cache(async (
  clientId: string,
  days = 7,
): Promise<CampaignRow[]> => {
  const since = new Date()
  since.setDate(since.getDate() - days + 1)
  since.setHours(0, 0, 0, 0)

  const snaps = await prisma.campaignSnapshot.findMany({
    where: { clientId, date: { gte: since } },
    orderBy: { date: 'asc' },
  })

  if (snaps.length === 0) return []

  // Aggregate per campaign+adset across all days in the period
  const byKey = new Map<string, {
    campaignId: string; campaignName: string
    adSetId: string; adSetName: string | null
    platform: string
    spend: number; impressions: number; clicks: number
    conversions: number; conversionValue: number
  }>()

  for (const s of snaps) {
    const key = `${s.campaignId}||${s.adSetId}`
    if (!byKey.has(key)) {
      byKey.set(key, {
        campaignId: s.campaignId,
        campaignName: s.campaignName,
        adSetId: s.adSetId,
        adSetName: s.adSetName,
        platform: s.platform,
        spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0,
      })
    }
    const agg = byKey.get(key)!
    agg.spend          += Number(s.spend ?? 0)
    agg.impressions    += s.impressions ?? 0
    agg.clicks         += s.clicks ?? 0
    agg.conversions    += s.conversions ?? 0
    agg.conversionValue += Number(s.conversionValue ?? 0)
  }

  const rows = [...byKey.values()]
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0)

  return rows
    .map((r): CampaignRow => ({
      ...r,
      roas: r.spend > 0 && r.conversionValue > 0 ? r.conversionValue / r.spend : null,
      cpl:  r.spend > 0 && r.conversions > 0 ? r.spend / r.conversions : null,
      spendShare: totalSpend > 0 ? (r.spend / totalSpend) * 100 : 0,
    }))
    .sort((a, b) => b.spend - a.spend)
})

// ─── Agency Overview ──────────────────────────────────────────────────────────

export type AgencyManagerRow = {
  id: string
  name: string
  clientCount: number
  revenue: number
  spend: number
  roas: number | null
  otimo: number
  regular: number
  ruim: number
}

export type AgencyClientRow = {
  id: string
  name: string
  slug: string
  revenue: number
  spend: number
  roas: number | null
  status: HealthStatus | null
  manager: string | null
}

export type AgencyOverview = {
  totalRevenue: number
  totalSpend: number
  weightedRoas: number | null
  totalPurchases: number
  activeClients: number
  health: { otimo: number; regular: number; ruim: number; unknown: number }
  byManager: AgencyManagerRow[]
  topClients: AgencyClientRow[]
  atRiskClients: AgencyClientRow[]
  // LTV & Churn
  totalLTV: number
  avgLTV: number | null
  churnedClients: number
  churnedThisMonth: number
  churnRate: number | null // churned / (active + churned)
}

export const getAgencyOverview = cache(async (): Promise<AgencyOverview> => {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const { start: weekStart } = getWeekRange()

  // Churn stats (independent of active clients)
  const churnedTotal = await prisma.client.count({ where: { status: 'CHURNED' } })
  const churnedThisMonth = await prisma.client.count({
    where: { status: 'CHURNED', updatedAt: { gte: monthStart } },
  })

  // All active clients with assignments and health scores
  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      slug: true,
      contractValue: true,
      assignments: {
        where: { isPrimary: true },
        select: { user: { select: { id: true, name: true } } },
        take: 1,
      },
      healthScores: {
        where: { periodStart: { gte: weekStart } },
        select: { status: true },
      },
    },
  })

  const clientIds = clients.map((c) => c.id)

  // All MTD snapshots in one query
  const snaps = await prisma.metricSnapshot.findMany({
    where: { clientId: { in: clientIds }, date: { gte: monthStart } },
    select: {
      clientId: true,
      spend: true,
      conversions: true,
      conversionValue: true,
      platformAccount: { select: { platform: true } },
    },
  })

  // Aggregate per client
  const kpiMap = new Map<string, { revenue: number; spend: number; purchases: number }>()
  for (const s of snaps) {
    if (!kpiMap.has(s.clientId)) kpiMap.set(s.clientId, { revenue: 0, spend: 0, purchases: 0 })
    const k = kpiMap.get(s.clientId)!
    if (s.platformAccount.platform === 'GA4') {
      k.revenue   += Number(s.conversionValue ?? 0)
      k.purchases += s.conversions ?? 0
    } else {
      k.spend += Number(s.spend ?? 0)
    }
  }

  // Build per-client rows + totals
  let totalRevenue = 0
  let totalSpend = 0
  let totalPurchases = 0
  const health = { otimo: 0, regular: 0, ruim: 0, unknown: 0 }
  const managerMap = new Map<string, AgencyManagerRow>()
  const clientRows: AgencyClientRow[] = []

  for (const c of clients) {
    const k = kpiMap.get(c.id) ?? { revenue: 0, spend: 0, purchases: 0 }
    totalRevenue   += k.revenue
    totalSpend     += k.spend
    totalPurchases += k.purchases

    const status: HealthStatus | null =
      c.healthScores.length === 0 ? null
        : c.healthScores.some((s) => s.status === 'RUIM') ? 'RUIM'
        : c.healthScores.some((s) => s.status === 'REGULAR') ? 'REGULAR'
        : 'OTIMO'

    if (status === 'OTIMO') health.otimo++
    else if (status === 'REGULAR') health.regular++
    else if (status === 'RUIM') health.ruim++
    else health.unknown++

    const manager = c.assignments[0]?.user ?? null
    const roas = k.spend > 0 && k.revenue > 0 ? Math.round((k.revenue / k.spend) * 100) / 100 : null

    clientRows.push({ id: c.id, name: c.name, slug: c.slug, revenue: k.revenue, spend: k.spend, roas, status, manager: manager?.name ?? null })

    if (manager) {
      if (!managerMap.has(manager.id)) {
        managerMap.set(manager.id, { id: manager.id, name: manager.name, clientCount: 0, revenue: 0, spend: 0, roas: null, otimo: 0, regular: 0, ruim: 0 })
      }
      const m = managerMap.get(manager.id)!
      m.clientCount++
      m.revenue += k.revenue
      m.spend   += k.spend
      if (status === 'OTIMO') m.otimo++
      else if (status === 'REGULAR') m.regular++
      else if (status === 'RUIM') m.ruim++
    }
  }

  // Compute ROAS per manager
  const byManager: AgencyManagerRow[] = [...managerMap.values()].map((m) => ({
    ...m,
    roas: m.spend > 0 && m.revenue > 0 ? Math.round((m.revenue / m.spend) * 100) / 100 : null,
  })).sort((a, b) => b.revenue - a.revenue)

  const topClients = [...clientRows]
    .filter((c) => c.roas !== null)
    .sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))
    .slice(0, 5)

  const atRiskClients = clientRows
    .filter((c) => c.status === 'RUIM')
    .sort((a, b) => a.name.localeCompare(b.name))

  // LTV: sum of contractValue for all active clients
  const totalLTV = clients.reduce((sum, c) => sum + (c.contractValue ? Number(c.contractValue) : 0), 0)
  const clientsWithLTV = clients.filter((c) => c.contractValue && Number(c.contractValue) > 0).length

  const totalAll = clients.length + churnedTotal

  return {
    totalRevenue,
    totalSpend,
    weightedRoas: totalSpend > 0 && totalRevenue > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : null,
    totalPurchases,
    activeClients: clients.length,
    health,
    byManager,
    topClients,
    atRiskClients,
    totalLTV,
    avgLTV: clientsWithLTV > 0 ? totalLTV / clientsWithLTV : null,
    churnedClients: churnedTotal,
    churnedThisMonth,
    churnRate: totalAll > 0 ? Math.round((churnedTotal / totalAll) * 1000) / 10 : null,
  }
})

// ─── CRM Pipeline ─────────────────────────────────────────────────────────────

export type PipelineClient = {
  id: string
  name: string
  slug: string
  industry: string | null
  email: string | null
  phone: string | null
  contractValue: number | null
  contractStart: Date | null
  tags: string[]
  pipelineStage: string
  primaryManager: string | null
  updatedAt: Date
}

export const getPipelineClients = cache(async (userId: string, role: string) => {
  const where =
    role === 'ADMIN'
      ? {}
      : { assignments: { some: { userId } } }

  const clients = await prisma.client.findMany({
    where,
    select: {
      id: true,
      name: true,
      slug: true,
      industry: true,
      email: true,
      phone: true,
      contractValue: true,
      contractStart: true,
      tags: true,
      pipelineStage: true,
      updatedAt: true,
      assignments: {
        where: { isPrimary: true },
        select: { user: { select: { name: true } } },
        take: 1,
      },
    },
    orderBy: { name: 'asc' },
  })

  return clients.map((c): PipelineClient => ({
    id:              c.id,
    name:            c.name,
    slug:            c.slug,
    industry:        c.industry,
    email:           c.email,
    phone:           c.phone,
    contractValue:   c.contractValue ? Number(c.contractValue) : null,
    contractStart:   c.contractStart,
    tags:            c.tags,
    pipelineStage:   c.pipelineStage,
    primaryManager:  c.assignments[0]?.user.name ?? null,
    updatedAt:       c.updatedAt,
  }))
})

export type ClientInteractionItem = {
  id: string
  type: string
  description: string
  createdAt: Date
  userName: string
}

export const getClientInteractions = cache(async (clientId: string): Promise<ClientInteractionItem[]> => {
  const rows = await prisma.clientInteraction.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      type: true,
      description: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  })
  return rows.map((r) => ({
    id:          r.id,
    type:        r.type,
    description: r.description,
    createdAt:   r.createdAt,
    userName:    r.user.name,
  }))
})
