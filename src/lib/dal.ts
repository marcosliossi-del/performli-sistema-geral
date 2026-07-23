import 'server-only'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { prisma } from './prisma'
import { getSession } from './session'
import { redirect } from 'next/navigation'
import { HealthStatus, GoalPeriod, Prisma, AlertType, TaskStatus, BusinessType, MetricType } from '@prisma/client'
import { getWeekRange, getMonthRange, startOfTodaySaoPaulo } from './utils'
import { normalizeRole, stripSensitive, scopeClients, isRevenueMetric } from './rbac'
import { readCronHeartbeat, CRON_STALE_HOURS } from './cron-heartbeat'
import { getRealizadoForMetrics } from './metas/realizado'
import { spDayInfo, projectMonth, proRataExpected, liveAchievementPct, periodElapsed } from './metas/pace'
import { RATE_METRICS } from '@/services/weekly-goals-sync'
import { LOWER_IS_BETTER, aggregateSnapshots, isAdPlatform, BUDGET_CONSUMPTION_METRICS, type AggregatableSnapshot } from '@/services/health-scorer'
import { deriveOverallStatus, selectCanonicalScores, overallAchievementPct } from './health-derive'
import { ALERT_GOVERNANCE, GOVERNANCE_ROLE_LABELS, ALERT_TYPE_LABELS as ALERT_HEALTH_LABELS } from './alerts/governance-config'

// ─── Auth guard ───────────────────────────────────────────────────────────────

export const requireSession = cache(async () => {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
})

/**
 * Retorna true para papéis com LEITURA AMPLA operacional (todos os clientes,
 * não só a carteira). Delega ao policy engine (src/lib/rbac): staff amplo
 * (ADMIN, CS, SUPERVISOR_TRAFEGO, ANALISTA_TRAFEGO) enxerga tudo; apenas
 * GESTOR_TRAFEGO (ex-MANAGER) fica restrito à carteira via ClientAssignment.
 *
 * Equivale a `Object.keys(scopeClients(role, _)).length === 0`.
 */
function canViewAll(role: string): boolean {
  return normalizeRole(role) !== 'GESTOR_TRAFEGO'
}

// ── Fonte única de escopo/predicados compartilhados entre BADGE e TELA (Lote 3) ──

/**
 * Escopo de POSSE de tarefas: staff amplo vê tudo; GESTOR vê o que está
 * atribuído a si (`assignedTo`) OU é da carteira (`client.assignments`). Fonte
 * única usada por getSidebarCounts, getAceiteOperacional e pela tela /suporte
 * (A-108: badge e tela passam a compartilhar exatamente este predicado).
 */
export function taskScopeFor(userId: string, role: string): Prisma.TaskWhereInput {
  return canViewAll(role)
    ? {}
    : { OR: [{ assignedTo: userId }, { client: { assignments: { some: { userId } } } }] }
}

/**
 * Status "abertos" de uma demanda de SUPORTE (A-107): exclui CONCLUIDO e
 * CANCELADO. Fonte única do que o badge conta como pendente — a tela /suporte
 * continua listando ≠CANCELADO (inclui CONCLUIDO), mas o badge só conta estes.
 */
export const OPEN_SUPPORT_STATUSES: TaskStatus[] = [
  'A_FAZER', 'EM_ANDAMENTO', 'AJUSTES_SOLICITADOS', 'EM_VALIDACAO', 'AGUARDANDO_CLIENTE',
]

/**
 * Tipos de alerta de variação 24h (KPI_DROP/SPIKE): efêmeros, exibidos em bloco
 * próprio no cockpit. Excluídos do contador de "alertas não lidos" (A-105) para
 * o badge bater com o cockpit (fonte única desta lista).
 */
const EXCLUDED_ALERT_TYPES: AlertType[] = ['KPI_DROP_24H', 'KPI_SPIKE_24H']

/**
 * Check-ins semanais PENDENTES (A-104): clientes ativos (role-scoped por
 * carteira) que ainda não submeteram o check-in da semana corrente. Fonte única
 * — o badge da sidebar e o card do cockpit (getCheckinStats.semCheckin) usam
 * ESTE predicado (antes o badge contava Task OPE-06, um model diferente).
 */
