import 'server-only'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
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

/**
 * Returns true for roles that can see ALL clients (not just assigned ones).
 * ADMIN  → full access + mutations
 * CS     → full read access (Customer Success), no mutations
 */
function canViewAll(role: string): boolean {
  return role === 'ADMIN' || role === 'CS'
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_RANK: Record<HealthStatus, number> = { RUIM: 0, REGULAR: 1, OTIMO: 2 }

/** Compara status atual vs anterior e retorna 'up', 'down' ou null (sem mudança / sem histórico) */
function deriveStatusTrend(
  current: HealthStatus | null,
  prev: HealthStatus | null,
): 'up' | 'down' | null {
  if (!current || !prev) return null
  const diff = STATUS_RANK[current] - STATUS_RANK[prev]
  if (diff > 0) return 'up'
  if (diff < 0) return 'down'
  return null
}

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
  streakDays: number | null
  streakStatus: HealthStatus | null
  statusTrend: 'up' | 'down' | null  // tendência vs status anterior (para seta)
}

export const getDashboardData = cache(async (userId: string, role: string) => {
  const { start: weekStart } = getWeekRange()
  const { start: monthStart } = getMonthRange()
  const fetchFrom = monthStart < weekStart ? monthStart : weekStart

  const clientsWhere: Prisma.ClientWhereInput =
    canViewAll(role)
      ? { status: 'ACTIVE' }
      : { status: 'ACTIVE', assignments: { some: { userId } } }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  // Run all 4 queries in parallel instead of sequentially
  const [clients, alerts, oscillationAlerts, lastSyncAccount] = await Promise.all([
    prisma.client.findMany({
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
        statusStreak: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.alert.findMany({
      where: canViewAll(role)
        ? { read: false, type: { notIn: ['KPI_DROP_24H', 'KPI_SPIKE_24H'] } }
        : { read: false, type: { notIn: ['KPI_DROP_24H', 'KPI_SPIKE_24H'] }, client: { assignments: { some: { userId } } } },
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.alert.findMany({
      where: canViewAll(role)
        ? { type: { in: ['KPI_DROP_24H', 'KPI_SPIKE_24H'] }, createdAt: { gte: todayStart } }
        : { type: { in: ['KPI_DROP_24H', 'KPI_SPIKE_24H'] }, createdAt: { gte: todayStart }, client: { assignments: { some: { userId } } } },
      include: { client: { select: { name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.platformAccount.findFirst({
      where: canViewAll(role)
        ? { active: true, lastSyncAt: { not: null } }
        : { active: true, lastSyncAt: { not: null }, client: { assignments: { some: { userId } } } },
      orderBy: { lastSyncAt: 'desc' },
      select: { lastSyncAt: true },
    }),
  ])

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
      streakDays:   client.statusStreak?.days ?? null,
      streakStatus: client.statusStreak?.status ?? null,
      statusTrend:  deriveStatusTrend(
        client.statusStreak?.status ?? null,
        client.statusStreak?.prevStatus ?? null,
      ),
    }
  })

  const otimo = summaries.filter((c) => c.overallStatus === 'OTIMO').length
  const regular = summaries.filter((c) => c.overallStatus === 'REGULAR').length
  const ruim = summaries.filter((c) => c.overallStatus === 'RUIM').length

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
  statusTrend: 'up' | 'down' | null
  // budget
  budgetConsumed: number | null  // actual spend this month
  budgetPlanned: number | null   // target spend from Goal (SPEND/MONTHLY)
  goalId: string | null          // id of the MONTHLY SPEND goal, for inline editing
}

export const getClientsOperationalTable = cache(async (
  userId: string,
  role: string,
): Promise<ClientOperationalRow[]> => {
  const today = new Date()
  const { start: monthStart } = getMonthRange(today)

  const where: Prisma.ClientWhereInput =
    canViewAll(role)
      ? { status: 'ACTIVE' }
      : { status: 'ACTIVE', assignments: { some: { userId } } }

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
        where: { periodStart: { gte: monthStart } },
        select: { status: true },
      },
      goals: {
        where: {
          metric: 'SPEND',
          period: 'MONTHLY',
          startDate: { lte: today },
          endDate: { gte: monthStart },
        },
        select: { id: true, targetValue: true },
        take: 1,
      },
      statusStreak: { select: { status: true, prevStatus: true } },
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
    const revenue   = ga4Rev  // GA4-only — single source of truth for revenue

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

    const budgetPlanned = c.goals[0] ? Number(c.goals[0].targetValue) : null
    const goalId        = c.goals[0]?.id ?? null

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
      statusTrend: deriveStatusTrend(
        c.statusStreak?.status ?? null,
        c.statusStreak?.prevStatus ?? null,
      ),
      budgetConsumed: spend > 0 ? spend : null,
      budgetPlanned,
      goalId,
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

async function _fetchClientsList(userId: string, role: string) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const where: Prisma.ClientWhereInput =
    canViewAll(role)
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
        // monthStart ensures both monthly (periodStart=1st) and weekly scores are included
        where: { periodStart: { gte: monthStart } },
        select: { status: true, achievementPct: true },
      },
    },
    orderBy: { name: 'asc' },
  })

  // Fetch current month KPIs for all clients in one query
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
}

export const getClientsList = unstable_cache(_fetchClientsList, ['getClientsList'], { revalidate: 30 })

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
      statusStreak: { select: { status: true, prevStatus: true, days: true } },
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
  // Link CTR e CPC (calculados a partir de clicks/impressions dos ad platforms)
  ctr: number | null
  cpc: number | null
  // Métricas de negócio local (Meta Ads)
  adLeads: number | null        // conversões de anúncio = leads/formulários
  adCliques: number | null      // cliques no link (Meta Ads)
  adAlcance: number | null      // alcance total (reach)
  adImpressions: number | null  // impressões totais
  adFrequencia: number | null   // frequência (impressões / alcance)
  cpl: number | null            // custo por lead = spend / adLeads
  mensagens: number | null      // conversas iniciadas por mensagem
  custoMensagem: number | null  // custo por conversa
  landingPageViews: number | null // visualizações da página de destino
  taxaConexao: number | null    // landing page views / cliques * 100
  thruplays: number | null      // thruplays de vídeo
  videoViews3s: number | null   // reproduções de vídeo ≥3s
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
    // Link CTR = ad clicks / impressions (not stored ctr which is CTR All)
    const ads            = snaps.filter((x) => x.platformAccount.platform !== 'GA4')
    const adClicks       = ads.reduce((s, x) => s + (x.clicks ?? 0), 0)
    const allImpr        = ads.reduce((s, x) => s + (x.impressions ?? 0), 0)
    const adReach        = ads.reduce((s, x) => s + (x.reach ?? 0), 0)
    // Ad conversions = event-based leads/messages from Meta Ads (used for local business CPL)
    const adConversions  = ads.reduce((s, x) => s + (x.conversions ?? 0), 0)
    const ctrLink        = allImpr > 0 && adClicks > 0 ? (adClicks / allImpr) * 100 : null
    const cpcLink        = totalSpend > 0 && adClicks > 0 ? totalSpend / adClicks : null

    const roas       = totalSpend  > 0 && revenue > 0 ? revenue / totalSpend  : null
    const roasMeta   = metaSpend   > 0 && revenue > 0 ? revenue / metaSpend   : null
    const roasGoogle = googleSpend > 0 && revenue > 0 ? revenue / googleSpend : null
    const roasTiktok = tiktokSpend > 0 && revenue > 0 ? revenue / tiktokSpend : null

    // New Meta-specific fields for local business
    const mensagens        = meta.reduce((s, x) => s + (x.mensagens        ?? 0), 0)
    const landingPageViews = meta.reduce((s, x) => s + (x.landingPageViews ?? 0), 0)
    const thruplays        = meta.reduce((s, x) => s + (x.thruplays        ?? 0), 0)
    const videoViews3s     = meta.reduce((s, x) => s + (x.videoViews3s     ?? 0), 0)
    const metaReach        = meta.reduce((s, x) => s + (x.reach            ?? 0), 0)
    const metaImpressions  = meta.reduce((s, x) => s + (x.impressions      ?? 0), 0)
    const adFrequencia     = metaReach > 0 ? metaImpressions / metaReach : null

    return {
      spend: totalSpend, metaSpend, googleSpend, tiktokSpend,
      sessions, purchases, revenue, adImpr, newUsers,
      roas, roasMeta, roasGoogle, roasTiktok,
      ctrLink, cpcLink,
      adLeads:          adConversions > 0 ? adConversions : null,
      adCliques:        adClicks > 0 ? adClicks : null,
      adAlcance:        adReach > 0 ? adReach : null,
      adImpressions:    allImpr > 0 ? allImpr : null,
      adFrequencia,
      mensagens:        mensagens > 0 ? mensagens : null,
      custoMensagem:    mensagens > 0 && metaSpend > 0 ? metaSpend / mensagens : null,
      landingPageViews: landingPageViews > 0 ? landingPageViews : null,
      taxaConexao:      adClicks > 0 && landingPageViews > 0 ? (landingPageViews / adClicks) * 100 : null,
      thruplays:        thruplays > 0 ? thruplays : null,
      videoViews3s:     videoViews3s > 0 ? videoViews3s : null,
      ticketMedio:      purchases > 0 && revenue > 0 ? revenue / purchases : null,
      taxaConversao:    sessions > 0 && purchases > 0 ? (purchases / sessions) * 100 : null,
      cps:              sessions > 0 && totalSpend > 0 ? totalSpend / sessions : null,
      cpm:              adImpr > 0 && metaSpend > 0 ? (metaSpend / adImpr) * 1000 : null,
      cpa:              purchases > 0 && totalSpend > 0 ? totalSpend / purchases : null,
      cac:              purchases > 0 && totalSpend > 0 ? totalSpend / purchases : null,
      cpl:              adConversions > 0 && totalSpend > 0 ? totalSpend / adConversions : null,
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
    ctr: curr.ctrLink,
    cpc: curr.cpcLink,
    adLeads:          curr.adLeads,
    adCliques:        curr.adCliques,
    adAlcance:        curr.adAlcance,
    adImpressions:    curr.adImpressions,
    adFrequencia:     curr.adFrequencia,
    cpl:              curr.cpl,
    mensagens:        curr.mensagens,
    custoMensagem:    curr.custoMensagem,
    landingPageViews: curr.landingPageViews,
    taxaConexao:      curr.taxaConexao,
    thruplays:        curr.thruplays,
    videoViews3s:     curr.videoViews3s,
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
  MENSAGENS: 'Mensagens',
  VISITAS_PERFIL: 'Visitas ao Perfil',
  LIGACOES: 'Ligações',
  AGENDAMENTOS: 'Agendamentos',
  LEADS: 'Leads Gerados',
  SEGUIDORES: 'Seguidores',
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

async function _fetchMonthlyComparison(clientId: string, months: number): Promise<MonthlyDataPoint[]> {
  const now = new Date()
  const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

  // Single query covering all N months instead of N sequential queries
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)

  const snapshots = await prisma.metricSnapshot.findMany({
    where: { clientId, date: { gte: rangeStart } },
    select: {
      date: true,
      spend: true,
      conversionValue: true,
      platformAccount: { select: { platform: true } },
    },
  })

  // Build month buckets in memory
  const buckets = new Map<string, { revenue: number; spend: number; label: string }>()
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.set(`${d.getFullYear()}-${d.getMonth()}`, {
      revenue: 0,
      spend: 0,
      label: `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
    })
  }

  for (const s of snapshots) {
    const d = new Date(s.date)
    const bucket = buckets.get(`${d.getFullYear()}-${d.getMonth()}`)
    if (!bucket) continue
    if (s.platformAccount.platform === 'GA4') {
      bucket.revenue += Number(s.conversionValue ?? 0)
    } else {
      bucket.spend += Number(s.spend ?? 0)
    }
  }

  return Array.from(buckets.values()).map((m) => ({
    month: m.label,
    revenue: m.revenue,
    spend: m.spend,
    roas: m.spend > 0 && m.revenue > 0 ? Math.round((m.revenue / m.spend) * 100) / 100 : null,
  }))
}

export const getClientMonthlyComparison = (clientId: string, months = 6) =>
  unstable_cache(_fetchMonthlyComparison, ['getClientMonthlyComparison', clientId], { revalidate: 300 })(clientId, months)

// ─── Clients for select dropdowns ─────────────────────────────────────────────

export const getClientsForSelect = cache(async (userId: string, role: string) => {
  const where: Prisma.ClientWhereInput =
    canViewAll(role) ? {} : { assignments: { some: { userId } } }

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
    ...(!canViewAll(role) && { client: { assignments: { some: { userId } } } }),
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
    canViewAll(role)
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
  achievementPct: number | null
  platforms: string[]
  goalsTotal: number
  goalsHit: number   // metas com status OTIMO
  streakDays: number | null
  streakStatus: HealthStatus | null
  statusTrend: 'up' | 'down' | null
}

export type ManagerWithStats = {
  id: string
  name: string
  role: string
  clientCount: number
  goalsHit: number      // overallStatus OTIMO — meta batida
  goalsWarning: number  // overallStatus REGULAR — atenção
  goalsCritical: number // overallStatus RUIM — crítico
  noData: number        // overallStatus null — sem dados de saúde
  clients: ManagerClientRow[]
}

export const getManagersOverview = cache(async (): Promise<ManagerWithStats[]> => {
  const { start: weekStart, end: weekEnd } = getWeekRange()
  const { start: monthStart, end: monthEnd } = getMonthRange()

  // Apenas gestores de tráfego com clientes ativos atribuídos
  const users = await prisma.user.findMany({
    where: {
      active: true,
      role: 'MANAGER',
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
                // monthStart covers both monthly (periodStart=1st) and weekly scores
                where: { periodStart: { gte: monthStart } },
                select: { status: true, metric: true, period: true, achievementPct: true },
              },
              goals: {
                where: {
                  startDate: { lte: new Date() },
                  OR: [
                    { period: 'WEEKLY', endDate: { gte: weekStart } },
                    { period: 'MONTHLY', endDate: { gte: monthStart } },
                  ],
                },
                select: { id: true, period: true },
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

      const avgPct = scores.length > 0
        ? Math.round(scores.reduce((s, h) => s + Number(h.achievementPct ?? 0), 0) / scores.length)
        : null

      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        overallStatus,
        achievementPct: avgPct,
        platforms: [...new Set(c.platformAccounts.map((p) => p.platform))],
        goalsTotal: c.goals.length,
        goalsHit: scores.filter((s) => s.status === 'OTIMO').length,
        streakDays:  null,
        streakStatus: null,
        statusTrend: null,
      }
    })

    const goalsHit      = clientRows.filter((c) => c.overallStatus === 'OTIMO').length
    const goalsWarning  = clientRows.filter((c) => c.overallStatus === 'REGULAR').length
    const goalsCritical = clientRows.filter((c) => c.overallStatus === 'RUIM').length
    const noData        = clientRows.filter((c) => c.overallStatus === null).length

    return {
      id: user.id,
      name: user.name,
      role: user.role,
      clientCount: clientRows.length,
      goalsHit,
      goalsWarning,
      goalsCritical,
      noData,
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
    canViewAll(role) ? { status: 'ACTIVE' } : { status: 'ACTIVE', assignments: { some: { userId } } }

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
  clients: ManagerClientRow[]
}

export const getManagerStats = cache(async (): Promise<ManagerStat[]> => {
  const { start: weekStart, end: weekEnd } = getWeekRange()
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
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
        select: {
          spend: true,
          conversions: true,
          conversionValue: true,
          platformAccount: { select: { platform: true } },
        },
      },
      // Monthly scores use periodStart=1st; use monthStart to include both
      healthScores: {
        where: { periodStart: { gte: monthStart } },
        select: { status: true, achievementPct: true },
      },
      statusStreak: { select: { status: true, prevStatus: true, days: true } },
    },
  })

  // Also get previous week snapshots — GA4 only for revenue comparison
  const clientIds = clients.map((c) => c.id)
  const prevSnapshots = clientIds.length > 0
    ? await prisma.metricSnapshot.findMany({
        where: {
          clientId: { in: clientIds },
          date: { gte: prevWeekStart, lte: prevWeekEnd },
        },
        select: {
          clientId: true,
          conversions: true,
          conversionValue: true,
          platformAccount: { select: { platform: true } },
        },
      })
    : []

  type SnapItem = (typeof clients)[number]['metricSnapshots'][number]
  type HealthItem = { status: HealthStatus; achievementPct: unknown }

  // Group by manager
  const managerMap = new Map<string, {
    user: { id: string; name: string; role: string; avatarUrl: string | null }
    clientData: Array<{
      id: string
      name: string
      slug: string
      snaps: SnapItem[]
      healthScores: HealthItem[]
      prevSales: number
      streakDays: number | null
      streakStatus: HealthStatus | null
      statusTrend: 'up' | 'down' | null
    }>
  }>()

  for (const client of clients) {
    const assignment = client.assignments[0]
    if (!assignment) continue
    const { user } = assignment

    if (!managerMap.has(user.id)) {
      managerMap.set(user.id, { user, clientData: [] })
    }

    // Previous week revenue: GA4 only (source of truth)
    const prevSales = prevSnapshots
      .filter((s) => s.clientId === client.id && s.platformAccount.platform === 'GA4')
      .reduce((sum, s) => sum + Number(s.conversionValue ?? 0), 0)

    managerMap.get(user.id)!.clientData.push({
      id: client.id,
      name: client.name,
      slug: client.slug,
      snaps: client.metricSnapshots,
      healthScores: client.healthScores,
      prevSales,
      streakDays:  client.statusStreak?.days ?? null,
      streakStatus: client.statusStreak?.status ?? null,
      statusTrend: deriveStatusTrend(
        client.statusStreak?.status ?? null,
        client.statusStreak?.prevStatus ?? null,
      ),
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
      // Revenue = GA4 only (source of truth)
      const ga4Snaps = snaps.filter((x) => x.platformAccount.platform === 'GA4')
      const adsSnaps = snaps.filter((x) => x.platformAccount.platform !== 'GA4' && Number(x.spend ?? 0) > 0)

      const clientSpend   = adsSnaps.reduce((s, x) => s + Number(x.spend ?? 0), 0)
      const clientRevenue = ga4Snaps.reduce((s, x) => s + Number(x.conversionValue ?? 0), 0)
      const clientPurchases = ga4Snaps.reduce((s, x) => s + (x.conversions ?? 0), 0)

      totalSpend += clientSpend
      totalSales += clientRevenue  // revenue from GA4, not mixed ad platform conversions
      totalPrevSales += prevSales

      if (clientSpend > 0 && clientRevenue > 0) {
        roasValues.push(clientRevenue / clientSpend)
      }
      if (clientSpend > 0 && clientPurchases > 0) {
        cpaValues.push(clientSpend / clientPurchases)
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

    const clientRows: ManagerClientRow[] = clientData.map(({ id, name, slug, healthScores, streakDays, streakStatus, statusTrend }) => {
      const overallStatus: HealthStatus | null =
        healthScores.length === 0 ? null
        : healthScores.some((s) => s.status === 'RUIM') ? 'RUIM'
        : healthScores.some((s) => s.status === 'REGULAR') ? 'REGULAR'
        : 'OTIMO'
      const avgPct = healthScores.length > 0
        ? Math.round(healthScores.reduce((s, h) => s + Number(h.achievementPct ?? 0), 0) / healthScores.length)
        : null
      return {
        id, name, slug, overallStatus, achievementPct: avgPct,
        platforms: [], goalsTotal: healthScores.length,
        goalsHit: healthScores.filter((s) => s.status === 'OTIMO').length,
        streakDays, streakStatus, statusTrend,
      }
    })

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
      clients: clientRows,
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

  // Apenas gestores de tráfego ativos com clientes atribuídos
  const managers = await prisma.user.findMany({
    where: {
      active: true,
      role: 'MANAGER',
      managedClients: { some: { client: { status: 'ACTIVE' } } },
    },
    select: {
      id: true,
      name: true,
      managedClients: {
        where: { client: { status: 'ACTIVE' } },
        select: {
          client: {
            select: {
              id: true,
              goals: {
                where: {
                  metric: { in: ['SPEND', 'INVESTMENT'] },
                },
                select: { targetValue: true, period: true },
                orderBy: { endDate: 'desc' },
                take: 2, // pega até 1 mensal + 1 semanal
              },
            },
          },
        },
      },
    },
  })

  return managers
    .map((mgr) => {
      const clientCount = mgr.managedClients.length
      const mrr = mgr.managedClients.reduce((sum, a) => {
        const goals = a.client.goals
        // Prefer MONTHLY goal; fall back to WEEKLY × 4.33 for monthly estimate
        const monthly = goals.find((g) => g.period === 'MONTHLY')
        const weekly  = goals.find((g) => g.period === 'WEEKLY')
        const budget = monthly
          ? Number(monthly.targetValue)
          : weekly
          ? Math.round(Number(weekly.targetValue) * 4.33)
          : 0
        return sum + budget
      }, 0)
      return {
        userId: mgr.id,
        name: mgr.name,
        mrr,
        clientCount,
        avgBudgetPerClient: clientCount > 0 ? Math.round(mrr / clientCount) : 0,
      }
    })
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
  // Tenure
  avgTenureMonths: number | null  // average months active clients have been with the agency
  clientsWithTenure: number       // how many have contractStart filled in
}

export const getAgencyOverview = cache(async (): Promise<AgencyOverview> => {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

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
      contractStart: true,
      assignments: {
        where: { isPrimary: true },
        select: { user: { select: { id: true, name: true } } },
        take: 1,
      },
      healthScores: {
        where: { periodStart: { gte: monthStart } },
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

  // Tenure: average months since contractStart for active clients
  const tenureClients = clients.filter((c) => c.contractStart)
  const avgTenureMonths = tenureClients.length > 0
    ? Math.round(
        tenureClients.reduce((sum, c) => {
          const months = (now.getFullYear() - c.contractStart!.getFullYear()) * 12
            + (now.getMonth() - c.contractStart!.getMonth())
          return sum + Math.max(0, months)
        }, 0) / tenureClients.length
      )
    : null

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
    avgTenureMonths,
    clientsWithTenure: tenureClients.length,
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
    canViewAll(role)
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

// ─── Assignments management ───────────────────────────────────────────────────

export type AssignmentClientRow = {
  id: string
  name: string
  slug: string
  platforms: string[]
  overallStatus: HealthStatus | null
  achievementPct: number
  primaryManagerId: string | null
  primaryManagerName: string | null
}

export type AssignmentManager = {
  id: string
  name: string
  clientCount: number
}

export const getAssignmentsData = cache(async () => {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [rawClients, managers] = await Promise.all([
    prisma.client.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        slug: true,
        platformAccounts: { where: { active: true }, select: { platform: true } },
        assignments: {
          where: { isPrimary: true },
          select: { userId: true, user: { select: { name: true } } },
          take: 1,
        },
        healthScores: {
          where: { periodStart: { gte: monthStart } },
          select: { status: true, achievementPct: true },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      where: { active: true, role: { in: ['ADMIN', 'MANAGER'] } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const clients: AssignmentClientRow[] = rawClients.map((c) => {
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

    const primary = c.assignments[0]

    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      platforms: [...new Set(c.platformAccounts.map((p) => p.platform))],
      overallStatus,
      achievementPct: Math.round(avgPct),
      primaryManagerId: primary?.userId ?? null,
      primaryManagerName: primary?.user.name ?? null,
    }
  })

  const managerRows: AssignmentManager[] = managers.map((m) => ({
    id: m.id,
    name: m.name,
    clientCount: rawClients.filter((c) => c.assignments[0]?.userId === m.id).length,
  }))

  return { clients, managers: managerRows }
})

// ─── Week-over-week health score comparison ───────────────────────────────────

export type WeekScoreRow = {
  metric: string
  label: string
  thisWeekPct: number | null
  prevWeekPct: number | null
  delta: number | null           // thisWeekPct - prevWeekPct
  thisWeekStatus: HealthStatus | null
  prevWeekStatus: HealthStatus | null
}

export const getWeekScoreComparison = cache(async (clientId: string): Promise<WeekScoreRow[]> => {
  const { start: weekStart } = getWeekRange()
  const prevWeekStart = new Date(weekStart)
  prevWeekStart.setDate(prevWeekStart.getDate() - 7)
  const prevWeekEnd = new Date(weekStart)
  prevWeekEnd.setDate(prevWeekEnd.getDate() - 1)

  const [thisWeekScores, prevWeekScores] = await Promise.all([
    prisma.healthScore.findMany({
      where: { clientId, period: 'WEEKLY', periodStart: { gte: weekStart } },
      select: { metric: true, achievementPct: true, status: true },
    }),
    prisma.healthScore.findMany({
      where: { clientId, period: 'WEEKLY', periodStart: { gte: prevWeekStart, lte: prevWeekEnd } },
      select: { metric: true, achievementPct: true, status: true },
    }),
  ])

  const allMetrics = new Set([...thisWeekScores.map((s) => s.metric), ...prevWeekScores.map((s) => s.metric)])

  return Array.from(allMetrics).map((metric) => {
    const thisW = thisWeekScores.find((s) => s.metric === metric)
    const prevW = prevWeekScores.find((s) => s.metric === metric)
    const thisPct = thisW ? Math.round(Number(thisW.achievementPct)) : null
    const prevPct = prevW ? Math.round(Number(prevW.achievementPct)) : null
    return {
      metric,
      label: metricLabels[metric] ?? metric,
      thisWeekPct: thisPct,
      prevWeekPct: prevPct,
      delta: thisPct !== null && prevPct !== null ? thisPct - prevPct : null,
      thisWeekStatus: thisW?.status ?? null,
      prevWeekStatus: prevW?.status ?? null,
    }
  })
})

// ─── Health score weekly history (for trend chart) ───────────────────────────

export type HealthWeekPoint = {
  weekLabel: string   // 'DD/MM'
  weekStart: string   // 'YYYY-MM-DD'
  avgPct: number
  status: HealthStatus | null
}

export const getHealthScoreHistory = cache(async (clientId: string, weeks = 8): Promise<HealthWeekPoint[]> => {
  const since = new Date()
  since.setDate(since.getDate() - weeks * 7)
  since.setHours(0, 0, 0, 0)

  const scores = await prisma.healthScore.findMany({
    where: {
      clientId,
      period: 'WEEKLY',
      periodStart: { gte: since },
    },
    orderBy: { periodStart: 'asc' },
    select: { periodStart: true, achievementPct: true, status: true },
  })

  // Group by week start
  const byWeek = new Map<string, { sum: number; count: number; statuses: HealthStatus[] }>()
  for (const s of scores) {
    const key = s.periodStart.toISOString().split('T')[0]
    const cur = byWeek.get(key) ?? { sum: 0, count: 0, statuses: [] }
    cur.sum += Number(s.achievementPct)
    cur.count++
    cur.statuses.push(s.status)
    byWeek.set(key, cur)
  }

  return Array.from(byWeek.entries()).map(([key, { sum, count, statuses }]) => {
    const d = new Date(key + 'T12:00:00')
    const avgPct = Math.round(sum / count)
    const status: HealthStatus | null =
      statuses.includes('RUIM') ? 'RUIM'
      : statuses.includes('REGULAR') ? 'REGULAR'
      : statuses.length > 0 ? 'OTIMO'
      : null
    return {
      weekStart: key,
      weekLabel: `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      avgPct,
      status,
    }
  })
})

// ─── Sales Funnel (E-commerce, GA4 only) ─────────────────────────────────────

export type SalesFunnelData = {
  sessions:          number
  addToCarts:        number
  checkoutsStarted:  number
  purchases:         number
  // Conversion rates between each step
  visitToCart:       number | null   // addToCarts / sessions * 100
  cartToCheckout:    number | null   // checkoutsStarted / addToCarts * 100
  checkoutToPurchase: number | null  // purchases / checkoutsStarted * 100
  overallConversion: number | null   // purchases / sessions * 100
  // Reference benchmarks (industry average ranges)
  benchmarks: {
    visitToCart:       { min: number; max: number }
    cartToCheckout:    { min: number; max: number }
    checkoutToPurchase: { min: number; max: number }
    overallConversion: { min: number; max: number }
  }
  hasData: boolean
}

export const getClientSalesFunnel = cache(async (
  clientId: string,
  fromStr?: string,
  toStr?: string,
): Promise<SalesFunnelData> => {
  const today   = new Date()
  const from    = fromStr ? new Date(fromStr + 'T00:00:00') : new Date(today.getFullYear(), today.getMonth(), 1)
  const to      = toStr   ? new Date(toStr   + 'T23:59:59') : today

  const snapshots = await prisma.metricSnapshot.findMany({
    where: {
      clientId,
      date: { gte: from, lte: to },
      platformAccount: { platform: 'GA4' },
    },
    include: { platformAccount: { select: { platform: true } } },
  })

  const sessions         = snapshots.reduce((s, x) => s + (x.clicks          ?? 0), 0)
  const addToCarts       = snapshots.reduce((s, x) => s + (x.addToCarts      ?? 0), 0)
  const checkoutsStarted = snapshots.reduce((s, x) => s + (x.checkoutsStarted ?? 0), 0)
  const purchases        = snapshots.reduce((s, x) => s + (x.conversions      ?? 0), 0)

  // hasData requires actual funnel events — sessions alone are not enough.
  // Old snapshots (before the addToCarts column was added) will have addToCarts=0,
  // which would show a misleading 0% visit-to-cart rate.
  const hasData = addToCarts > 0

  return {
    sessions,
    addToCarts,
    checkoutsStarted,
    purchases,
    visitToCart:        sessions         > 0 ? (addToCarts       / sessions)         * 100 : null,
    cartToCheckout:     addToCarts       > 0 ? (checkoutsStarted / addToCarts)       * 100 : null,
    checkoutToPurchase: checkoutsStarted > 0 ? (purchases        / checkoutsStarted) * 100 : null,
    overallConversion:  sessions         > 0 ? (purchases        / sessions)         * 100 : null,
    benchmarks: {
      visitToCart:        { min: 4,  max: 8  },
      cartToCheckout:     { min: 38, max: 56 },
      checkoutToPurchase: { min: 55, max: 82 },
      overallConversion:  { min: 1,  max: 2  },
    },
    hasData,
  }
})