async function pendingCheckinCount(userId: string, role: string): Promise<number> {
  const { start: weekStart } = getWeekRange()
  const clientScope: Prisma.ClientWhereInput = canViewAll(role)
    ? { status: 'ACTIVE' }
    : { status: 'ACTIVE', assignments: { some: { userId } } }
  const [activeClients, submitted] = await Promise.all([
    prisma.client.count({ where: clientScope }),
    prisma.clientWeeklyCheckin.count({
      where: { weekStart, status: { not: 'PENDENTE' }, client: clientScope },
    }),
  ])
  return Math.max(0, activeClients - submitted)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_RANK: Record<HealthStatus, number> = { RUIM: 0, REGULAR: 1, OTIMO: 2 }

/**
 * Retorna o conjunto de clientId que possuem PELO MENOS UMA meta (Goal) vigente
 * — MONTHLY do mês corrente ou WEEKLY da semana corrente. Serve para distinguir
 * "cliente sem meta configurada" de "cliente com meta, mas ainda sem HealthScore
 * (aguardando dados/sync)". Um único groupBy para todo o conjunto — evita N+1.
 *
 * IMPORTANTE: ter Goal ≠ ter HealthScore. O HealthScore só nasce quando há meta
 * E snapshot com valor. Não confunda ausência de score com ausência de meta.
 */
async function getClientsWithActiveGoal(
  clientIds: string[],
  monthStart: Date,
  weekStart: Date,
): Promise<Set<string>> {
  if (clientIds.length === 0) return new Set()
  const grouped = await prisma.goal.groupBy({
    by: ['clientId'],
    where: {
      clientId: { in: clientIds },
      startDate: { lte: new Date() },
      OR: [
        { period: 'WEEKLY', endDate: { gte: weekStart } },
        { period: 'MONTHLY', endDate: { gte: monthStart } },
      ],
    },
  })
  return new Set(grouped.map((g) => g.clientId))
}

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
  // true = cliente TEM meta vigente (Goal). Distingue "sem meta" (false) de
  // "com meta, aguardando dados/sync" (true + overallStatus null).
  hasActiveGoal: boolean
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

  // "Hoje" (oscilações do dia) = início do dia-parede SP, não do fuso do
  // servidor. Alinha ao boundary usado no restante do dal (startOfTodaySaoPaulo).
  const todayStart = startOfTodaySaoPaulo(new Date())

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
        ? { read: false, type: { notIn: EXCLUDED_ALERT_TYPES } }
        : { read: false, type: { notIn: EXCLUDED_ALERT_TYPES }, client: { assignments: { some: { userId } } } },
      include: { client: { select: { name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.alert.findMany({
      where: canViewAll(role)
        ? { type: { in: EXCLUDED_ALERT_TYPES }, createdAt: { gte: todayStart } }
        : { type: { in: EXCLUDED_ALERT_TYPES }, createdAt: { gte: todayStart }, client: { assignments: { some: { userId } } } },
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

  const goalClientIds = await getClientsWithActiveGoal(
    clients.map((c) => c.id),
    monthStart,
    weekStart,
  )

  const summaries: ClientHealthSummary[] = clients.map((client) => {
    const allScores = client.healthScores

    // Janela canônica unificada (helper): WEEKLY da semana corrente preferido,
    // fallback MONTHLY do mês. MESMA regra em todas as telas.
    const scores = selectCanonicalScores(allScores, weekStart, monthStart)

    // Previous reference: last week's weekly scores or previous monthly scores
    const prevScores = allScores.filter((s) => !scores.includes(s))

    // A-121: "atingimento geral" exclui métricas de consumo de budget
    // (SPEND/INVESTMENT) — senão o estouro de orçamento infla a média (ex.:
    // ROAS 31% + FATURAMENTO 4% + SPEND 694% aparecia como "243%"). Fonte única:
    // overallAchievementPct. null (só budget/sem score) → 0 p/ o campo/tendência.
    const avgPct = overallAchievementPct(scores) ?? 0
    const prevAvgPct = overallAchievementPct(prevScores) ?? 0

    const trend: 'up' | 'down' | 'stable' =
      scores.length === 0 || prevScores.length === 0
        ? 'stable'
        : avgPct > prevAvgPct + 2
        ? 'up'
        : avgPct < prevAvgPct - 2
        ? 'down'
        : 'stable'

    // Overall = worst status na janela canônica; null = sem score (sem metas)
    const overallStatus = deriveOverallStatus(allScores, weekStart, monthStart)

    return {
      id: client.id,
      name: client.name,
      slug: client.slug,
      logoUrl: client.logoUrl,
      primaryManager: client.assignments[0]?.user.name ?? null,
      overallStatus,
      hasActiveGoal: goalClientIds.has(client.id),
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

// ─── Fonte única de receita/ROAS (AL-2/F-01) ──────────────────────────────────
// A DAL NÃO recomputa mais receita/ROAS GA4-only inline. Toda receita/ROAS
// canônica passa por `aggregateSnapshots` (health-scorer), que roteia por
// businessType (ECOMMERCE→GA4/GA4SYNC, LOCAL/B2B→Meta) e aplica a precedência
// GA4SYNC>GA4. `toAgg` adapta qualquer snapshot com `select` reduzido ao shape
// `AggregatableSnapshot` — só receita/ROAS usam `conversionValue`/`spend`/
// `conversions`/plataforma, então campos ausentes viram null (toNum→0) sem
// corromper o cálculo.
type SnapForAgg = {
  // `date` alimenta a precedência GA4SYNC>GA4 POR DIA em aggregateSnapshots.
  // Sem ele, dias com GA4 e GA4SYNC não deduplicam (dupla contagem). Todo select
  // que alimenta toAgg DEVE incluir `date: true`.
  date?: unknown
  spend?: unknown
  conversions?: unknown
  conversionValue?: unknown
  netRevenue?: unknown
  clicks?: unknown
  impressions?: unknown
  reach?: unknown
  mensagens?: unknown
  landingPageViews?: unknown
  platformAccount: { platform: string }
}

function toAgg(s: SnapForAgg): AggregatableSnapshot {
  return {
    date:             s.date ?? null,
    spend:            s.spend ?? null,
    roas:             null,
    cpl:              null,
    cpa:              null,
    ctr:              null,
    cpc:              null,
    conversions:      s.conversions ?? null,
    conversionValue:  s.conversionValue ?? null,
    netRevenue:       s.netRevenue ?? null,
    impressions:      s.impressions ?? null,
    reach:            s.reach ?? null,
    clicks:           s.clicks ?? null,
    frequency:        null,
    mensagens:        s.mensagens ?? null,
    landingPageViews: s.landingPageViews ?? null,
    platformAccount:  { platform: s.platformAccount.platform },
  }
}

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
  // true = tem meta (Goal) vigente. overallStatus null + hasActiveGoal true =
  // "aguardando dados/sync"; overallStatus null + false = "sem meta configurada".
  hasActiveGoal: boolean
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
  const { start: weekStart } = getWeekRange()
  const fetchFrom = monthStart < weekStart ? monthStart : weekStart

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
          netRevenue: true,
          date: true,
          platformAccount: { select: { platform: true } },
        },
      },
      healthScores: {
        where: { periodStart: { gte: fetchFrom } },
        select: { status: true, period: true, periodStart: true },
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

  const goalClientIds = await getClientsWithActiveGoal(
    clients.map((c) => c.id),
    monthStart,
    weekStart,
  )

  return clients.map((c): ClientOperationalRow => {
    const snaps = c.metricSnapshots

    const ga4  = snaps.filter((x) => x.platformAccount.platform === 'GA4')
    // `ads` = plataformas de ANÚNCIO (spend); exclui fontes de receita
    // (GA4/GA4SYNC/NUVEMSHOP) para não misturar orders GA4SYNC em adPurchases.
    const ads  = snaps.filter(
      (x) => !['GA4', 'GA4SYNC', 'NUVEMSHOP'].includes(x.platformAccount.platform),
    )

    const spend        = ads.reduce((s, x) => s + Number(x.spend ?? 0), 0)
    const sessions     = ga4.reduce((s, x) => s + (x.clicks ?? 0), 0)
    // Receita/ROAS/pedidos canônicos via fonte única (roteia por businessType +
    // precedência GA4SYNC>GA4 por dia).
    const aggSnaps  = snaps.map(toAgg)
    const revenue   = aggregateSnapshots(aggSnaps, 'FATURAMENTO', c.businessType) ?? 0
    const roas      = aggregateSnapshots(aggSnaps, 'ROAS', c.businessType)
    const purchases = aggregateSnapshots(aggSnaps, 'CONVERSIONS', c.businessType) ?? 0
    const cpa           = spend > 0 && purchases > 0 ? spend / purchases : null
    const cps           = spend > 0 && sessions > 0 ? spend / sessions : null
    const taxaConversao = sessions > 0 && purchases > 0 ? (purchases / sessions) * 100 : null

    const overallStatus = deriveOverallStatus(c.healthScores, weekStart, monthStart)

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
      hasActiveGoal: goalClientIds.has(c.id),
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
  const { start: monthStart } = getMonthRange(now)
  const { start: weekStart } = getWeekRange()
  const fetchFrom = monthStart < weekStart ? monthStart : weekStart

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
        // Fetch weekly+monthly; a janela canônica é escolhida no helper.
        where: { periodStart: { gte: fetchFrom } },
        select: { status: true, metric: true, achievementPct: true, period: true, periodStart: true },
      },
    },
    orderBy: { name: 'asc' },
  })

  // Fetch current month KPIs for all clients in one query (sem N+1: um findMany).
  const allSnaps = await prisma.metricSnapshot.findMany({
    where: { clientId: { in: clients.map((c) => c.id) }, date: { gte: monthStart } },
    select: { clientId: true, date: true, spend: true, conversions: true, conversionValue: true, netRevenue: true, platformAccount: { select: { platform: true } } },
  })
  // Agrupa por cliente para rotear receita/ROAS por businessType (fonte única).
  const snapsByClient = new Map<string, AggregatableSnapshot[]>()
  const spendByClient = new Map<string, number>()
  for (const s of allSnaps) {
    if (!snapsByClient.has(s.clientId)) snapsByClient.set(s.clientId, [])
    snapsByClient.get(s.clientId)!.push(toAgg(s))
    // monthSpend na definição CANÔNICA (A-006): só plataformas de anúncio.
    // `isAdPlatform` exclui GA4/GA4SYNC/NUVEMSHOP — antes `!== 'GA4'` deixava
    // GA4SYNC/NUVEMSHOP no somatório (spend nulo hoje, mas divergente por design
    // de monthRoas, que já usa aggregateSnapshots→isAdPlatform).
    if (isAdPlatform(s.platformAccount.platform)) {
      spendByClient.set(s.clientId, (spendByClient.get(s.clientId) ?? 0) + Number(s.spend ?? 0))
    }
  }

  return clients.map((c): ClientListItem => {
    const cSnaps = snapsByClient.get(c.id) ?? []
    const monthRevenue = aggregateSnapshots(cSnaps, 'FATURAMENTO', c.businessType) ?? 0
    const monthSpend   = spendByClient.get(c.id) ?? 0
    const monthRoas    = aggregateSnapshots(cSnaps, 'ROAS', c.businessType)
    // Janela canônica unificada — mesma régua do grid/tabela.
    const scores = selectCanonicalScores(c.healthScores, weekStart, monthStart)
    // A-121: atingimento geral SEM SPEND/INVESTMENT (fonte única).
    const avgPct = overallAchievementPct(scores) ?? 0

    const overallStatus = deriveOverallStatus(c.healthScores, weekStart, monthStart)

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
      monthRevenue,
      monthSpend,
      monthRoas: monthRoas !== null ? Math.round(monthRoas * 100) / 100 : null,
    }
  })
}

export const getClientsList = unstable_cache(_fetchClientsList, ['getClientsList'], { revalidate: 30 })

// ─── Client detail ────────────────────────────────────────────────────────────

export const getClientDetail = cache(async (
  slug: string,
  viewer: { userId: string; role: string },
) => {
  const { start: weekStart, end: weekEnd } = getWeekRange()
  const { start: monthStart, end: monthEnd } = getMonthRange()

  // Posse (CLAUDE.md #1/#2): ADMIN/CS veem qualquer cliente; MANAGER/ANALYST
  // só veem clientes atribuídos. Sem atribuição, o cliente é invisível (null).
  const ownershipWhere: Prisma.ClientWhereInput = canViewAll(viewer.role)
    ? {}
    : { assignments: { some: { userId: viewer.userId } } }

  const client = await prisma.client.findFirst({
    where: { slug, ...ownershipWhere },
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

  // Recorte de campos sensíveis (fee/valor de contrato/dia de cobrança da
  // AGÊNCIA) — só ADMIN. Budget de mídia/performance permanece visível.
  if (client && normalizeRole(viewer.role) !== 'ADMIN') {
    return stripSensitive(normalizeRole(viewer.role), 'Client', client) as typeof client
  }

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
  // GA4Sync: há receita LÍQUIDA (GA4SYNC.netRevenue) no período? Rotula a fonte
  // do KPI de receita como "líquido" vs "bruto" na UI. NÃO altera a agregação
  // canônica (aggregateSnapshots já dá precedência ao líquido).
  hasNetRevenue: boolean
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
  // Conversão — PEDIDOS canônicos (CONVERSIONS net-aware via aggregateSnapshots)
  compras: number
  comprasTrend: number | null
  // Clientes novos (1ª compra) no período — soma de newCustomers das snaps
  // (NUVEMSHOP > GA4SYNC). null = a fonte ainda não captura (UI mostra "—").
  clientesNovos: number | null
  clientesNovosTrend: number | null
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
  // Vendas via Meta Ads (restaurantes / e-com com pixel de compra)
  adVendas: number | null       // compras registradas pelo pixel Meta
  adRevenueMeta: number | null  // receita registrada pelo pixel Meta
  custoVenda: number | null     // spend / adVendas
  ticketMedioMeta: number | null // adRevenueMeta / adVendas
}

export const getClientKPIs = cache(async (
  clientId: string,
  fromStr?: string,
  toStr?: string,
): Promise<ClientKPIs> => {
  const today = new Date()

  // Default: 1st of current month → AGORA (mesmo limite superior do helper de
  // realizado, que encerra a janela MTD em `now`; antes terminava "ontem" e
  // divergia do REALIZADO exibido nas outras telas).
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1)
  const defaultTo   = new Date(today)

  const rangeFrom = fromStr ? new Date(fromStr + 'T00:00:00') : defaultFrom
  const rangeTo   = toStr   ? new Date(toStr   + 'T23:59:59') : defaultTo

  // Comparison period: same duration immediately before rangeFrom
  const durationMs   = rangeTo.getTime() - rangeFrom.getTime()
  const prevTo       = new Date(rangeFrom.getTime() - 1)           // 1ms before start
  const prevFrom     = new Date(prevTo.getTime() - durationMs)

  // QA Onda B: no MTD default o rótulo "dia N" segue o dia-parede SP (mesma
  // âncora do pró-rata/projeção), não o fuso do servidor (off-by-one 21h-24h).
  const daysInRange  = (!fromStr && !toStr)
    ? spDayInfo().daysElapsedInMonth
    : Math.round(durationMs / 86_400_000) + 1
  const daysInMonth  = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()

  // For projection: only relevant when range starts on 1st of a month
  const isMTD = rangeFrom.getDate() === 1 && rangeFrom.getMonth() === rangeTo.getMonth()

  const snapInclude = { platformAccount: { select: { platform: true } } } as const

  const [client, currSnaps, prevSnaps] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { businessType: true } }),
    prisma.metricSnapshot.findMany({ where: { clientId, date: { gte: rangeFrom, lte: rangeTo } }, include: snapInclude }),
    prisma.metricSnapshot.findMany({ where: { clientId, date: { gte: prevFrom, lte: prevTo } }, include: snapInclude }),
  ])
  const businessType: BusinessType = client?.businessType ?? 'ECOMMERCE'

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
    const ga4sync   = snaps.filter((x) => x.platformAccount.platform === 'GA4SYNC')
    const nuvemshop = snaps.filter((x) => x.platformAccount.platform === 'NUVEMSHOP')

    const metaSpend   = meta.reduce((s, x) => s + Number(x.spend ?? 0), 0)
    const googleSpend = google.reduce((s, x) => s + Number(x.spend ?? 0), 0)
    const tiktokSpend = tiktok.reduce((s, x) => s + Number(x.spend ?? 0), 0)
    const totalSpend  = metaSpend + googleSpend + tiktokSpend

    // Receita canônica via fonte única (roteia GA4/GA4SYNC p/ ECOMMERCE, Meta p/
    // LOCAL/B2B). Para ECOMMERCE sem GA4SYNC, retorna exatamente a soma GA4 de antes.
    const revenue  = aggregateSnapshots(snaps.map(toAgg), 'FATURAMENTO', businessType) ?? 0
    // Receita LÍQUIDA autoritativa do GA4Sync (só p/ rótulo de fonte; a agregação
    // canônica acima já aplica a precedência líquido > bruto).
    const netRevenue = snaps
      .filter((x) => x.platformAccount.platform === 'GA4SYNC')
      .reduce((s, x) => s + Number(x.netRevenue ?? 0), 0)
    // PEDIDOS canônicos (só ECOMMERCE — régua-padrão dos 8): mesma fonte net-aware
    // da receita (NUVEMSHOP > GA4SYNC > GA4 por dia) via aggregateSnapshots, sem
    // contagem paralela (regra 0). LOCAL/B2B ficam INTOCADOS (GA4 inline como antes).
    const purchases = businessType === 'ECOMMERCE'
      ? (aggregateSnapshots(snaps.map(toAgg), 'CONVERSIONS', businessType) ?? 0)
      : ga4.reduce((s, x) => s + (x.conversions ?? 0), 0)
    const sessions  = ga4.reduce((s, x) => s + (x.clicks ?? 0), 0)
    const newUsers  = ga4.reduce((s, x) => s + (x.newUsers ?? 0), 0)
    // Clientes novos (1ª compra): `newCustomers` das snaps de RECEITA real da
    // loja com precedência POR DIA (NUVEMSHOP > GA4SYNC — mesma mecânica do
    // ecomDayMerge do FATURAMENTO; precedência por janela subcontaria dias em
    // que só uma das fontes capturou). null quando nenhuma fonte captura → UI
    // mostra "—" (nunca zero falso).
    const ncByDay = new Map<string, { nuvem: number | null; sync: number | null }>()
    for (const x of [...nuvemshop, ...ga4sync]) {
      if (x.newCustomers == null) continue
      const key = x.date.toISOString().slice(0, 10)
      const day = ncByDay.get(key) ?? { nuvem: null, sync: null }
      if (x.platformAccount.platform === 'NUVEMSHOP') day.nuvem = (day.nuvem ?? 0) + x.newCustomers
      else day.sync = (day.sync ?? 0) + x.newCustomers
      ncByDay.set(key, day)
    }
    let newCustomers: number | null = null
    for (const day of ncByDay.values()) {
      const v = day.nuvem ?? day.sync
      if (v != null) newCustomers = (newCustomers ?? 0) + v
    }
    const adImpr    = meta.reduce((s, x) => s + (x.impressions ?? 0), 0)
    // Link CTR = ad clicks / impressions (not stored ctr which is CTR All)
    const ads            = snaps.filter((x) => x.platformAccount.platform !== 'GA4')
    const adClicks       = ads.reduce((s, x) => s + (x.clicks ?? 0), 0)
    const allImpr        = ads.reduce((s, x) => s + (x.impressions ?? 0), 0)
    const adReach        = ads.reduce((s, x) => s + (x.reach ?? 0), 0)
    const adConversions  = ads.reduce((s, x) => s + (x.conversions ?? 0), 0)
    // Meta-only conversions — used for adVendas so purchase count stays platform-specific
    const metaConversions = meta.reduce((s, x) => s + (x.conversions ?? 0), 0)
    const ctrLink        = allImpr > 0 && adClicks > 0 ? (adClicks / allImpr) * 100 : null
    const cpcLink        = totalSpend > 0 && adClicks > 0 ? totalSpend / adClicks : null

    // ROAS canônico via fonte única. roasMeta/Google/Tiktok permanecem inline —
    // são BREAKDOWN por plataforma (exibição), não o ROAS canônico do cliente.
    const roas       = aggregateSnapshots(snaps.map(toAgg), 'ROAS', businessType)
    const roasMeta   = metaSpend   > 0 && revenue > 0 ? revenue / metaSpend   : null
    const roasGoogle = googleSpend > 0 && revenue > 0 ? revenue / googleSpend : null
    const roasTiktok = tiktokSpend > 0 && revenue > 0 ? revenue / tiktokSpend : null

    // Meta purchase conversions (restaurantes com pixel de compra)
    const adRevenueMeta = meta.reduce((s, x) => s + Number(x.conversionValue ?? 0), 0)
    const isPurchaseCampaign = adRevenueMeta > 0
    // adVendas = Meta pixel purchases only (not cross-platform)
    const adVendas = isPurchaseCampaign ? metaConversions : 0
    // For purchase campaigns, adLeads excludes Meta purchases (avoid double-counting same events)
    const leadConversions = isPurchaseCampaign ? adConversions - metaConversions : adConversions

    // New Meta-specific fields for local business
    const mensagens        = meta.reduce((s, x) => s + (x.mensagens        ?? 0), 0)
    // Effective leads: WhatsApp campaigns store conversions in mensagens, not conversions field
    const effectiveLeads   = leadConversions > 0 ? leadConversions : mensagens
    const landingPageViews = meta.reduce((s, x) => s + (x.landingPageViews ?? 0), 0)
    const thruplays        = meta.reduce((s, x) => s + (x.thruplays        ?? 0), 0)
    const videoViews3s     = meta.reduce((s, x) => s + (x.videoViews3s     ?? 0), 0)
    const metaReach        = meta.reduce((s, x) => s + (x.reach            ?? 0), 0)
    const metaImpressions  = meta.reduce((s, x) => s + (x.impressions      ?? 0), 0)
    const adFrequencia     = metaReach > 0 ? metaImpressions / metaReach : null

    return {
      spend: totalSpend, metaSpend, googleSpend, tiktokSpend,
      sessions, purchases, revenue, netRevenue, adImpr, newUsers, newCustomers,
      roas, roasMeta, roasGoogle, roasTiktok,
      ctrLink, cpcLink,
      adLeads:          effectiveLeads > 0 ? effectiveLeads : null,
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
      adVendas:         adVendas > 0 ? adVendas : null,
      adRevenueMeta:    adRevenueMeta > 0 ? adRevenueMeta : null,
      custoVenda:       adVendas > 0 && metaSpend > 0 ? metaSpend / adVendas : null,
      ticketMedioMeta:  adVendas > 0 && adRevenueMeta > 0 ? adRevenueMeta / adVendas : null,
      ticketMedio:      purchases > 0 && revenue > 0 ? revenue / purchases : null,
      taxaConversao:    sessions > 0 && purchases > 0 ? (purchases / sessions) * 100 : null,
      cps:              sessions > 0 && totalSpend > 0 ? totalSpend / sessions : null,
      cpm:              adImpr > 0 && metaSpend > 0 ? (metaSpend / adImpr) * 1000 : null,
      cpa:              purchases > 0 && totalSpend > 0 ? totalSpend / purchases : null,
      cac:              purchases > 0 && totalSpend > 0 ? totalSpend / purchases : null,
      cpl:              effectiveLeads > 0 && totalSpend > 0 ? totalSpend / effectiveLeads : null,
    }
  }

  const curr = compute(currSnaps)
  const prev = compute(prevSnaps)

  const pctChange = (c: number | null, p: number | null): number | null =>
    c !== null && p !== null && p !== 0 ? ((c - p) / Math.abs(p)) * 100 : null

  // A-008: projeção pela FONTE ÚNICA (projectMonth). No mês corrente (range
  // default, sem fromStr), os dias decorridos/total vêm do dia-parede SP; para
  // um mês MTD explícito (fromStr passado) mantém-se daysInRange/daysInMonth do
  // período pedido (comportamento anterior para janelas históricas).
  const sp = spDayInfo(today)
  const isCurrentSpMonth = isMTD && !fromStr
  const projecaoMes = isMTD && curr.revenue > 0
    ? projectMonth(
        curr.revenue,
        isCurrentSpMonth ? sp.daysElapsedInMonth : daysInRange,
        isCurrentSpMonth ? sp.totalDaysInMonth : daysInMonth,
      )
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
    hasNetRevenue: curr.netRevenue > 0,
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
    clientesNovos: curr.newCustomers,
    clientesNovosTrend: pctChange(curr.newCustomers, prev.newCustomers),
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
    adVendas:         curr.adVendas,
    adRevenueMeta:    curr.adRevenueMeta,
    custoVenda:       curr.custoVenda,
    ticketMedioMeta:  curr.ticketMedioMeta,
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

  const [client, snapshots] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { businessType: true } }),
    prisma.metricSnapshot.findMany({
      where: { clientId, date: { gte: since } },
      orderBy: { date: 'asc' },
      include: { platformAccount: { select: { platform: true } } },
    }),
  ])
  const businessType: BusinessType = client?.businessType ?? 'ECOMMERCE'

  const byDate = new Map<string, {
    spend: number; ga4Purchases: number; ga4Sessions: number; hasData: boolean;
    snaps: AggregatableSnapshot[];
  }>()

  for (const s of snapshots) {
    const key = s.date.toISOString().slice(0, 10)
    if (!byDate.has(key)) {
      byDate.set(key, { spend: 0, ga4Purchases: 0, ga4Sessions: 0, hasData: false, snaps: [] })
    }
    const d = byDate.get(key)!
    d.hasData = true
    d.snaps.push(toAgg(s))
    if (s.platformAccount.platform === 'GA4') {
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
      // Receita/ROAS/ticket médio via fonte única (roteia por businessType).
      // taxaConversao/cps permanecem GA4 (métricas de funil e-commerce, fora do
      // escopo receita/ROAS).
      result.push({
        date: key,
        spend:         agg.spend || null,
        conversions:   agg.ga4Purchases || null,
        roas:          aggregateSnapshots(agg.snaps, 'ROAS', businessType),
        taxaConversao: agg.ga4Sessions > 0 && agg.ga4Purchases > 0 ? (agg.ga4Purchases / agg.ga4Sessions) * 100 : null,
        ticketMedio:   aggregateSnapshots(agg.snaps, 'TICKET_MEDIO', businessType),
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

  const [client, snapshots] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { businessType: true } }),
    prisma.metricSnapshot.findMany({
      where: { clientId, date: { gte: from, lte: to } },
      select: {
        date: true,
        spend: true,
        conversions: true,
        conversionValue: true,
        netRevenue: true,
        platformAccount: { select: { platform: true } },
      },
      orderBy: { date: 'asc' },
    }),
  ])
  const businessType: BusinessType = client?.businessType ?? 'ECOMMERCE'

  const byDate = new Map<string, { spend: number; snaps: AggregatableSnapshot[] }>()
  for (const s of snapshots) {
    const key = s.date.toISOString().slice(0, 10)
    if (!byDate.has(key)) byDate.set(key, { spend: 0, snaps: [] })
    const d = byDate.get(key)!
    d.snaps.push(toAgg(s))
    if (s.platformAccount.platform !== 'GA4') {
      d.spend += Number(s.spend ?? 0)
    }
  }

  const result: DailyRevenuePoint[] = []
  let accumulated = 0
  const current = new Date(from)
  while (current <= to) {
    const key = current.toISOString().slice(0, 10)
    const agg = byDate.get(key)
    // Receita canônica via fonte única (roteia por businessType).
    const revenue = agg ? (aggregateSnapshots(agg.snaps, 'FATURAMENTO', businessType) ?? 0) : 0
    const spend = agg?.spend ?? 0
    accumulated += revenue
    result.push({ date: key, revenue, spend, accumulated })
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

  const [client, snapshots] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { businessType: true } }),
    prisma.metricSnapshot.findMany({
      where: { clientId, date: { gte: rangeStart } },
      select: {
        date: true,
        spend: true,
        conversions: true,
        conversionValue: true,
        netRevenue: true,
        platformAccount: { select: { platform: true } },
      },
    }),
  ])
  const businessType: BusinessType = client?.businessType ?? 'ECOMMERCE'

  // Build month buckets in memory
  const buckets = new Map<string, { spend: number; label: string; snaps: AggregatableSnapshot[] }>()
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.set(`${d.getFullYear()}-${d.getMonth()}`, {
      spend: 0,
      label: `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      snaps: [],
    })
  }

  for (const s of snapshots) {
    const d = new Date(s.date)
    const bucket = buckets.get(`${d.getFullYear()}-${d.getMonth()}`)
    if (!bucket) continue
    bucket.snaps.push(toAgg(s))
    if (s.platformAccount.platform !== 'GA4') {
      bucket.spend += Number(s.spend ?? 0)
    }
  }

  // Receita/ROAS canônicos via fonte única (roteia por businessType + GA4SYNC).
  return Array.from(buckets.values()).map((m) => {
    const revenue = aggregateSnapshots(m.snaps, 'FATURAMENTO', businessType) ?? 0
    const roas    = aggregateSnapshots(m.snaps, 'ROAS', businessType)
    return {
      month: m.label,
      revenue,
      spend: m.spend,
      roas: roas !== null ? Math.round(roas * 100) / 100 : null,
    }
  })
}

export const getClientMonthlyComparison = (clientId: string, months = 6) =>
  unstable_cache(_fetchMonthlyComparison, ['getClientMonthlyComparison', clientId], { revalidate: 300 })(clientId, months)

// ─── Clients for select dropdowns ─────────────────────────────────────────────

export const getClientsForSelect = cache(async (userId: string, role: string) => {
  const where: Prisma.ClientWhereInput =
    canViewAll(role) ? {} : { assignments: { some: { userId } } }

  return prisma.client.findMany({
    where,
    select: { id: true, name: true, razaoSocial: true, slug: true },
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
  weekEnd: Date,
  viewer: { userId: string; role: string },
) => {
  const role5 = normalizeRole(viewer.role)
  const isAdmin = role5 === 'ADMIN'
  // Posse (RBAC v2): GESTOR só lê cliente da carteira; o clientId vem da URL,
  // então filtramos no banco (findFirst + scopeClients) — fora do escopo = null.
  const client = await prisma.client.findFirst({
    where: { id: clientId, ...scopeClients(role5, viewer.userId) },
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

  const visibleGoals = goals
    // Metas de RECEITA (FATURAMENTO/SALES/TICKET_MEDIO/CAC) são financeiras —
    // some da lista para não-ADMIN (regra 5.1 do RBAC; evita vazar em /reports).
    .filter((g) => isAdmin || !isRevenueMetric(g.metric))

  // REALIZADO vem da fonte única (getRealizado), não do HealthScore.actualValue.
  // HealthScore permanece como STATUS. Batch numa única query de snapshots.
  // Janela EXPLÍCITA da semana SELECIONADA (o /reports navega por weekOffset):
  // usar 'SEMANA_FECHADA' fixaria sempre a última semana e desalinharia o
  // realizado da meta/status da semana escolhida (apontado pelo guardião).
  const realizadoByMetric = await getRealizadoForMetrics(
    clientId,
    visibleGoals.map((g) => g.metric),
    { start: weekStart, end: weekEnd, label: 'na semana selecionada' },
  )

  // A-002 (P2=A): o alvo comparado passa a ser o PRÓ-RATA "esperado até hoje"
  // (proporcional aos dias decorridos da semana selecionada) e o pct é
  // recalculado AO VIVO (realizado ÷ esperado), não mais o achievementPct
  // congelado no cron. O status (badge) segue vindo do HealthScore. Elapsed da
  // semana pela fonte única (dia-parede SP): semana passada → esperado = meta cheia.
  const { totalDays: weekTotalDays, daysElapsed: weekDaysElapsed } = periodElapsed(weekStart, weekEnd)

  const metrics = visibleGoals
    .map((g) => {
    const hs = g.healthScores[0]
    const rawTarget = Number(g.targetValue)
    const actual = realizadoByMetric.get(g.metric)?.valor ?? null
    const livePct = actual !== null
      ? liveAchievementPct(g.metric, actual, rawTarget, weekDaysElapsed, weekTotalDays)
      : null
    return {
      metric: g.metric,
      label: metricLabels[g.metric] ?? g.metric,
      target: rawTarget,
      // "esperado até hoje" (alvo pró-rata da semana em andamento).
      expected: proRataExpected(g.metric, rawTarget, weekDaysElapsed, weekTotalDays),
      actual,
      status: hs?.status ?? null,
      pct: livePct !== null ? Math.round(livePct) : null,
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
  const where: Prisma.TaskWhereInput =
    canViewAll(role)
      ? {}
      : { OR: [{ assignedTo: userId }, { client: { assignments: { some: { userId } } } }] }

  return prisma.task.findMany({
    where,
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    include: {
      client: { select: { name: true, slug: true } },
      user: { select: { name: true } },
    },
  })
})

// ─── BLOCO 2 — Central Operacional (board de tarefas) ──────────────────────────

export type OperacionalTask = {
  id: string
  title: string
  status: string
  priority: string
  type: string
  dueDate: Date | null
  requestedAt: Date | null
  createdAt: Date
  completedAt: Date | null
  clientId: string | null
  clientName: string | null
  clientSlug: string | null
  clientHealth: 'OTIMO' | 'REGULAR' | 'RUIM' | null
  /** Responsável principal (espelho `assignedTo`, D-005). */
  assigneeId: string
  assigneeName: string
  /** Lista completa de responsáveis (principal + auxiliares, M:N — D-005). */
  assignees: { id: string; name: string }[]
  areaName: string | null
  /** Código da Área (AreaCode) — chave estável p/ filtro/agrupamento por Categoria. */
  areaCode: string | null
  popCode: string | null
  slaHours: number | null
  slaBreached: boolean
  // ── Campos p/ as views ClickUp-class (Fase 4b) ─────────────────────────────
  tags: string[]
  /** Ordenação manual fractional (D-003). NULL cai p/ dueDate na leitura. */
  orderIndex: string | null
  checklistDone: number
  checklistTotal: number
  commentCount: number
}

export type OperacionalBoard = {
  tasks: OperacionalTask[]
  kpis: { abertas: number; atrasadas: number; aguardando: number; noPrazoPct: number; warRoom: number }
}

const AGUARDANDO_STATUS = new Set(['AGUARDANDO_CLIENTE', 'AGUARDANDO_GESTOR', 'AGUARDANDO_CS', 'EM_VALIDACAO'])

/** Board da Central Operacional: tarefas role-scoped + KPIs. */
export const getOperacionalBoard = cache(
  async (userId: string, role: string): Promise<OperacionalBoard> => {
    const where: Prisma.TaskWhereInput = canViewAll(role)
      ? {}
      : { OR: [{ assignedTo: userId }, { client: { assignments: { some: { userId } } } }] }

    const rows = await prisma.task.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        type: true,
        dueDate: true,
        requestedAt: true,
        createdAt: true,
        completedAt: true,
        clientId: true,
        assignedTo: true,
        tags: true,
        orderIndex: true,
        slaHours: true,
        slaBreached: true,
        client: { select: { name: true, slug: true, statusStreak: { select: { status: true } } } },
        user: { select: { name: true } },
        area: { select: { name: true, code: true } },
        pop: { select: { code: true } },
        auxAssignees: { select: { userId: true } },
        checklist: { select: { done: true } },
        _count: { select: { comments: true } },
      },
    })

    // Nomes dos responsáveis auxiliares (M:N não tem relação de user direta).
    // Uma única query em lote resolve todos os ids envolvidos (evita N+1).
    const auxIds = Array.from(new Set(rows.flatMap((t) => t.auxAssignees.map((a) => a.userId))))
    const auxUsers = auxIds.length
      ? await prisma.user.findMany({ where: { id: { in: auxIds } }, select: { id: true, name: true } })
      : []
    const auxNameMap = new Map(auxUsers.map((u) => [u.id, u.name]))

    // Atraso: só conta como atrasada se o prazo caiu ANTES do início de hoje em
    // SP (dueDate é meio-dia UTC; comparar com Date.now() marcava atraso às 09h
    // do próprio dia do prazo).
    const atrasoLimite = startOfTodaySaoPaulo().getTime()
    const tasks: OperacionalTask[] = rows.map((t) => {
      const primaryName = t.user?.name ?? '—'
      const assignees = [
        { id: t.assignedTo, name: primaryName },
        ...t.auxAssignees
          .filter((a) => a.userId !== t.assignedTo)
          .map((a) => ({ id: a.userId, name: auxNameMap.get(a.userId) ?? 'Responsável' })),
      ]
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        type: t.type,
        dueDate: t.dueDate,
        requestedAt: t.requestedAt,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
        clientId: t.clientId,
        clientName: t.client?.name ?? null,
        clientSlug: t.client?.slug ?? null,
        clientHealth: t.client?.statusStreak?.status ?? null,
        assigneeId: t.assignedTo,
        assigneeName: primaryName,
        assignees,
        areaName: t.area?.name ?? null,
        areaCode: t.area?.code ?? null,
        popCode: t.pop?.code ?? null,
        slaHours: t.slaHours,
        slaBreached: t.slaBreached,
        tags: t.tags,
        orderIndex: t.orderIndex,
        checklistDone: t.checklist.filter((c) => c.done).length,
        checklistTotal: t.checklist.length,
        commentCount: t._count.comments,
      }
    })

    const abertasList = tasks.filter((t) => t.status !== 'CONCLUIDO' && t.status !== 'CANCELADO')
    const abertas = abertasList.length
    const atrasadas = abertasList.filter((t) => t.dueDate != null && new Date(t.dueDate).getTime() < atrasoLimite).length
    const aguardando = abertasList.filter((t) => AGUARDANDO_STATUS.has(t.status)).length
    const warRoom = tasks.filter((t) => t.type === 'WAR_ROOM' && t.status !== 'CONCLUIDO' && t.status !== 'CANCELADO').length
    const noPrazoPct = abertas > 0 ? Math.round(((abertas - atrasadas) / abertas) * 100) : 100

    return { tasks, kpis: { abertas, atrasadas, aguardando, noPrazoPct, warRoom } }
  },
)

export type NovaTarefaCliente = {
  id: string
  name: string
  managerName: string | null
  openTasks: number
  overdueTasks: number
}
export type NovaTarefaContext = {
  clientes: NovaTarefaCliente[]
  areas: { id: string; code: string; name: string }[]
  pops: { id: string; code: string; name: string; areaId: string }[]
  usuarios: { id: string; name: string; role: string }[]
}

/** Contexto para criar tarefa: clientes (com gestor + tarefas abertas), áreas, POPs, usuários. */
export const getNovaTarefaContext = cache(
  async (userId: string, role: string): Promise<NovaTarefaContext> => {
    const clientWhere: Prisma.ClientWhereInput = canViewAll(role)
      ? { status: 'ACTIVE' }
      : { status: 'ACTIVE', assignments: { some: { userId } } }
    // Atrasada = prazo anterior ao início de HOJE em SP (ver util).
    const atrasoLimite = startOfTodaySaoPaulo().getTime()

    const [clients, areas, pops, usuarios] = await Promise.all([
      prisma.client.findMany({
        where: clientWhere,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          assignments: {
            where: { isPrimary: true },
            select: { user: { select: { name: true } } },
            take: 1,
          },
          tasks: {
            where: { status: { notIn: ['CONCLUIDO', 'CANCELADO'] } },
            select: { id: true, dueDate: true },
          },
        },
      }),
      prisma.taskArea.findMany({ orderBy: { order: 'asc' }, select: { id: true, code: true, name: true } }),
      prisma.pOPProcess.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, areaId: true } }),
      prisma.user.findMany({
        where: { active: true },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, role: true },
      }),
    ])

    const clientes: NovaTarefaCliente[] = clients.map((c) => ({
      id: c.id,
      name: c.name,
      managerName: c.assignments[0]?.user?.name ?? null,
      openTasks: c.tasks.length,
      overdueTasks: c.tasks.filter((t) => t.dueDate != null && new Date(t.dueDate).getTime() < atrasoLimite).length,
    }))

    return { clientes, areas, pops: pops.map((p) => ({ ...p })), usuarios }
  },
)

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

// ─── War Room — responsáveis elegíveis (WAR-14) ────────────────────────────────

export type WarRoomResponsibleOption = { id: string; name: string; role: string }

/** Usuários ativos que podem ser responsáveis por uma War Room (staff: ADMIN, CS, tráfego). */
export const getWarRoomResponsibleOptions = cache(
  async (): Promise<WarRoomResponsibleOption[]> => {
    return prisma.user.findMany({
      where: {
        active: true,
        role: { in: ['ADMIN', 'CS', 'GESTOR_TRAFEGO', 'SUPERVISOR_TRAFEGO', 'ANALISTA_TRAFEGO', 'MANAGER', 'ANALYST'] },
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, role: true },
    })
  },
)

// ─── Cockpit — visão única da agência (incremental) ────────────────────────────

export type CockpitData = {
  clientesOk: number
  clientesAtencao: number
  clientesCriticos: number
  // Sem HealthScore na janela canônica: distingue "tem meta, aguardando dados"
  // de "sem meta configurada" (o streak não distinguia).
  clientesAguardandoDados: number
  clientesSemMeta: number
  warRoomsAtivas: number
  warRoomsSemCriterio: number
  demandasAtrasadas: number
  contratosVencendo30d: number
  alertasNaoLidos: number
  // Financeiro — apenas ADMIN (null para os demais papéis)
  faturasVencidas: { count: number; total: number } | null
  ultimaAtualizacao: Date | null
}

/**
 * Cockpit: agrega os sinais que JÁ têm dado confiável. Cada novo POP pluga seu
 * bloco aqui conforme as fatias entram. Role-scoped; financeiro só p/ ADMIN/CS.
 */
export const getCockpitData = cache(
  async (userId: string, role: string): Promise<CockpitData> => {
    const viewAll = canViewAll(role)
    const clientScope: Prisma.ClientWhereInput = viewAll
      ? { status: 'ACTIVE' }
      : { status: 'ACTIVE', assignments: { some: { userId } } }

    const now = new Date()
    const in30d = new Date(now.getTime() + 30 * 86_400_000)
    // Atrasada = prazo anterior ao início de HOJE em SP (ver util).
    const atrasoLimite = startOfTodaySaoPaulo(now)

    const taskScope: Prisma.TaskWhereInput = viewAll
      ? {}
      : { OR: [{ client: { assignments: { some: { userId } } } }, { assignedTo: userId }] }

    // Contadores de saúde derivados da MESMA fonte/cálculo do grid (HealthScore
    // na janela canônica), não do ClientStatusStreak — para os números baterem.
    const { start: weekStart } = getWeekRange()
    const { start: monthStart } = getMonthRange()
    const fetchFrom = monthStart < weekStart ? monthStart : weekStart
    const healthClients = await prisma.client.findMany({
      where: clientScope,
      select: {
        id: true,
        healthScores: {
          where: { periodStart: { gte: fetchFrom } },
          select: { status: true, period: true, periodStart: true },
        },
      },
    })
    const cockpitGoalClientIds = await getClientsWithActiveGoal(
      healthClients.map((c) => c.id),
      monthStart,
      weekStart,
    )
    let clientesOk = 0
    let clientesAtencao = 0
    let clientesCriticos = 0
    let clientesAguardandoDados = 0
    let clientesSemMeta = 0
    for (const c of healthClients) {
      const status = deriveOverallStatus(c.healthScores, weekStart, monthStart)
      if (status === 'OTIMO') clientesOk++
      else if (status === 'REGULAR') clientesAtencao++
      else if (status === 'RUIM') clientesCriticos++
      else if (cockpitGoalClientIds.has(c.id)) clientesAguardandoDados++
      else clientesSemMeta++
    }

    const [
      warRoomsAtivas,
      warRoomsSemCriterio,
      demandasAtrasadas,
      contratosVencendo30d,
      alertasNaoLidos,
      faturasAgg,
      lastSync,
    ] = await Promise.all([
      prisma.criticalProtocol.count({
        where: { status: { not: 'ENCERRADO' }, client: clientScope },
      }),
      prisma.criticalProtocol.count({
        where: { status: { not: 'ENCERRADO' }, exitCriteria: null, client: clientScope },
      }),
      prisma.task.count({
        where: {
          status: { notIn: ['CONCLUIDO', 'CANCELADO'] },
          dueDate: { lt: atrasoLimite },
          ...taskScope,
        },
      }),
      prisma.contract.count({
        where: { status: 'VIGENTE', endDate: { gte: now, lte: in30d }, client: clientScope },
      }),
      prisma.alert.count({ where: { read: false, client: clientScope } }),
      // Financeiro (faturas vencidas Asaas) é dado de RECEITA da agência: SÓ
      // ADMIN. viewAll não basta — SUPERVISOR/ANALISTA/CS não veem financeiro.
      normalizeRole(role) === 'ADMIN'
        ? prisma.asaasPayment.aggregate({
            where: { status: 'OVERDUE' },
            _count: true,
            _sum: { value: true },
          })
        : Promise.resolve(null),
      prisma.syncLog.findFirst({
        where: { status: 'SUCCESS', completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true },
      }),
    ])

    return {
      clientesOk,
      clientesAtencao,
      clientesCriticos,
      clientesAguardandoDados,
      clientesSemMeta,
      warRoomsAtivas,
      warRoomsSemCriterio,
      demandasAtrasadas,
      contratosVencendo30d,
      alertasNaoLidos,
      faturasVencidas: faturasAgg
        ? { count: faturasAgg._count, total: Number(faturasAgg._sum.value ?? 0) }
        : null,
      ultimaAtualizacao: lastSync?.completedAt ?? null,
    }
  },
)

// ─── FIN-19 — Contas a receber e inadimplência ─────────────────────────────────

export type ReguaStep =
  | 'Vencida'
  | 'Cobrança (D+3)'
  | 'Cobrança firme (D+7)'
  | 'Pausa sugerida (D+15)'
  | 'Escalar Marcos (D+30)'

/** Passo da régua de cobrança a partir dos dias em atraso. */
export function reguaStep(daysOverdue: number): ReguaStep {
  if (daysOverdue >= 30) return 'Escalar Marcos (D+30)'
  if (daysOverdue >= 15) return 'Pausa sugerida (D+15)'
  if (daysOverdue >= 7) return 'Cobrança firme (D+7)'
  if (daysOverdue >= 3) return 'Cobrança (D+3)'
  return 'Vencida'
}

export type OverdueInvoiceRow = {
  id: string
  clientName: string
  clientRazaoSocial: string | null
  clientSlug: string | null
  value: number
  dueDate: Date
  daysOverdue: number
  regua: ReguaStep
  invoiceUrl: string | null
}

/** Fila priorizada de faturas vencidas (mais atrasada primeiro). ADMIN/CS apenas. */
export const getOverdueInvoices = cache(
  async (role: string): Promise<OverdueInvoiceRow[]> => {
    if (!canViewAll(role)) return []

    // A-116: boundary "hoje" = 00:00Z do dia-parede SP (dueDate é `@db.Date`,
    // volta 00:00Z). Mesmo instante usado pelos KPIs de /financeiro — antes a
    // fila usava meia-noite do fuso do servidor e divergia na virada do dia.
    const today = spDayInfo().spDayStartUtc

    const payments = await prisma.asaasPayment.findMany({
      where: { status: 'OVERDUE', dueDate: { lte: today } },
      orderBy: { dueDate: 'asc' },
      select: {
        id: true,
        value: true,
        dueDate: true,
        invoiceUrl: true,
        customer: {
          select: { name: true, client: { select: { name: true, razaoSocial: true, slug: true } } },
        },
      },
    })

    return payments.map((p) => {
      const days = Math.floor((today.getTime() - new Date(p.dueDate).getTime()) / 86_400_000)
      return {
        id: p.id,
        clientName: p.customer?.client?.name ?? p.customer?.name ?? 'Sem cliente vinculado',
        clientRazaoSocial: p.customer?.client?.razaoSocial ?? null,
        clientSlug: p.customer?.client?.slug ?? null,
        value: Number(p.value),
        dueDate: p.dueDate,
        daysOverdue: days,
        regua: reguaStep(days),
        invoiceUrl: p.invoiceUrl,
      }
    })
  },
)

export type ClientWithoutBillingRow = { id: string; name: string; slug: string }

/** Clientes ativos sem assinatura ativa no Asaas (cobrança não configurada). ADMIN/CS. */
export const getClientsWithoutBilling = cache(
  async (role: string): Promise<ClientWithoutBillingRow[]> => {
    if (!canViewAll(role)) return []

    return prisma.client.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { asaasCustomer: null },
          { asaasCustomer: { subscriptions: { none: { status: 'ACTIVE' } } } },
        ],
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true },
    })
  },
)

/**
 * A-114 (decisão P9=B, 2026-07-17): "clientes inadimplentes" = nº de CLIENTES
 * DISTINTOS com fatura vencida (OVERDUE) cuja data de vencimento já passou
 * (`dueDate <= hoje`). Fonte ÚNICA usada por /clients, /financeiro e pelo
 * endpoint /api/financeiro/summary — antes /clients contava faturas
 * (asaasPayment.count) e /financeiro contava clientes distintos, divergindo.
 *
 * `distinct: ['customerId']` = 1 cliente Asaas por linha (proxy de cliente da
 * agência; o boundary "hoje" é 00:00Z do dia-parede SP, igual à fila de
 * vencidos e aos KPIs financeiros).
 */
export const countInadimplentes = cache(async (): Promise<number> => {
  const today = spDayInfo().spDayStartUtc
  const rows = await prisma.asaasPayment.findMany({
    where: { status: 'OVERDUE', dueDate: { lte: today } },
    distinct: ['customerId'],
    select: { customerId: true },
  })
  return rows.length
})

// ─── A-115 — DRE canônico único (decisão P10=B) ────────────────────────────────

export type DreTotals = {
  entradas: number
  saidasAsaas: number
  saidasManuais: number
  saidas: number
  lucro: number
  margem: number
  prevEntradas: number
  prevSaidas: number
  prevLucro: number
  deltaEntradas: number
  deltaSaidas: number
  deltaLucro: number
}

/**
 * A-115 (decisão P10=B, 2026-07-17): cálculo ÚNICO do DRE, consumido pela página
 * /financeiro E pelo endpoint /api/financeiro/summary. Antes coexistiam dois
 * DREs divergentes: a página somava `asaasTransfer(DONE) + Expense` nas saídas e
 * usava `netValue` nas entradas; o endpoint somava só `Expense` e usava `value`.
 * Esta função aposenta a lógica divergente — saídas = Expense + asaasTransfer
 * DONE; entradas = netValue (fallback value).
 *
 * `from`/`to` já normalizados pelo caller (SP; `to` EXCLUSIVO). O período
 * anterior tem a MESMA duração DECORRIDA (min(`to`, agora) − `from`) e termina
 * onde o atual começa (exclusivo) — evita comparar mês parcial contra mês cheio.
 */
export const getDreTotals = cache(async (from: Date, to: Date): Promise<DreTotals> => {
  // A janela anterior cobre a MESMA duração DECORRIDA do período atual, não o
  // período cheio: com mês parcial `to` é o 1º dia do mês seguinte, então
  // `to - from` (mês inteiro) compararia os ~N dias corridos contra 30/31 e
  // distorceria o delta. duration = min(`to`, agora) − `from`.
  const now       = new Date()
  const elapsedTo = to.getTime() < now.getTime() ? to : now
  const duration  = Math.max(0, elapsedTo.getTime() - from.getTime())
  const prevFrom  = new Date(from.getTime() - duration)
  const prevTo    = from

  const [
    payments, prevPaymentsAgg,
    transfersAgg, prevTransfersAgg,
    expensesAgg, prevExpensesAgg,
  ] = await Promise.all([
    prisma.asaasPayment.findMany({
      where: { status: { in: ['RECEIVED', 'CONFIRMED'] }, paymentDate: { gte: from, lt: to } },
      select: { value: true, netValue: true },
    }),
    prisma.asaasPayment.aggregate({
      where: { status: { in: ['RECEIVED', 'CONFIRMED'] }, paymentDate: { gte: prevFrom, lt: prevTo } },
      _sum: { value: true },
    }),
    prisma.asaasTransfer.aggregate({
      where: { status: 'DONE', transferDate: { gte: from, lt: to } },
      _sum: { value: true },
    }),
    prisma.asaasTransfer.aggregate({
      where: { status: 'DONE', transferDate: { gte: prevFrom, lt: prevTo } },
      _sum: { value: true },
    }),
    prisma.expense.aggregate({
      where: { date: { gte: from, lt: to } },
      _sum: { value: true },
    }),
    prisma.expense.aggregate({
      where: { date: { gte: prevFrom, lt: prevTo } },
      _sum: { value: true },
    }),
  ])

  const entradas      = payments.reduce((s, p) => s + Number(p.netValue ?? p.value), 0)
  const saidasAsaas   = Number(transfersAgg._sum.value ?? 0)
  const saidasManuais = Number(expensesAgg._sum.value ?? 0)
  const saidas        = saidasAsaas + saidasManuais
  const lucro         = entradas - saidas
  const margem        = entradas > 0 ? (lucro / entradas) * 100 : 0

  const prevEntradas = Number(prevPaymentsAgg._sum.value ?? 0)
  const prevSaidas   = Number(prevTransfersAgg._sum.value ?? 0) + Number(prevExpensesAgg._sum.value ?? 0)
  const prevLucro    = prevEntradas - prevSaidas

  const pct = (curr: number, prev: number) =>
    prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 10000) / 100

  return {
    entradas, saidasAsaas, saidasManuais, saidas, lucro, margem,
    prevEntradas, prevSaidas, prevLucro,
    deltaEntradas: pct(entradas, prevEntradas),
    deltaSaidas:   pct(saidas, prevSaidas),
    deltaLucro:    pct(lucro, prevLucro),
  }
})

// ─── CSX-13 — Fila anti-churn proativo ─────────────────────────────────────────

export type AntiChurnQueueRow = {
  id: string
  name: string
  razaoSocial: string | null
  slug: string
  manager: string | null
  riskScore: number | null
  lastInteractionAt: Date | null
  daysSinceInteraction: number | null
  isSilent: boolean
}

const SILENT_DAYS = 14
const ANTICHURN_RISK_THRESHOLD = 40

/**
 * Fila de ação anti-churn: clientes em risco (ChurnRiskScore) priorizados, com
 * dias desde a última interação e sinal de "silencioso". Role-scoped.
 */
export const getAntiChurnQueue = cache(
  async (userId: string, role: string): Promise<AntiChurnQueueRow[]> => {
    const where: Prisma.ClientWhereInput = canViewAll(role)
      ? { status: 'ACTIVE' }
      : { status: 'ACTIVE', assignments: { some: { userId } } }

    const clients = await prisma.client.findMany({
      where,
      select: {
        id: true,
        name: true,
        razaoSocial: true,
        slug: true,
        assignments: {
          where: { isPrimary: true },
          select: { user: { select: { name: true } } },
          take: 1,
        },
        churnRiskScores: { orderBy: { weekStart: 'desc' }, take: 1, select: { score: true } },
        interactions: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      },
      orderBy: { name: 'asc' },
    })

    const now = Date.now()

    return clients
      .map((c) => {
        const riskScore = c.churnRiskScores[0]?.score ?? null
        const lastInteractionAt = c.interactions[0]?.createdAt ?? null
        const daysSinceInteraction = lastInteractionAt
          ? Math.floor((now - new Date(lastInteractionAt).getTime()) / 86_400_000)
          : null
        const isSilent = daysSinceInteraction == null || daysSinceInteraction >= SILENT_DAYS
        return {
          id: c.id,
          name: c.name,
          razaoSocial: c.razaoSocial ?? null,
          slug: c.slug,
          manager: c.assignments[0]?.user?.name ?? null,
          riskScore,
          lastInteractionAt,
          daysSinceInteraction,
          isSilent,
        }
      })
      .filter((r) => (r.riskScore ?? 0) >= ANTICHURN_RISK_THRESHOLD)
      .sort(
        (a, b) =>
          (b.riskScore ?? 0) - (a.riskScore ?? 0) ||
          (b.daysSinceInteraction ?? 0) - (a.daysSinceInteraction ?? 0),
      )
  },
)

// ─── OPE-06 — Check-in semanal por cliente ─────────────────────────────────────

export type CheckinStatusValue = 'PENDENTE' | 'PREENCHIDO' | 'APROVADO' | 'REPROVADO'

export type CheckinRow = {
  clientId: string
  clientName: string
  clientSlug: string
  managerName: string | null
  checkin: {
    id: string
    status: CheckinStatusValue
    resultadoSemana: string | null
    oQueFoiFeito: string | null
    proximosPassos: string | null
    reviewNote: string | null
    submittedAt: Date | null
  } | null
  // T-05: última semana FECHADA quando está REPROVADO — habilita o reenvio
  // direcionado (janela de correção). weekStartStr no formato 'YYYY-MM-DD'.
  pastReproved: {
    weekStartStr: string
    reviewNote: string | null
  } | null
}

export type CheckinBoard = {
  weekStart: Date
  rows: CheckinRow[]
}

/**
 * Quadro de check-ins da semana corrente: clientes ativos (role-scoped) com o
 * check-in da semana (ou null). A página deriva fila de revisão (PREENCHIDO),
 * sem check-in (null/PENDENTE) e reprovados.
 */
export const getCheckinBoard = cache(
  async (userId: string, role: string): Promise<CheckinBoard> => {
    const { start: weekStart } = getWeekRange()
    const prevWeekStart = new Date(weekStart.getTime() - 7 * 86_400_000)
    const where: Prisma.ClientWhereInput = canViewAll(role)
      ? { status: 'ACTIVE' }
      : { status: 'ACTIVE', assignments: { some: { userId } } }

    const clients = await prisma.client.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        assignments: {
          where: { isPrimary: true },
          select: { user: { select: { name: true } } },
          take: 1,
        },
        weeklyCheckins: {
          where: { weekStart: { in: [weekStart, prevWeekStart] } },
          select: {
            id: true,
            weekStart: true,
            status: true,
            resultadoSemana: true,
            oQueFoiFeito: true,
            proximosPassos: true,
            reviewNote: true,
            submittedAt: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    const rows: CheckinRow[] = clients.map((c) => {
      const current = c.weeklyCheckins.find((w) => w.weekStart.getTime() === weekStart.getTime())
      const prev = c.weeklyCheckins.find((w) => w.weekStart.getTime() === prevWeekStart.getTime())
      return {
        clientId: c.id,
        clientName: c.name,
        clientSlug: c.slug,
        managerName: c.assignments[0]?.user?.name ?? null,
        checkin: current
          ? {
              id: current.id,
              status: current.status as CheckinStatusValue,
              resultadoSemana: current.resultadoSemana,
              oQueFoiFeito: current.oQueFoiFeito,
              proximosPassos: current.proximosPassos,
              reviewNote: current.reviewNote,
              submittedAt: current.submittedAt,
            }
          : null,
        pastReproved:
          prev && prev.status === 'REPROVADO'
            ? {
                weekStartStr: prev.weekStart.toISOString().slice(0, 10),
                reviewNote: prev.reviewNote,
              }
            : null,
      }
    })

    return { weekStart, rows }
  },
)

export type CheckinStats = {
  semCheckin: number
  aguardandoRevisao: number
  reprovados: number
}

/** Contagens de check-in da semana para o cockpit. Role-scoped. */
export const getCheckinStats = cache(
  async (userId: string, role: string): Promise<CheckinStats> => {
    const { start: weekStart } = getWeekRange()
    const clientScope: Prisma.ClientWhereInput = canViewAll(role)
      ? { status: 'ACTIVE' }
      : { status: 'ACTIVE', assignments: { some: { userId } } }

    // A-104: "sem check-in" vem da FONTE ÚNICA `pendingCheckinCount` — o MESMO
    // número que o badge da sidebar mostra (antes o badge contava Task OPE-06).
    const [semCheckin, aguardandoRevisao, reprovados] = await Promise.all([
      pendingCheckinCount(userId, role),
      prisma.clientWeeklyCheckin.count({
        where: { weekStart, status: 'PREENCHIDO', client: clientScope },
      }),
      prisma.clientWeeklyCheckin.count({
        where: { weekStart, status: 'REPROVADO', client: clientScope },
      }),
    ])

    return {
      semCheckin,
      aguardandoRevisao,
      reprovados,
    }
  },
)

// ─── Managers overview ────────────────────────────────────────────────────────

export type ManagerClientRow = {
  id: string
  name: string
  razaoSocial: string | null
  slug: string
  overallStatus: HealthStatus | null
  // true = tem meta (Goal) vigente. overallStatus null + hasActiveGoal true =
  // "aguardando dados/sync"; overallStatus null + false = "sem meta".
  hasActiveGoal: boolean
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
      role: { in: ['GESTOR_TRAFEGO', 'MANAGER'] },
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
                // Fetch weekly+monthly; a janela canônica é escolhida no helper.
                where: { periodStart: { gte: monthStart < weekStart ? monthStart : weekStart } },
                select: { status: true, metric: true, period: true, achievementPct: true, periodStart: true },
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
      // Janela canônica unificada — mesma régua do grid/tabela.
      const scores = selectCanonicalScores(c.healthScores, weekStart, monthStart)

      const overallStatus = deriveOverallStatus(c.healthScores, weekStart, monthStart)

      // A-121: atingimento geral SEM SPEND/INVESTMENT (fonte única).
      const avgPct = overallAchievementPct(scores)

      return {
        id: c.id,
        name: c.name,
        razaoSocial: c.razaoSocial ?? null,
        slug: c.slug,
        overallStatus,
        hasActiveGoal: c.goals.length > 0,
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
  const { start: monthStart } = getMonthRange(now)
  const fetchFrom = monthStart < weekStart ? monthStart : weekStart
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
          date: true,
          spend: true,
          conversions: true,
          conversionValue: true,
          platformAccount: { select: { platform: true } },
        },
      },
      // Fetch weekly+monthly; a janela canônica é escolhida no helper.
      healthScores: {
        where: { periodStart: { gte: fetchFrom } },
        select: { status: true, metric: true, achievementPct: true, period: true, periodStart: true },
      },
      statusStreak: { select: { status: true, prevStatus: true, days: true } },
    },
  })

  // Also get previous week snapshots — GA4 only for revenue comparison
  const clientIds = clients.map((c) => c.id)
  const goalClientIds = await getClientsWithActiveGoal(clientIds, monthStart, weekStart)
  const prevSnapshots = clientIds.length > 0
    ? await prisma.metricSnapshot.findMany({
        where: {
          clientId: { in: clientIds },
          date: { gte: prevWeekStart, lte: prevWeekEnd },
        },
        select: {
          clientId: true,
          date: true,
          conversions: true,
          conversionValue: true,
          platformAccount: { select: { platform: true } },
        },
      })
    : []

  type SnapItem = (typeof clients)[number]['metricSnapshots'][number]
  type HealthItem = { status: HealthStatus; metric: MetricType; achievementPct: Prisma.Decimal; period: GoalPeriod; periodStart: Date }

  // Group by manager
  const managerMap = new Map<string, {
    user: { id: string; name: string; role: string; avatarUrl: string | null }
    clientData: Array<{
      id: string
      name: string
      razaoSocial: string | null
      slug: string
      snaps: SnapItem[]
      businessType: BusinessType
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

    // Receita da semana anterior via fonte única (roteia por businessType).
    const prevSales = aggregateSnapshots(
      prevSnapshots.filter((s) => s.clientId === client.id).map(toAgg),
      'FATURAMENTO',
      client.businessType,
    ) ?? 0

    managerMap.get(user.id)!.clientData.push({
      id: client.id,
      name: client.name,
      razaoSocial: client.razaoSocial ?? null,
      slug: client.slug,
      snaps: client.metricSnapshots,
      businessType: client.businessType,
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

    for (const { snaps, businessType, healthScores, prevSales } of clientData) {
      // Receita/ROAS canônicos via fonte única (roteia por businessType).
      const ga4Snaps = snaps.filter((x) => x.platformAccount.platform === 'GA4')
      const adsSnaps = snaps.filter((x) => x.platformAccount.platform !== 'GA4' && Number(x.spend ?? 0) > 0)

      const clientSpend   = adsSnaps.reduce((s, x) => s + Number(x.spend ?? 0), 0)
      const clientRevenue = aggregateSnapshots(snaps.map(toAgg), 'FATURAMENTO', businessType) ?? 0
      const clientRoas    = aggregateSnapshots(snaps.map(toAgg), 'ROAS', businessType)
      const clientPurchases = ga4Snaps.reduce((s, x) => s + (x.conversions ?? 0), 0)

      totalSpend += clientSpend
      totalSales += clientRevenue  // receita canônica (roteada por businessType)
      totalPrevSales += prevSales

      if (clientRoas !== null) {
        roasValues.push(clientRoas)
      }
      if (clientSpend > 0 && clientPurchases > 0) {
        cpaValues.push(clientSpend / clientPurchases)
      }

      const overallStatus = deriveOverallStatus(healthScores, weekStart, monthStart)

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

    const clientRows: ManagerClientRow[] = clientData.map(({ id, name, razaoSocial, slug, healthScores, streakDays, streakStatus, statusTrend }) => {
      // Janela canônica unificada — mesma régua do grid/tabela.
      const canon = selectCanonicalScores(healthScores, weekStart, monthStart)
      const overallStatus = deriveOverallStatus(healthScores, weekStart, monthStart)
      // A-121: atingimento geral SEM SPEND/INVESTMENT (fonte única).
      const avgPct = overallAchievementPct(canon)
      return {
        id, name, razaoSocial, slug, overallStatus, hasActiveGoal: goalClientIds.has(id),
        achievementPct: avgPct,
        platforms: [], goalsTotal: canon.length,
        goalsHit: canon.filter((s) => s.status === 'OTIMO').length,
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
      role: { in: ['GESTOR_TRAFEGO', 'MANAGER'] },
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

// ─── Exposição a churn (score v2 PROVISÓRIO — informativo) ─────────────────────

/**
 * Linha da tabela "Exposição a churn (provisório)" do Cockpit.
 * `indiceExposicao` = feeAmount × score/100. Serve APENAS para ORDENAR e, se
 * exibido em reais, é rotulado "Índice de Exposição" — NUNCA somado nem tratado
 * como "R$ em risco" (não é previsão de receita perdida).
 */
export type ChurnExposureRow = {
  clientId: string
  clientName: string
  clientRazaoSocial: string | null
  clientSlug: string | null
  curva: string | null
  scoreV2: number
  faixa: string
  feeAmount: number
  indiceExposicao: number
}

export type ChurnExposure = {
  /** true quando NENHUM cliente tem v2 ainda (cron semanal não rodou). */
  aguardandoPrimeiroCalculo: boolean
  rows: ChurnExposureRow[]
}

type ChurnV2Factor = {
  score?: unknown
  faixa?: unknown
  provisional?: unknown
}

/**
 * Top 8 clientes por Índice de Exposição (feeAmount × v2/100) DESC, lendo o v2
 * gravado dentro de ChurnRiskScore.factors na semana corrente. Gate: papéis de
 * visão ampla (mesmo das seções de saúde). Retorna null para papel restrito.
 */
export const getCockpitChurnExposure = cache(
  async (role: string): Promise<ChurnExposure | null> => {
    if (!canViewAll(role)) return null

    const { start: weekStart } = getWeekRange()
    const scores = await prisma.churnRiskScore.findMany({
      where: { weekStart, client: { status: 'ACTIVE' } },
      select: {
        factors: true,
        client: { select: { id: true, name: true, razaoSocial: true, slug: true, curva: true, feeAmount: true } },
      },
    })

    const rows: ChurnExposureRow[] = []
    for (const s of scores) {
      const factors =
        s.factors && typeof s.factors === 'object' && !Array.isArray(s.factors)
          ? (s.factors as Record<string, unknown>)
          : null
      const v2raw = factors?.v2
      if (!v2raw || typeof v2raw !== 'object') continue
      const v2 = v2raw as ChurnV2Factor
      if (typeof v2.score !== 'number' || typeof v2.faixa !== 'string') continue

      const fee = s.client.feeAmount != null ? Number(s.client.feeAmount) : 0
      rows.push({
        clientId: s.client.id,
        clientName: s.client.name,
        clientRazaoSocial: s.client.razaoSocial ?? null,
        clientSlug: s.client.slug,
        curva: s.client.curva,
        scoreV2: v2.score,
        faixa: v2.faixa,
        feeAmount: fee,
        indiceExposicao: Math.round((fee * v2.score) / 100),
      })
    }

    rows.sort((a, b) => b.indiceExposicao - a.indiceExposicao)

    return { aguardandoPrimeiroCalculo: rows.length === 0, rows: rows.slice(0, 8) }
  },
)

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

/**
 * FASE 1.2 — Funil de prestação de contas das últimas 8 semanas de um cliente.
 * Cada linha: gerado → enviado (por quem) → entregue → respondido.
 *
 * Posse (RBAC v2): GESTOR só lê cliente da carteira (scopeClients). Fora do
 * escopo → [] (não vaza dados de cliente de outra carteira).
 *
 * `fonteRespostaAusente` sinaliza à tela que firstReplyAt ainda não é rastreado
 * automaticamente (não há fonte de inbound do cliente no banco) — a tela mostra
 * "—" em "Respondido" com tooltip explicativo em vez de um falso "não respondeu".
 */
export const getWeeklyReportFunnel = cache(async (
  clientId: string,
  viewer: { userId: string; role: string },
) => {
  const role5 = normalizeRole(viewer.role)
  const client = await prisma.client.findFirst({
    where: { id: clientId, ...scopeClients(role5, viewer.userId) },
    select: { id: true },
  })
  if (!client) return { rows: [], fonteRespostaAusente: true as const }

  const reports = await prisma.weeklyReport.findMany({
    where: { clientId },
    orderBy: { weekStart: 'desc' },
    take: 8,
    select: {
      id: true,
      weekStart: true,
      generatedAt: true,
      sentAt: true,
      sentBy: true,
      deliveredAt: true,
      firstReplyAt: true,
    },
  })

  // Resolve o nome de quem marcou o envio (sentBy é userId puro, sem relação).
  const senderIds = Array.from(
    new Set(reports.map((r) => r.sentBy).filter((v): v is string => !!v)),
  )
  const senders = senderIds.length
    ? await prisma.user.findMany({
        where: { id: { in: senderIds } },
        select: { id: true, name: true },
      })
    : []
  const senderName = new Map(senders.map((u) => [u.id, u.name]))

  const rows = reports.map((r) => ({
    id: r.id,
    weekStart: r.weekStart,
    generatedAt: r.generatedAt,
    sentAt: r.sentAt,
    sentByName: r.sentBy ? senderName.get(r.sentBy) ?? 'usuário removido' : null,
    deliveredAt: r.deliveredAt,
    firstReplyAt: r.firstReplyAt,
  }))

  // Hoje sempre true — ver report-delivery-tracker (chat interno não é do cliente).
  return { rows, fonteRespostaAusente: true as const }
})

export const getClientMonthlyReport = cache(async (clientId: string) => {
  return prisma.monthlyReport.findFirst({
    where: { clientId },
    orderBy: { monthStart: 'desc' },
  })
})

// ─── Client chat ──────────────────────────────────────────────────────────────

const CHAT_INCLUDE = {
  messages: {
    orderBy: { createdAt: 'asc' as const },
    take: 100,
    include: {
      user: { select: { id: true, name: true, avatarUrl: true, role: true } },
    },
  },
}

export const getClientChat = cache(async (clientId: string) => {
  // Leitura primeiro — evita emitir escrita a cada render do painel.
  const existing = await prisma.clientChat.findUnique({
    where: { clientId },
    include: CHAT_INCLUDE,
  })
  if (existing) return existing

  // Só cria o canal na primeira vez que ele é aberto (idempotente por clientId).
  // Double-render concorrente pode colidir no unique (P2002) — trata como
  // "outro render criou" e relê, em vez de derrubar a página (hotfix Client 360).
  try {
    return await prisma.clientChat.upsert({
      where: { clientId },
      create: { clientId },
      update: {},
      include: CHAT_INCLUDE,
    })
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
      const retry = await prisma.clientChat.findUnique({ where: { clientId }, include: CHAT_INCLUDE })
      if (retry) return retry
    }
    throw err
  }
})

// ─── Central de Comunicação (canais internos por cliente) ─────────────────────

export type ClientChannelSummary = {
  clientId: string
  clientName: string
  clientRazaoSocial: string | null   // razão social (como no Asaas) p/ identidade completa
  clientSlug: string
  status: string
  primaryManager: string | null
  participants: string[]           // gestores atribuídos (nomes) — além de CS/ADMIN
  messageCount: number
  lastMessage: {
    content: string
    authorName: string
    createdAt: string
  } | null
  lastActivityAt: string | null    // p/ ordenação
}

/**
 * Lista os canais internos (um por cliente), com escopo por papel:
 * ADMIN/CS → todos os clientes; MANAGER/ANALYST → apenas clientes atribuídos.
 * Participantes de cada canal: gestor(es) atribuído(s) + CS + ADMIN (Marcos).
 */
export const getClientChannels = cache(async (userId: string, role: string): Promise<ClientChannelSummary[]> => {
  const where: Prisma.ClientWhereInput = canViewAll(role)
    ? { status: { not: 'CHURNED' } }
    : { status: { not: 'CHURNED' }, assignments: { some: { userId } } }

  const clients = await prisma.client.findMany({
    where,
    select: {
      id: true, name: true, razaoSocial: true, slug: true, status: true,
      assignments: {
        select: { isPrimary: true, user: { select: { name: true } } },
      },
      chat: {
        select: {
          _count: { select: { messages: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { content: true, createdAt: true, user: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  const rows: ClientChannelSummary[] = clients.map((c) => {
    const last = c.chat?.messages[0] ?? null
    const primary = c.assignments.find((a) => a.isPrimary)?.user.name ?? null
    return {
      clientId: c.id,
      clientName: c.name,
      clientRazaoSocial: c.razaoSocial ?? null,
      clientSlug: c.slug,
      status: c.status,
      primaryManager: primary,
      participants: c.assignments.map((a) => a.user.name),
      messageCount: c.chat?._count.messages ?? 0,
      lastMessage: last
        ? { content: last.content, authorName: last.user.name, createdAt: last.createdAt.toISOString() }
        : null,
      lastActivityAt: last ? last.createdAt.toISOString() : null,
    }
  })

  // Canais com atividade primeiro (mais recente no topo); depois os silenciosos, por nome.
  return rows.sort((a, b) => {
    if (a.lastActivityAt && b.lastActivityAt) return a.lastActivityAt < b.lastActivityAt ? 1 : -1
    if (a.lastActivityAt) return -1
    if (b.lastActivityAt) return 1
    return a.clientName.localeCompare(b.clientName)
  })
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
  // A-007/A-008: dias decorridos/total do mês pela FONTE ÚNICA ancorada no
  // dia-parede SP (antes today.getDate()/getMonth em fuso do servidor divergia
  // do achievementPct SP entre 21–24h SP).
  const { daysElapsedInMonth: daysElapsed, totalDaysInMonth: daysInMonth } = spDayInfo(today)
  const { start: monthStart, end: monthEnd } = getMonthRange(today)

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { businessType: true },
  })

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

  // S2-014: o "realizado" (acumulado hoje) vem da FONTE ÚNICA (helper MTD),
  // não de HealthScore.actualValue — que divergia de /agency/metas. O HealthScore
  // continua sendo a NOTA (status/achievementPct). Uma única query de snapshots.
  const realizadoByMetric = await getRealizadoForMetrics(
    clientId,
    goals.map((g) => g.metric),
    'MTD',
    client?.businessType,
  )

  return goals.map((goal): GoalPaceMetrics => {
    const target = Number(goal.targetValue)
    // S2-015: métricas de RAZÃO/MÉDIA (ROAS, CTR, CPL, CPA, CPC, etc.) NÃO se
    // acumulam por dia — dividir a meta por dias gera "meta diária" sem sentido
    // ("0,07x"). Fonte única de classificação: RATE_METRICS (mesma usada na
    // conversão semanal em weekly-goals-sync). Para RATE, a meta vale para
    // qualquer janela: dailyTarget/weeklyTarget/paceExpected são null e o
    // "ritmo" compara realizado vs. a própria meta.
    const isRate = RATE_METRICS.has(goal.metric)
    const dailyTarget = isRate ? null : daysInMonth > 0 ? target / daysInMonth : null
    const weeklyTarget = isRate ? null : daysInMonth > 0 ? (target / daysInMonth) * 7 : null
    const hs = goal.healthScores[0]
    const actualValue = realizadoByMetric.get(goal.metric)?.valor ?? null
    // Para RATE, o "esperado" é a própria meta (comparação direta realizado × meta).
    const paceExpected = isRate
      ? target
      : dailyTarget !== null
        ? dailyTarget * daysElapsed
        : null
    // Para métricas "menor é melhor" (CPL/CPA/CAC/CPC/CPM/SPEND/CPS) o ritmo é
    // invertido — espelha computeAchievementPct do health-scorer: esperado÷real.
    // Divisão por zero (real <= 0) → null.
    const lowerIsBetter = LOWER_IS_BETTER.has(goal.metric)
    const paceAchievement =
      actualValue !== null && paceExpected !== null
        ? lowerIsBetter
          ? actualValue > 0
            ? (paceExpected / actualValue) * 100
            : null
          : paceExpected > 0
            ? (actualValue / paceExpected) * 100
            : null
        : null
    // Projeção só faz sentido para métricas acumulativas; RATE já é uma média.
    // Fonte única de run-rate (projectMonth), ancorada no dia-parede SP.
    const projectedMonth = isRate
      ? actualValue
      : projectMonth(actualValue, daysElapsed, daysInMonth)

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

// NOTA (AL-2/F-01): ROAS/CPL aqui são BREAKDOWN por campanha/adset, calculados
// sobre `CampaignSnapshot` (pixel Meta), não sobre `MetricSnapshot`. Não é o
// faturamento/ROAS canônico do cliente e `aggregateSnapshots` não se aplica
// (opera em MetricSnapshot). Mantido inline de propósito.
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
  // semMeta = cliente SEM nenhuma meta (Goal) vigente → "sem meta configurada".
  // aguardandoDados = TEM meta, mas ainda sem HealthScore no período (sync/health
  // ainda não rodou) → NÃO é alarme, é neutro. Nunca contar como "sem meta".
  health: { otimo: number; regular: number; ruim: number; semMeta: number; aguardandoDados: number }
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
  const { start: monthStart } = getMonthRange(now)
  const { start: weekStart } = getWeekRange()
  const fetchFrom = monthStart < weekStart ? monthStart : weekStart

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
      businessType: true,
      contractValue: true,
      contractStart: true,
      assignments: {
        where: { isPrimary: true },
        select: { user: { select: { id: true, name: true } } },
        take: 1,
      },
      healthScores: {
        where: { periodStart: { gte: fetchFrom } },
        select: { status: true, period: true, periodStart: true },
      },
    },
  })

  const clientIds = clients.map((c) => c.id)
  const goalClientIds = await getClientsWithActiveGoal(clientIds, monthStart, weekStart)

  // All MTD snapshots in one query (sem N+1)
  const snaps = await prisma.metricSnapshot.findMany({
    where: { clientId: { in: clientIds }, date: { gte: monthStart } },
    select: {
      clientId: true,
      date: true,
      spend: true,
      conversions: true,
      conversionValue: true,
      netRevenue: true,
      platformAccount: { select: { platform: true } },
    },
  })

  // Aggregate per client. spend/purchases seguem inline (spend = plataformas de
  // anúncio; purchases = compras GA4). Receita/ROAS canônicos são roteados por
  // businessType via fonte única no loop abaixo.
  const kpiMap = new Map<string, { spend: number; purchases: number; snaps: AggregatableSnapshot[] }>()
  for (const s of snaps) {
    if (!kpiMap.has(s.clientId)) kpiMap.set(s.clientId, { spend: 0, purchases: 0, snaps: [] })
    const k = kpiMap.get(s.clientId)!
    k.snaps.push(toAgg(s))
    if (s.platformAccount.platform === 'GA4') {
      k.purchases += s.conversions ?? 0
    } else {
      k.spend += Number(s.spend ?? 0)
    }
  }

  // Build per-client rows + totals
  let totalRevenue = 0
  let totalSpend = 0
  let totalPurchases = 0
  const health = { otimo: 0, regular: 0, ruim: 0, semMeta: 0, aguardandoDados: 0 }
  const managerMap = new Map<string, AgencyManagerRow>()
  const clientRows: AgencyClientRow[] = []

  for (const c of clients) {
    const k = kpiMap.get(c.id) ?? { spend: 0, purchases: 0, snaps: [] as AggregatableSnapshot[] }
    // Receita/ROAS canônicos via fonte única (roteia por businessType).
    const revenue = aggregateSnapshots(k.snaps, 'FATURAMENTO', c.businessType) ?? 0
    totalRevenue   += revenue
    totalSpend     += k.spend
    totalPurchases += k.purchases

    const status = deriveOverallStatus(c.healthScores, weekStart, monthStart)

    if (status === 'OTIMO') health.otimo++
    else if (status === 'REGULAR') health.regular++
    else if (status === 'RUIM') health.ruim++
    // Sem HealthScore: distingue "tem meta, aguardando dados" de "sem meta".
    else if (goalClientIds.has(c.id)) health.aguardandoDados++
    else health.semMeta++

    const manager = c.assignments[0]?.user ?? null
    const roasAgg = aggregateSnapshots(k.snaps, 'ROAS', c.businessType)
    const roas = roasAgg !== null ? Math.round(roasAgg * 100) / 100 : null

    clientRows.push({ id: c.id, name: c.name, slug: c.slug, revenue, spend: k.spend, roas, status, manager: manager?.name ?? null })

    if (manager) {
      if (!managerMap.has(manager.id)) {
        managerMap.set(manager.id, { id: manager.id, name: manager.name, clientCount: 0, revenue: 0, spend: 0, roas: null, otimo: 0, regular: 0, ruim: 0 })
      }
      const m = managerMap.get(manager.id)!
      m.clientCount++
      m.revenue += revenue
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

// ─── Tempo de casa / LTV / Churn dos CANCELADOS (cards de /clients) ────────────
//
// Regra 0 (DADO AMARRADO): a data de cancelamento NÃO tem campo próprio no
// Client (não existe churnedAt). A fonte MAIS confiável é o AuditLog de
// offboarding (action 'client.offboarding'), gravado por runClientOffboarding no
// momento em que o cliente vira CHURNED. Fallback: Contract.cancelledAt
// (Jurídico). Sem NENHUM dos dois, o cliente é EXCLUÍDO das médias (nunca
// inventamos data) — a base real vai no subtítulo ("média de N cancelados com
// histórico").
//
// LTV por cliente — fonte MAIS REAL primeiro:
//   1) Soma dos AsaasPayment RECEIVED/CONFIRMED do cliente (dinheiro REALMENTE
//      pago). É a verdade financeira; usada quando existe ≥1 pagamento.
//   2) Estimativa = meses de casa × mensalidade (feeAmount ?? contractValue),
//      só quando não há pagamento real no Asaas.
// avgLTV = média do LTV por cliente sobre os cancelados com dado computável.
//
// Taxa de churn (12m): cancelados nos últimos 12 meses ÷ (ativos hoje +
// cancelados 12m). NÃO reusa AgencyOverview.churnRate porque aquele é ALL-TIME
// (churnedTotal sobre toda a base histórica) — métrica diferente. Esta derivação
// de 12m fica AQUI como ponto único; poderia ser consumida também em /agency se
// o Marcos quiser padronizar a janela de 12m lá.
export type ChurnLtvStats = {
  // Tenure médio (meses, 1 casa) dos cancelados COM data confiável.
  avgTenureMonths: number | null
  // Tempo de casa médio (meses, 1 casa) da base ATIVA hoje (1º Contract →
  // cadastro → createdAt).
  avgTenureAtivosMonths: number | null
  // LTV médio (R$) dos cancelados computáveis.
  avgLtv: number | null
  // Quantos cancelados entraram na média de tenure (têm data + start).
  baseComputados: number
  // Quantos cancelados entraram na média de LTV (têm valor computável).
  baseLtv: number
  // Quantos cancelados no total (para transparência).
  totalCancelados: number
  // Quantos usaram Asaas (dinheiro real) vs estimativa.
  ltvComAsaas: number
  // Taxa de churn 12m (%), 1 casa.
  churnRate12m: number | null
  cancelados12m: number
  ativosHoje: number
}

const MS_MES = 30.44 * 86_400_000 // média de dias/mês para tenure em meses

export const getChurnLtvStats = cache(async (): Promise<ChurnLtvStats> => {
  const now = new Date()
  const dozeMesesAtras = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())

  const [ativos, churned] = await Promise.all([
    // Tempo de casa da BASE ATIVA: início = 1º Contract do Jurídico (fonte
    // canônica), fallback cadastro/createdAt (pedido Marcos 2026-07-22).
    prisma.client.findMany({
      where: { status: 'ACTIVE' },
      select: {
        contractStart: true,
        createdAt: true,
        contracts: { orderBy: { startDate: 'asc' }, take: 1, select: { startDate: true } },
      },
    }),
    prisma.client.findMany({
      where: { status: 'CHURNED' },
      select: {
        id: true,
        contractStart: true,
        createdAt: true,
        updatedAt: true,
        contractValue: true,
        feeAmount: true,
        asaasCustomer: {
          select: {
            payments: {
              where: { status: { in: ['RECEIVED', 'CONFIRMED'] } },
              select: { value: true },
            },
          },
        },
      },
    }),
  ])

  const ativosHoje = ativos.length
  let somaTenureAtivos = 0
  for (const a of ativos) {
    const start = a.contracts[0]?.startDate ?? a.contractStart ?? a.createdAt
    somaTenureAtivos += Math.max(0, (now.getTime() - start.getTime()) / MS_MES)
  }
  const avgTenureAtivosMonths =
    ativosHoje > 0 ? Math.round((somaTenureAtivos / ativosHoje) * 10) / 10 : null

  const churnedIds = churned.map((c) => c.id)

  // Data de cancelamento: AuditLog de offboarding (mais confiável) → 1º evento
  // por cliente. Fallback: Contract.cancelledAt.
  const offboardings = churnedIds.length
    ? await prisma.auditLog.findMany({
        where: { action: 'client.offboarding', clientId: { in: churnedIds } },
        select: { clientId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      })
    : []
  const cancelledContracts = churnedIds.length
    ? await prisma.contract.findMany({
        where: { clientId: { in: churnedIds }, status: 'CANCELADO', cancelledAt: { not: null } },
        select: { clientId: true, cancelledAt: true },
        orderBy: { cancelledAt: 'desc' },
      })
    : []

  const offboardMap = new Map<string, Date>()
  for (const a of offboardings) {
    if (a.clientId && !offboardMap.has(a.clientId)) offboardMap.set(a.clientId, a.createdAt)
  }
  const contractCancelMap = new Map<string, Date>()
  for (const c of cancelledContracts) {
    if (c.clientId && c.cancelledAt && !contractCancelMap.has(c.clientId)) {
      contractCancelMap.set(c.clientId, c.cancelledAt)
    }
  }

  let somaTenure = 0
  let somaLtv = 0
  let baseComputados = 0
  let baseLtv = 0 // só cancelados com LTV computável — denominador próprio do LTV
  let ltvComAsaas = 0
  let cancelados12m = 0

  for (const c of churned) {
    const churnDate = offboardMap.get(c.id) ?? contractCancelMap.get(c.id) ?? null
    if (!churnDate) continue // sem data confiável → fora das médias (nunca inventa)

    if (churnDate >= dozeMesesAtras) cancelados12m++

    const start = c.contractStart ?? c.createdAt
    const tenureMonths = Math.max(0, (churnDate.getTime() - start.getTime()) / MS_MES)

    // LTV real (Asaas) tem precedência sobre a estimativa.
    const pagamentos = c.asaasCustomer?.payments ?? []
    const totalPago = pagamentos.reduce((s, p) => s + Number(p.value), 0)

    let ltv: number | null = null
    if (totalPago > 0) {
      ltv = totalPago
      ltvComAsaas++
    } else {
      const mensalidade = Number(c.feeAmount ?? c.contractValue ?? 0)
      if (mensalidade > 0) ltv = tenureMonths * mensalidade
    }

    somaTenure += tenureMonths
    baseComputados++
    if (ltv !== null) {
      somaLtv += ltv
      baseLtv++
    }
  }

  const totalAll = ativosHoje + cancelados12m

  return {
    avgTenureMonths: baseComputados > 0 ? Math.round((somaTenure / baseComputados) * 10) / 10 : null,
    avgTenureAtivosMonths,
    avgLtv: baseLtv > 0 ? Math.round(somaLtv / baseLtv) : null,
    baseComputados,
    baseLtv,
    totalCancelados: churned.length,
    ltvComAsaas,
    churnRate12m: totalAll > 0 ? Math.round((cancelados12m / totalAll) * 1000) / 10 : null,
    cancelados12m,
    ativosHoje,
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
  razaoSocial: string | null
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
  const { start: monthStart } = getMonthRange(now)
  const { start: weekStart } = getWeekRange()
  const fetchFrom = monthStart < weekStart ? monthStart : weekStart

  const [rawClients, managers] = await Promise.all([
    prisma.client.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        razaoSocial: true,
        slug: true,
        platformAccounts: { where: { active: true }, select: { platform: true } },
        assignments: {
          where: { isPrimary: true },
          select: { userId: true, user: { select: { name: true } } },
          take: 1,
        },
        healthScores: {
          where: { periodStart: { gte: fetchFrom } },
          select: { status: true, metric: true, achievementPct: true, period: true, periodStart: true },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      // Gestores atribuíveis a clientes (carteira): GESTOR_TRAFEGO + ADMIN.
      where: { active: true, role: { in: ['ADMIN', 'GESTOR_TRAFEGO', 'MANAGER'] } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const clients: AssignmentClientRow[] = rawClients.map((c) => {
    // Janela canônica unificada — mesma régua do grid/tabela.
    const scores = selectCanonicalScores(c.healthScores, weekStart, monthStart)
    // A-121: atingimento geral SEM SPEND/INVESTMENT (fonte única).
    const avgPct = overallAchievementPct(scores) ?? 0
    const overallStatus = deriveOverallStatus(c.healthScores, weekStart, monthStart)

    const primary = c.assignments[0]

    return {
      id: c.id,
      name: c.name,
      razaoSocial: c.razaoSocial ?? null,
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
    select: { periodStart: true, achievementPct: true, status: true, metric: true },
  })

  // Group by week start
  const byWeek = new Map<string, { sum: number; count: number; statuses: HealthStatus[] }>()
  for (const s of scores) {
    const key = s.periodStart.toISOString().split('T')[0]
    const cur = byWeek.get(key) ?? { sum: 0, count: 0, statuses: [] }
    // A-121: métricas de consumo de budget (SPEND/INVESTMENT) fora da média do
    // sparkline — mesma régua do atingimento geral do selo.
    if (!BUDGET_CONSUMPTION_METRICS.has(s.metric)) {
      cur.sum += Number(s.achievementPct)
      cur.count++
    }
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

// NOTA (AL-2/F-01): funil e-commerce (sessões→carrinho→checkout→compra) é
// inerentemente GA4 e NÃO envolve receita/ROAS. Fora do escopo da fonte única;
// mantido GA4-only de propósito.
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

// ─── BLOCO 4 — Visões por papel da Central Operacional ──────────────────────────

export type MinhaTarefa = {
  id: string
  title: string
  status: string
  priority: string
  type: string
  dueDate: Date | null
  clientName: string | null
  clientSlug: string | null
  areaName: string | null
  popCode: string | null
}

export type MinhaSemanaBucket = {
  key: 'atrasadas' | 'hoje' | 'estaSemana' | 'depois' | 'semPrazo'
  label: string
  pergunta: string
  tasks: MinhaTarefa[]
}

export type MinhaSemana = {
  buckets: MinhaSemanaBucket[]
  total: number
  atrasadasCount: number
  hojeCount: number
}

/**
 * "Meu Dia / Minha Semana": tarefas ABERTAS atribuídas ao usuário, agrupadas por
 * urgência (atrasadas → hoje → esta semana → depois → sem prazo). Responde
 * "o que eu preciso fazer agora?" para qualquer papel.
 */
export const getMinhaSemana = cache(async (userId: string): Promise<MinhaSemana> => {
  const rows = await prisma.task.findMany({
    where: { assignedTo: userId, status: { notIn: ['CONCLUIDO', 'CANCELADO'] } },
    orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    take: 200,
    select: {
      id: true, title: true, status: true, priority: true, type: true, dueDate: true,
      client: { select: { name: true, slug: true } },
      area: { select: { name: true } },
      pop: { select: { code: true } },
    },
  })

  const tasks: MinhaTarefa[] = rows.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    type: t.type,
    dueDate: t.dueDate,
    clientName: t.client?.name ?? null,
    clientSlug: t.client?.slug ?? null,
    areaName: t.area?.name ?? null,
    popCode: t.pop?.code ?? null,
  }))

  // A-118/A-109: boundary de "hoje" no dia-parede SP (antes fuso do servidor
  // deslocava /meu-dia 1 dia entre 21–24h SP). startToday = 00:00 SP; endToday
  // = +24h. Casa com o mesmo padrão do badge Meu Dia e do aceite operacional.
  const now = new Date()
  const startToday = startOfTodaySaoPaulo(now)
  const endToday = new Date(startToday.getTime() + 86_400_000)
  const { end: weekEnd } = getWeekRange(now)

  const atrasadas: MinhaTarefa[] = []
  const hoje: MinhaTarefa[] = []
  const estaSemana: MinhaTarefa[] = []
  const depois: MinhaTarefa[] = []
  const semPrazo: MinhaTarefa[] = []

  for (const t of tasks) {
    if (t.dueDate == null) { semPrazo.push(t); continue }
    const d = new Date(t.dueDate).getTime()
    if (d < startToday.getTime()) atrasadas.push(t)
    else if (d < endToday.getTime()) hoje.push(t)
    else if (d <= weekEnd.getTime()) estaSemana.push(t)
    else depois.push(t)
  }

  const buckets: MinhaSemanaBucket[] = [
    { key: 'atrasadas', label: 'Atrasadas', pergunta: 'Passou do prazo — resolva ou repactue hoje', tasks: atrasadas },
    { key: 'hoje', label: 'Para hoje', pergunta: 'Vence hoje', tasks: hoje },
    { key: 'estaSemana', label: 'Esta semana', pergunta: 'Vence até o fim da semana', tasks: estaSemana },
    { key: 'depois', label: 'Depois', pergunta: 'Prazo mais distante', tasks: depois },
    { key: 'semPrazo', label: 'Sem prazo', pergunta: 'Sem data — defina um prazo', tasks: semPrazo },
  ]

  return {
    buckets,
    total: tasks.length,
    atrasadasCount: atrasadas.length,
    hojeCount: hoje.length,
  }
})

export type GestorCarga = {
  id: string
  name: string
  role: string
  abertas: number
  atrasadas: number
  concluidas7d: number
  semPrazo: number
  gargalo: boolean
}

/**
 * "Por Gestor": carga de trabalho de cada gestor/CS — abertas, atrasadas,
 * concluídas na semana e gargalos. Visão de quem está acumulando (CEO/CS).
 * Restrita a quem tem leitura ampla (ADMIN/CS).
 */
export const getGestoresCarga = cache(async (role: string): Promise<GestorCarga[] | null> => {
  if (!canViewAll(role)) return null

  const now = new Date()
  const sete = new Date(now.getTime() - 7 * 86_400_000)
  // Atrasada = prazo anterior ao início de HOJE em SP (ver util).
  const atrasoLimite = startOfTodaySaoPaulo(now)

  const users = await prisma.user.findMany({
    where: {
      active: true,
      role: { in: ['ADMIN', 'CS', 'GESTOR_TRAFEGO', 'SUPERVISOR_TRAFEGO', 'ANALISTA_TRAFEGO', 'MANAGER', 'ANALYST'] },
    },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, role: true },
  })

  const userIds = users.map((u) => u.id)
  const openStatus: Prisma.TaskWhereInput['status'] = { notIn: ['CONCLUIDO', 'CANCELADO'] }

  // Agregação no banco: não carregamos as tarefas inteiras de cada gestor —
  // contamos por assignedTo (relação User.tasks) direto no PostgreSQL.
  const [abertasGrp, atrasadasGrp, semPrazoGrp, concluidasGrp] = await Promise.all([
    prisma.task.groupBy({
      by: ['assignedTo'],
      where: { assignedTo: { in: userIds }, status: openStatus },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ['assignedTo'],
      where: { assignedTo: { in: userIds }, status: openStatus, dueDate: { lt: atrasoLimite } },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ['assignedTo'],
      where: { assignedTo: { in: userIds }, status: openStatus, dueDate: null },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ['assignedTo'],
      where: { assignedTo: { in: userIds }, status: 'CONCLUIDO', completedAt: { gte: sete } },
      _count: { _all: true },
    }),
  ])

  const toMap = (grp: { assignedTo: string; _count: { _all: number } }[]) =>
    new Map(grp.map((g) => [g.assignedTo, g._count._all]))
  const abertasMap = toMap(abertasGrp)
  const atrasadasMap = toMap(atrasadasGrp)
  const semPrazoMap = toMap(semPrazoGrp)
  const concluidasMap = toMap(concluidasGrp)

  const rows: GestorCarga[] = users.map((u) => {
    const abertas = abertasMap.get(u.id) ?? 0
    const atrasadas = atrasadasMap.get(u.id) ?? 0
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      abertas,
      atrasadas,
      concluidas7d: concluidasMap.get(u.id) ?? 0,
      semPrazo: semPrazoMap.get(u.id) ?? 0,
      gargalo: atrasadas >= 3 || abertas >= 15,
    }
  })

  // Mais carregados primeiro (gargalos no topo)
  return rows.sort((a, b) => Number(b.gargalo) - Number(a.gargalo) || b.atrasadas - a.atrasadas || b.abertas - a.abertas)
})

export type ClienteTarefaRow = {
  id: string
  title: string
  status: string
  priority: string
  type: string
  dueDate: Date | null
  assigneeName: string
  popCode: string | null
}

export type ClienteTarefas = {
  abertas: ClienteTarefaRow[]
  concluidasRecentes: ClienteTarefaRow[]
  atrasadasCount: number
}

/** Tarefas operacionais de um cliente (para a página do cliente). Role-scoped por posse. */
export const getClienteTarefas = cache(
  async (clientId: string, userId: string, role: string): Promise<ClienteTarefas> => {
    if (!canViewAll(role)) {
      const owns = await prisma.clientAssignment.findFirst({
        where: { clientId, userId },
        select: { id: true },
      })
      if (!owns) return { abertas: [], concluidasRecentes: [], atrasadasCount: 0 }
    }

    // Hotfix P2024 (Client 360): sem `take`, cliente antigo com recorrências
    // acumuladas carregava MILHARES de linhas por render e ajudava a esgotar o
    // pool. Abertas primeiro (todas as relevantes) + concluídas recentes.
    const [openRows, doneRows] = await Promise.all([
      prisma.task.findMany({
        where: { clientId, status: { notIn: ['CONCLUIDO', 'CANCELADO'] } },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 200,
        select: {
          id: true, title: true, status: true, priority: true, type: true, dueDate: true,
          completedAt: true,
          user: { select: { name: true } },
          pop: { select: { code: true } },
        },
      }),
      prisma.task.findMany({
        where: { clientId, status: { in: ['CONCLUIDO', 'CANCELADO'] } },
        orderBy: [{ completedAt: 'desc' }],
        take: 50,
        select: {
          id: true, title: true, status: true, priority: true, type: true, dueDate: true,
          completedAt: true,
          user: { select: { name: true } },
          pop: { select: { code: true } },
        },
      }),
    ])
    const rows = [...openRows, ...doneRows]

    const map = (t: (typeof rows)[number]): ClienteTarefaRow => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      type: t.type,
      dueDate: t.dueDate,
      assigneeName: t.user?.name ?? '—',
      popCode: t.pop?.code ?? null,
    })

    const now = Date.now()
    const abertasRows = rows.filter((t) => t.status !== 'CONCLUIDO' && t.status !== 'CANCELADO')
    const concluidasRows = rows
      .filter((t) => t.status === 'CONCLUIDO')
      .sort((a, b) => (new Date(b.completedAt ?? 0).getTime()) - (new Date(a.completedAt ?? 0).getTime()))
      .slice(0, 5)

    return {
      abertas: abertasRows.map(map),
      concluidasRecentes: concluidasRows.map(map),
      atrasadasCount: abertasRows.filter(
        (t) => t.dueDate != null && new Date(t.dueDate).getTime() < now,
      ).length,
    }
  },
)

// ─── BLOCO 5 / CSX-10 — Fila de validação da CS ─────────────────────────────────

export type ValidationQueueItem = {
  id: string
  title: string
  status: string
  clientName: string | null
  clientSlug: string | null
  assigneeName: string
  popCode: string | null
  evidence: string | null
  checklistTotal: number
  checklistDone: number
  dueDate: Date | null
  submittedAt: Date | null
  waitingDays: number
}

export type ValidationQueue = {
  items: ValidationQueueItem[]
  canDecide: boolean
}

/**
 * CSX-10 — Fila de validação: tarefas aguardando validação da CS
 * (AGUARDANDO_CS / EM_VALIDACAO). CS/ADMIN veem tudo e podem decidir;
 * MANAGER vê apenas as dos seus clientes (leitura, para acompanhar).
 */
export const getValidationQueue = cache(
  async (userId: string, role: string): Promise<ValidationQueue> => {
    const canDecide = role === 'CS' || role === 'ADMIN'
    const base: Prisma.TaskWhereInput = { status: { in: ['AGUARDANDO_CS', 'EM_VALIDACAO'] } }
    const where: Prisma.TaskWhereInput = canViewAll(role)
      ? base
      : { ...base, OR: [{ assignedTo: userId }, { client: { assignments: { some: { userId } } } }] }

    const rows = await prisma.task.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { updatedAt: 'asc' }],
      select: {
        id: true,
        title: true,
        status: true,
        evidence: true,
        dueDate: true,
        client: { select: { name: true, slug: true } },
        user: { select: { name: true } },
        pop: { select: { code: true } },
        checklist: { select: { done: true } },
        activities: {
          where: { action: 'submitted_for_validation' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    })

    const now = Date.now()
    const items: ValidationQueueItem[] = rows.map((t) => {
      const submittedAt = t.activities[0]?.createdAt ?? null
      const waitingDays = submittedAt
        ? Math.floor((now - new Date(submittedAt).getTime()) / 86_400_000)
        : 0
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        clientName: t.client?.name ?? null,
        clientSlug: t.client?.slug ?? null,
        assigneeName: t.user?.name ?? '—',
        popCode: t.pop?.code ?? null,
        evidence: t.evidence,
        checklistTotal: t.checklist.length,
        checklistDone: t.checklist.filter((c) => c.done).length,
        dueDate: t.dueDate,
        submittedAt,
        waitingDays,
      }
    })

    return { items, canDecide }
  },
)

// ─── REDESIGN — Contadores de pendência da sidebar (navegação fluida) ──────────

export type SidebarCounts = {
  meuDia: number          // minhas tarefas atrasadas/para hoje
  abertas: number         // tarefas abertas (role-scoped)
  checkins: number        // check-ins (OPE-06) em aberto
  validacoes: number      // aguardando validação da CS
  warRooms: number        // War Rooms ativas
  alertas: number         // alertas não lidos
  suporte: number         // demandas de suporte abertas
}

/** Contadores leves para badges da sidebar. Role-scoped, tudo em paralelo. */
export const getSidebarCounts = cache(
  async (userId: string, role: string): Promise<SidebarCounts> => {
    const viewAll = canViewAll(role)
    const taskScope: Prisma.TaskWhereInput = taskScopeFor(userId, role)
    const clientScope: Prisma.ClientWhereInput = viewAll
      ? {}
      : { assignments: { some: { userId } } }

    // A-117/A-109: "hoje" no dia-parede SP (00:00 SP + 24h), não fuso do
    // servidor — o badge Meu Dia deixa de saltar 1 dia entre 21–24h SP.
    const now = new Date()
    const endToday = new Date(startOfTodaySaoPaulo(now).getTime() + 86_400_000)
    const openStatus: Prisma.TaskWhereInput['status'] = { notIn: ['CONCLUIDO', 'CANCELADO'] }

    const [meuDia, abertas, checkins, validacoes, warRooms, alertas, suporte] = await Promise.all([
      prisma.task.count({ where: { assignedTo: userId, status: openStatus, dueDate: { lt: endToday } } }),
      prisma.task.count({ where: { ...taskScope, status: openStatus } }),
      // A-104: badge = check-ins semanais PENDENTES (mesmo predicado da tela),
      // não Task OPE-06 (model diferente que nunca batia com o board).
      pendingCheckinCount(userId, role),
      prisma.task.count({ where: { ...taskScope, status: { in: ['AGUARDANDO_CS', 'EM_VALIDACAO'] } } }),
      prisma.criticalProtocol.count({ where: { status: { not: 'ENCERRADO' }, client: clientScope } }),
      // A-105: exclui KPI_DROP/SPIKE_24H (mesma lista do cockpit) — badge deixa
      // de ser maior que o número exibido na tela.
      prisma.alert.count({ where: { read: false, type: { notIn: EXCLUDED_ALERT_TYPES }, client: clientScope } }),
      // A-107/A-108: mesmo predicado da tela /suporte — status ABERTOS
      // (≠CONCLUIDO/CANCELADO) e escopo `assignedTo OR carteira` (taskScope).
      prisma.task.count({ where: { ...taskScope, isSupport: true, status: { in: OPEN_SUPPORT_STATUSES } } }),
    ])

    return { meuDia, abertas, checkins, validacoes, warRooms, alertas, suporte }
  },
)

// ─── BLOCO 7 — Aceite operacional (integridade: o que pode quebrar silenciosamente) ──

export type AceiteSignal = {
  key: string
  label: string          // o que é
  count: number
  problema: string       // o que está errado / o porquê
  acao: string           // o que fazer agora
  href: string
  severity: 'critico' | 'atencao' | 'ok'
}

export type AceiteOperacional = {
  signals: AceiteSignal[]
  geradoEm: Date
}

const HOT_LEAD_STATUSES = ['EM_CONTATO', 'REUNIAO_AGENDADA', 'PROPOSTA_ENVIADA', 'PROPOSTA_ACEITA'] as const

/**
 * Aceite operacional: cruza os sinais que indicam processo quebrando sem ninguém
 * ver — atraso, falta de dono, falta de evidência, War Room sem critério, rotina
 * que não rodou, lead esquecido. Role-scoped.
 */
export const getAceiteOperacional = cache(
  async (userId: string, role: string): Promise<AceiteOperacional> => {
    const viewAll = canViewAll(role)
    const now = new Date()
    const taskScope: Prisma.TaskWhereInput = taskScopeFor(userId, role)
    const clientScope: Prisma.ClientWhereInput = viewAll ? {} : { assignments: { some: { userId } } }
    const openStatus: Prisma.TaskWhereInput['status'] = { notIn: ['CONCLUIDO', 'CANCELADO'] }
    const d30 = new Date(now.getTime() - 30 * 86_400_000)
    const d8 = new Date(now.getTime() - 8 * 86_400_000)
    const d1 = new Date(now.getTime() - 86_400_000)
    const d3 = new Date(now.getTime() - 3 * 86_400_000)
    // Atrasada = prazo anterior ao início de HOJE em SP (ver util).
    const atrasoLimite = startOfTodaySaoPaulo(now)

    const [
      atrasadas, semGestor, semEvidencia, warRoomSemCriterio, rotinasParadas, automacaoFalhas, leadsParados,
    ] = await Promise.all([
      prisma.task.count({ where: { ...taskScope, status: openStatus, dueDate: { lt: atrasoLimite } } }),
      viewAll
        ? prisma.client.count({ where: { status: 'ACTIVE', assignments: { none: {} } } })
        : Promise.resolve(0),
      prisma.task.count({
        where: { ...taskScope, status: 'CONCLUIDO', evidence: null, completedAt: { gte: d30 }, pop: { code: { in: ['OPE-06', 'OPE-07'] } } },
      }),
      prisma.criticalProtocol.count({ where: { status: { not: 'ENCERRADO' }, exitCriteria: null, client: clientScope } }),
      viewAll
        ? prisma.taskRecurrenceRule.count({ where: { active: true, OR: [{ lastRunAt: null }, { lastRunAt: { lt: d8 } }] } })
        : Promise.resolve(0),
      viewAll
        ? prisma.automationLog.count({ where: { status: 'FALHA', createdAt: { gte: d1 } } })
        : Promise.resolve(0),
      viewAll
        ? prisma.agencyLead.count({
            where: {
              status: { in: [...HOT_LEAD_STATUSES] },
              deletedAt: null,
              convertedClientId: null,
              activities: { none: { occurredAt: { gte: d3 } } },
            },
          })
        : Promise.resolve(0),
    ])

    const sev = (n: number, crit = 1): AceiteSignal['severity'] => (n === 0 ? 'ok' : n >= crit ? 'critico' : 'atencao')

    const signals: AceiteSignal[] = [
      { key: 'atrasadas', label: 'Tarefas atrasadas', count: atrasadas, severity: atrasadas > 0 ? 'critico' : 'ok',
        problema: 'Passaram do prazo e seguem abertas', acao: 'Resolver ou repactuar o prazo', href: '/operacional' },
      { key: 'semEvidencia', label: 'Concluídas sem evidência', count: semEvidencia, severity: semEvidencia > 0 ? 'atencao' : 'ok',
        problema: 'Check-in/prestação marcado como pronto sem comprovação', acao: 'Cobrar a evidência do responsável', href: '/operacional' },
      { key: 'warRoomSemCriterio', label: 'War Room sem critério de saída', count: warRoomSemCriterio, severity: sev(warRoomSemCriterio),
        problema: 'Conta crítica sem definição de quando sai do vermelho', acao: 'Definir critério de saída mensurável', href: '/anti-churn' },
      { key: 'leadsParados', label: 'Leads quentes parados', count: leadsParados, severity: leadsParados > 0 ? 'atencao' : 'ok',
        problema: 'Em negociação e sem contato há 3+ dias', acao: 'Fazer o próximo follow-up', href: '/comercial' },
      { key: 'semGestor', label: 'Clientes sem gestor', count: semGestor, severity: sev(semGestor),
        problema: 'Cliente ativo sem responsável atribuído', acao: 'Atribuir um gestor primário', href: '/clients' },
      { key: 'rotinasParadas', label: 'Rotinas que não rodaram', count: rotinasParadas, severity: sev(rotinasParadas),
        problema: 'Recorrência ativa sem execução recente', acao: 'Verificar o cron de recorrências', href: '/processos' },
      { key: 'automacaoFalhas', label: 'Falhas de automação (24h)', count: automacaoFalhas, severity: automacaoFalhas > 0 ? 'atencao' : 'ok',
        problema: 'Automações falharam nas últimas 24h', acao: 'Revisar os logs de automação', href: '/processos' },
    ]

    return { signals, geradoEm: now }
  },
)

// ─── Watchdog de cron (S1-007) ─────────────────────────────────────────────────

export type CronHealth = {
  lastRunAt: Date | null
  horasAtras: number | null
  stale: boolean
}

/**
 * WATCHDOG de cron (S1-007) — camada 2: detecção que NÃO depende do cron vivo.
 *
 * Lê o heartbeat CRON_DAILY_LAST_RUN (gravado ao fim de /api/cron/daily). Como
 * esta função roda quando o Marcos abre o sistema, ela detecta o cron morto
 * mesmo que o próprio cron esteja fora do ar (um watchdog interno morreria junto).
 *
 * `stale` = última execução há mais de 26h (margem sobre o ciclo de 24h) OU
 * nunca rodou (lastRunAt null → stale, para não mostrar dado velho como atual).
 *
 * Escopo ADMIN (dado operacional interno): para os demais papéis retorna
 * `stale: false` — o banner some, sem vazar o estado da infraestrutura.
 */
export async function getCronHealth(role: string): Promise<CronHealth> {
  if (normalizeRole(role) !== 'ADMIN') {
    return { lastRunAt: null, horasAtras: null, stale: false }
  }
  try {
    const lastRun = await readCronHeartbeat('DAILY')
    if (!lastRun) {
      return { lastRunAt: null, horasAtras: null, stale: true }
    }
    const horasAtras = (Date.now() - lastRun.getTime()) / 3_600_000
    return {
      lastRunAt: lastRun,
      horasAtras: Math.floor(horasAtras),
      stale: horasAtras > CRON_STALE_HOURS,
    }
  } catch (err) {
    // Falha de leitura não pode quebrar a página — trata como "nunca rodou".
    console.error('[dal.getCronHealth] falha ao ler heartbeat:', err)
    return { lastRunAt: null, horasAtras: null, stale: true }
  }
}

// ─── Governança de alertas — dashboard de saúde (Fase 2, ADMIN only) ──────────

export type AlertGovernanceHealthRow = {
  type: AlertType
  label: string
  ownerLabel: string
  severity: 'ALTA' | 'MEDIA' | 'BAIXA'
  criados: number
  reconhecidos: number
  /** % de reconhecimento (0–100). null quando não houve nenhum criado. */
  taxaReconhecimento: number | null
  /** Tempo médio criado→reconhecido em horas (dos reconhecidos). null se nenhum. */
  tempoMedioHoras: number | null
  /** true = taxa < 50% com >= 5 criados → o alerta está MAL DESENHADO. */
  malDesenhado: boolean
}

/**
 * Saúde da governança de alertas nos últimos 14 dias, por tipo. Guard de papel:
 * dado operacional interno restrito a ADMIN (os demais recebem lista vazia — a
 * seção some da tela sem vazar métrica de processo). Exclui TASK_AUTOMATION
 * (canal das próprias escalações/meta-alertas — não é "alerta de negócio").
 */
export const getAlertGovernanceHealth = cache(async (
  role: string,
): Promise<AlertGovernanceHealthRow[]> => {
  if (normalizeRole(role) !== 'ADMIN') return []

  const since = new Date(Date.now() - 14 * 86_400_000)
  const rows = await prisma.alert.findMany({
    where: { createdAt: { gte: since }, type: { not: 'TASK_AUTOMATION' } },
    select: { type: true, createdAt: true, acknowledgedAt: true },
  })

  const SEV_RANK: Record<'ALTA' | 'MEDIA' | 'BAIXA', number> = { ALTA: 0, MEDIA: 1, BAIXA: 2 }

  const byType = new Map<AlertType, { criados: number; reconhecidos: number; somaHoras: number }>()
  for (const r of rows) {
    const acc = byType.get(r.type) ?? { criados: 0, reconhecidos: 0, somaHoras: 0 }
    acc.criados++
    if (r.acknowledgedAt) {
      acc.reconhecidos++
      acc.somaHoras += (new Date(r.acknowledgedAt).getTime() - new Date(r.createdAt).getTime()) / 3_600_000
    }
    byType.set(r.type, acc)
  }

  const result: AlertGovernanceHealthRow[] = []
  for (const [type, acc] of byType) {
    const gov = ALERT_GOVERNANCE[type]
    const taxa = acc.criados > 0 ? Math.round((acc.reconhecidos / acc.criados) * 100) : null
    result.push({
      type,
      label: ALERT_HEALTH_LABELS[type] ?? type,
      ownerLabel: GOVERNANCE_ROLE_LABELS[gov.ownerRole],
      severity: gov.severity,
      criados: acc.criados,
      reconhecidos: acc.reconhecidos,
      taxaReconhecimento: taxa,
      tempoMedioHoras: acc.reconhecidos > 0 ? Math.round((acc.somaHoras / acc.reconhecidos) * 10) / 10 : null,
      malDesenhado: taxa !== null && taxa < 50 && acc.criados >= 5,
    })
  }

  // Ordena: mal desenhados primeiro, depois por severidade, depois por volume.
  return result.sort((a, b) => {
    if (a.malDesenhado !== b.malDesenhado) return a.malDesenhado ? -1 : 1
    const s = SEV_RANK[a.severity] - SEV_RANK[b.severity]
    if (s !== 0) return s
    return b.criados - a.criados
  })
})

// ─── T-24 · Painel de saúde real dos 21 POPs (/processos) ───────────────────────
//
// Enriquece o catálogo estático (lib/pops-catalog) com o ESTADO VIVO de cada POP
// que já tem instrumentação no Performli. Responde, por processo: o que está
// atrasado, qual rotina não rodou, quem precisa agir. POPs sem instrumentação
// são marcados honestamente — não inventamos número.
//
// Só agrega processos cujo popId é MATERIALIZADO no sistema (tasks com popId)
// ou que têm sinal específico (check-in semanal, prestação de contas, War Room).
// Toda agregação em groupBy/count por processo — sem N+1.

/** Estado vivo de um processo. SEM_INSTRUMENTACAO = dado ainda não coletado. */
export type ProcessoHealthStatus = 'SAUDAVEL' | 'ATENCAO' | 'CRITICO' | 'SEM_INSTRUMENTACAO'

export type ProcessoHealth = {
  codigo: string
  instrumentado: boolean
  status: ProcessoHealthStatus
  /** true = o POP tem popId materializado em Task → exibir bloco de contadores. */
  temTasks: boolean
  abertas: number
  atrasadas: number
  concluidas30d: number
  ultimaAtividade: Date | null
  /** Linhas operacionais extras (check-ins, relatórios, War Rooms). */
  detalhes: string[]
}

export type ProcessosHealth = {
  consultadoEm: Date
  saudaveis: number
  atencao: number
  criticos: number
  semInstrumentacao: number
  porCodigo: Record<string, ProcessoHealth>
}

/**
 * Instrumentação viva de cada POP. POPs ausentes deste mapa → 'sem
 * instrumentação' na tela.
 *
 * `kind` define de onde vem o sinal e como o status é derivado:
 * - TASK: Task.popId (grep dos serviços/actions).
 * - CHECKIN: OPE-06 — ClientWeeklyCheckin da semana corrente.
 * - REPORT: OPE-07 — WeeklyReport gerado vs enviado na ÚLTIMA semana fechada
 *   (mesma âncora do gerador: getWeekRange(hoje-7d)).
 * - WAR14: CriticalProtocol ativos (pop_war_14 tem tasks materializadas).
 * - WAR15: CriticalProtocol ativos SEM revisão >7d.
 * - WAR16: CriticalProtocol com critério de saída atingido, ainda não encerrado.
 *
 * `cadencia` evita falso-CRÍTICO por inatividade:
 * - ROTINA: espera-se atividade recorrente → "rotina parada" é alarme legítimo.
 * - EVENTO: a task/ocorrência nasce de um gatilho (cliente novo, sinal de churn,
 *   auditoria) → ausência de atividade é NORMAL (verde-quando-vazio, como o WAR).
 *   Atraso (dueDate vencido) continua sendo 🟡/🔴 em qualquer cadência.
 */
type PopKind = 'TASK' | 'CHECKIN' | 'REPORT' | 'WAR14' | 'WAR15' | 'WAR16'
type PopCadencia = 'ROTINA' | 'EVENTO'

const POP_INSTRUMENTACAO: Record<string, { kind: PopKind; cadencia: PopCadencia }> = {
  'CAP-01': { kind: 'TASK', cadencia: 'EVENTO' },    // task nasce por lead (lead-followup-checker)
  'ONB-04': { kind: 'TASK', cadencia: 'EVENTO' },    // por cliente novo
  'ONB-05': { kind: 'TASK', cadencia: 'EVENTO' },    // por cliente novo (janela de 30d)
  'OPE-06': { kind: 'CHECKIN', cadencia: 'ROTINA' }, // semanal recorrente
  'OPE-07': { kind: 'REPORT', cadencia: 'ROTINA' },  // semanal recorrente
  'OPE-08': { kind: 'TASK', cadencia: 'EVENTO' },    // auditoria disparada por resultado
  'CSX-12': { kind: 'TASK', cadencia: 'EVENTO' },    // por sinal de radar/churn
  'CSX-13': { kind: 'TASK', cadencia: 'EVENTO' },    // por sinal anti-churn
  'WAR-14': { kind: 'WAR14', cadencia: 'EVENTO' },   // por evento crítico (tem pop_war_14)
  'WAR-15': { kind: 'WAR15', cadencia: 'EVENTO' },   // sem popId próprio — só sinal de protocolo
  'WAR-16': { kind: 'WAR16', cadencia: 'EVENTO' },   // sem popId próprio — só sinal de protocolo
}

/** Kinds cujo popId é materializado em Task → têm contadores de task próprios. */
const POP_KINDS_COM_TASKS: PopKind[] = ['TASK', 'CHECKIN', 'WAR14']

/** codigo 'OPE-06' → popId 'pop_ope_06' (convenção do seed central_operacional). */
function codigoToPopId(codigo: string): string {
  return `pop_${codigo.toLowerCase().replace('-', '_')}`
}

const TASK_TERMINAIS: TaskStatus[] = [TaskStatus.CONCLUIDO, TaskStatus.CANCELADO]

function ageDays(d: Date, now: number): number {
  return Math.floor((now - d.getTime()) / 86_400_000)
}

/**
 * getProcessosHealth — guard idêntico ao da página /processos (qualquer sessão
 * autenticada; a página só chama requireSession). 100% leitura, sem mutação.
 */
export const getProcessosHealth = cache(async (): Promise<ProcessosHealth> => {
  await requireSession()

  const now = Date.now()
  const nowDate = new Date(now)
  const cutoff30d = new Date(now - 30 * 86_400_000)
  const { start: weekStart } = getWeekRange()
  // OPE-07: relatórios são gravados com o weekStart da ÚLTIMA semana fechada
  // (gerador e report-delivery-tracker usam getWeekRange(hoje-7d)).
  const { start: lastWeekStart } = getWeekRange(new Date(now - 7 * 86_400_000))

  const codigos = Object.keys(POP_INSTRUMENTACAO)
  const taskPopIds = codigos
    .filter((c) => POP_KINDS_COM_TASKS.includes(POP_INSTRUMENTACAO[c].kind))
    .map(codigoToPopId)

  const [
    abertasByPop,
    atrasadasByPop,
    concluidasByPop,
    ultimaByPop,
    checkinsSemana,
    protocolos,
    relatoriosSemana,
  ] = await Promise.all([
    prisma.task.groupBy({
      by: ['popId'],
      where: { popId: { in: taskPopIds }, status: { notIn: TASK_TERMINAIS } },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ['popId'],
      where: {
        popId: { in: taskPopIds },
        status: { notIn: TASK_TERMINAIS },
        dueDate: { lt: nowDate },
      },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ['popId'],
      where: {
        popId: { in: taskPopIds },
        status: TaskStatus.CONCLUIDO,
        completedAt: { gte: cutoff30d },
      },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ['popId'],
      where: { popId: { in: taskPopIds } },
      _max: { createdAt: true },
    }),
    prisma.clientWeeklyCheckin.groupBy({
      by: ['status'],
      where: { weekStart, client: { status: 'ACTIVE' } },
      _count: { _all: true },
    }),
    prisma.criticalProtocol.findMany({
      where: { status: { not: 'ENCERRADO' } },
      select: { lastReviewedAt: true, activatedAt: true, exitMetAt: true },
    }),
    prisma.weeklyReport.findMany({
      where: { weekStart: lastWeekStart, client: { status: 'ACTIVE' } },
      select: { sentAt: true },
    }),
  ])

  const abertasMap = new Map<string, number>()
  for (const r of abertasByPop) if (r.popId) abertasMap.set(r.popId, r._count._all)
  const atrasadasMap = new Map<string, number>()
  for (const r of atrasadasByPop) if (r.popId) atrasadasMap.set(r.popId, r._count._all)
  const concluidasMap = new Map<string, number>()
  for (const r of concluidasByPop) if (r.popId) concluidasMap.set(r.popId, r._count._all)
  const ultimaMap = new Map<string, Date | null>()
  for (const r of ultimaByPop) if (r.popId) ultimaMap.set(r.popId, r._max.createdAt)

  // ── Sinal OPE-06: check-ins da semana ─────────────────────────────────────
  let entregues = 0
  let pendentes = 0
  let reprovados = 0
  for (const g of checkinsSemana) {
    const n = g._count._all
    if (g.status === 'PENDENTE') pendentes += n
    else if (g.status === 'REPROVADO') { reprovados += n; entregues += n }
    else entregues += n // PREENCHIDO / APROVADO
  }
  const totalCheckins = entregues + pendentes

  // ── Sinais de War Room (CriticalProtocol ativos) — sinais distintos por POP ─
  const warAtivas = protocolos.length
  const warSemRevisao = protocolos.filter((p) => {
    const ref = p.lastReviewedAt ?? p.activatedAt // fallback: nunca revisada
    return ageDays(ref, now) > 7
  }).length
  const warCriterioAtingido = protocolos.filter((p) => p.exitMetAt !== null).length

  // ── Sinal OPE-07: relatórios gerados vs enviados na última semana fechada ──
  const relatoriosGerados = relatoriosSemana.length
  const relatoriosEnviados = relatoriosSemana.filter((r) => r.sentAt !== null).length

  const porCodigo: Record<string, ProcessoHealth> = {}
  let saudaveis = 0
  let atencao = 0
  let criticos = 0

  for (const codigo of codigos) {
    const { kind, cadencia } = POP_INSTRUMENTACAO[codigo]
    const temTasks = POP_KINDS_COM_TASKS.includes(kind)
    const popId = codigoToPopId(codigo)
    const abertas = abertasMap.get(popId) ?? 0
    const atrasadas = atrasadasMap.get(popId) ?? 0
    const concluidas30d = concluidasMap.get(popId) ?? 0
    const ultimaAtividade = ultimaMap.get(popId) ?? null

    const detalhes: string[] = []
    let status: ProcessoHealthStatus = 'SAUDAVEL'

    // Regra transversal de ATRASO — honesta em qualquer cadência (evento ou rotina).
    if (atrasadas >= 3) status = 'CRITICO'
    else if (atrasadas > 0) status = 'ATENCAO'
    if (atrasadas > 0) detalhes.push(`${atrasadas} tarefa(s) atrasada(s) sem conclusão`)

    if (kind === 'TASK') {
      const semAtividadeRecente = ultimaAtividade === null || ageDays(ultimaAtividade, now) > 14
      if (cadencia === 'ROTINA') {
        // Rotina recorrente parada é alarme legítimo.
        if (ultimaAtividade === null) {
          status = 'CRITICO'
          detalhes.push('Nenhuma tarefa registrada — a rotina pode não estar rodando')
        } else if (ageDays(ultimaAtividade, now) > 14) {
          status = 'CRITICO'
          detalhes.push(`Sem nova tarefa há ${ageDays(ultimaAtividade, now)} dias — rotina parada`)
        }
      } else if (semAtividadeRecente) {
        // Cadência por EVENTO: ausência de ocorrência é NORMAL, não alarme.
        detalhes.push('Disparado por evento — sem ocorrência recente')
      }
    } else if (kind === 'CHECKIN') {
      detalhes.push(`${entregues} de ${totalCheckins} check-ins da semana entregues`)
      if (reprovados > 0) detalhes.push(`${reprovados} check-in(s) reprovado(s) aguardando correção`)
      if (pendentes > 0) {
        detalhes.push(`${pendentes} cliente(s) sem check-in nesta semana`)
        if (status !== 'CRITICO') status = 'ATENCAO'
      }
      if (reprovados > 0 && status !== 'CRITICO') status = 'ATENCAO'
    } else if (kind === 'REPORT') {
      detalhes.push(`${relatoriosGerados} relatório(s) gerado(s), ${relatoriosEnviados} enviado(s) na última semana fechada`)
      if (relatoriosGerados === 0) {
        detalhes.push('Nenhum relatório gerado na última semana fechada')
        if (status === 'SAUDAVEL') status = 'ATENCAO'
      } else if (relatoriosEnviados < relatoriosGerados) {
        detalhes.push(`${relatoriosGerados - relatoriosEnviados} relatório(s) gerado(s) mas ainda não enviado(s) ao cliente`)
        if (status === 'SAUDAVEL') status = 'ATENCAO'
      }
    } else if (kind === 'WAR14') {
      // Abertura de War Room — quantas contas críticas estão em protocolo ativo.
      detalhes.push(`${warAtivas} War Room(s) ativa(s)`)
    } else if (kind === 'WAR15') {
      // Documentação/condução — War Rooms sem revisão viram esquecimento.
      if (warSemRevisao > 0) {
        detalhes.push(`${warSemRevisao} War Room(s) sem revisão há mais de 7 dias`)
        status = 'CRITICO'
      } else {
        detalhes.push('Todas as War Rooms ativas foram revisadas nos últimos 7 dias')
      }
    } else {
      // WAR16 — acompanhamento até a saída do crítico.
      if (warCriterioAtingido > 0) {
        detalhes.push(`${warCriterioAtingido} War Room(s) com critério de saída atingido — avaliar encerramento`)
        if (status === 'SAUDAVEL') status = 'ATENCAO'
      } else {
        detalhes.push('Nenhuma War Room aguardando encerramento')
      }
    }

    porCodigo[codigo] = {
      codigo,
      instrumentado: true,
      status,
      temTasks,
      abertas,
      atrasadas,
      concluidas30d,
      ultimaAtividade,
      detalhes,
    }

    if (status === 'CRITICO') criticos++
    else if (status === 'ATENCAO') atencao++
    else saudaveis++
  }

  // 'semInstrumentacao' = catálogo total − instrumentados. O loader não conhece
  // o catálogo estático (lib/pops-catalog), então a página faz a subtração final.
  // Aqui expomos apenas os instrumentados que faltam para o total ser resolvido
  // na tela; mantemos 0 para não duplicar a fonte da verdade do catálogo.
  return {
    consultadoEm: nowDate,
    saudaveis,
    atencao,
    criticos,
    semInstrumentacao: 0,
    porCodigo,
  }
})
