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
import { getWeekRange, getMonthRange, saoPauloDateString } from '@/lib/utils'

// Item 7 (fallback de meta via ficha do Client): NÃO plugável aqui sem migration.
// HealthScore.goalId é FK obrigatória (schema:430, parte do unique), então não há
// como gerar um score de FATURAMENTO/CPA a partir de Client.faturamentoEsperado/
// cpaMaximo sem um Goal real. Precedência Goal > Client fica registrada; o plug
// depende de tornar goalId opcional (fora do escopo da Onda 1). Deixado como está.
export const LOWER_IS_BETTER: Set<MetricType> = new Set([
  'CPL', 'CPA', 'CAC', 'CPC', 'SPEND', 'CPS', 'CPM',
])

// Definição CANÔNICA de investimento/ROAS (decisão do dono, Pergunta 1 = A): só
// plataformas de ANÚNCIO contam como spend. GA4/GA4SYNC/NUVEMSHOP são fontes de
// RECEITA (spend nulo) e NUNCA entram no investimento nem no denominador do ROAS.
// Fonte única desta lista — todo cálculo inline de spend deve usar `isAdPlatform`
// em vez de repetir `!== 'GA4'` (que vazava GA4SYNC/NUVEMSHOP no conjunto "ads").
export const NON_AD_PLATFORMS: readonly string[] = ['GA4', 'GA4SYNC', 'NUVEMSHOP']
export const isAdPlatform = (platform: string): boolean => !NON_AD_PLATFORMS.includes(platform)

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
  // Opcional: usado para a precedência GA4SYNC>GA4 POR DIA. Quando ausente, o
  // merge por-dia trata a linha como dia único (sempre contada, nunca perdida).
  date?:            unknown
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
  // `ads` = plataformas de ANÚNCIO (spend/impressões). GA4/GA4SYNC/NUVEMSHOP têm
  // spend nulo, então incluí-los aqui não corrompe totalSpend/adImpressions —
  // mas os excluímos por clareza: são fontes de RECEITA, não de investimento.
  const ads  = snapshots.filter((x) => isAdPlatform(x.platformAccount.platform))
  const meta = snapshots.filter((x) => x.platformAccount.platform === 'META_ADS')
  // GA4SYNC: receita AUTORITATIVA da loja (Nuvemshop via API GA4Sync), persistida
  // no MetricSnapshot pelo sync. Quando o cliente ECOMMERCE tem dado GA4Sync na
  // janela, ele é a fonte de verdade do faturamento (CR-1 da auditoria); senão,
  // cai no GA4 (atribuído). LOCAL/B2B NÃO usam GA4Sync (medem leads via Meta).
  const ga4sync = snapshots.filter((x) => x.platformAccount.platform === 'GA4SYNC')

  // ga4Revenue removido: o faturamento ECOMMERCE agora vem de mergePerDay
  // (GA4SYNC>GA4 por dia). ga4Purchases/ga4Sessions seguem para TAXA_CONVERSAO/CPS.
  const ga4Purchases  = ga4.reduce((s, x) => s + toNum(x.conversions), 0)
  const ga4Sessions   = ga4.reduce((s, x) => s + toNum(x.clicks), 0)

  // Precedência GA4SYNC>GA4 POR DIA (não tudo-ou-nada): para cada dia, se há
  // linha GA4SYNC usa-a; senão usa GA4. Sem isso, uma janela que MISTURA dias
  // com e sem GA4Sync (ex.: mês que cruza o limite de sincronização de 90d)
  // somaria só os dias GA4SYNC e descartaria os dias GA4 → subcontagem
  // (bloqueante da QA). Também elimina a dupla contagem: dia com GA4 e GA4SYNC
  // usa só o GA4SYNC. Linhas sem `date` caem em chave única (contadas, nunca
  // deduplicadas) — fallback seguro; MetricSnapshot sempre tem date.
  let _nokey = 0
  const dayKeyOf = (x: AggregatableSnapshot): string => {
    const d = x.date
    if (d == null) return `__nd${_nokey++}`
    const dt = d instanceof Date ? d : new Date(String(d))
    return Number.isNaN(dt.getTime()) ? `__bd${_nokey++}` : dt.toISOString().slice(0, 10)
  }
  const mergePerDay = (field: (x: AggregatableSnapshot) => number): number => {
    const byDay = new Map<string, { ga4: number; sync: number; hasSync: boolean }>()
    for (const x of ga4) {
      const k = dayKeyOf(x)
      const e = byDay.get(k) ?? { ga4: 0, sync: 0, hasSync: false }
      e.ga4 += field(x)
      byDay.set(k, e)
    }
    for (const x of ga4sync) {
      const k = dayKeyOf(x)
      const e = byDay.get(k) ?? { ga4: 0, sync: 0, hasSync: false }
      e.sync += field(x)
      e.hasSync = true
      byDay.set(k, e)
    }
    let total = 0
    for (const e of byDay.values()) total += e.hasSync ? e.sync : e.ga4
    return total
  }

  const metaRevenue    = meta.reduce((s, x) => s + toNum(x.conversionValue), 0)
  const metaConv       = meta.reduce((s, x) => s + toNum(x.conversions), 0)
  const metaMensagens  = meta.reduce((s, x) => s + toNum(x.mensagens), 0)
  const metaLandViews  = meta.reduce((s, x) => s + toNum(x.landingPageViews), 0)
  const metaSpend      = meta.reduce((s, x) => s + toNum(x.spend), 0)

  const totalSpend    = ads.reduce((s, x) => s + toNum(x.spend), 0)
  const adImpressions = ads.reduce((s, x) => s + toNum(x.impressions), 0)

  // Source selection per business type.
  // B2B mede como NEGÓCIO LOCAL (decisão do dono, 2026-07: "b2b se mede como
  // local, os nossos buscam leads"): fonte = plataforma de ANÚNCIO, não GA4.
  // `isLocalLike` cobre LOCAL e B2B; ECOMMERCE segue GA4. A lógica ECOMMERCE/
  // LOCAL abaixo é preservada — só o roteamento do B2B muda (antes caía em GA4).
  const isLocalLike = businessType !== 'ECOMMERCE'
  // ECOMMERCE: receita/pedidos por-dia com GA4SYNC>GA4 (loja real > atribuído).
  // Para cliente sem NENHUMA linha GA4SYNC, mergePerDay retorna exatamente o
  // ga4Revenue/ga4Purchases de antes (todos os dias caem no ramo GA4).
  // LOCAL/B2B: Meta, sem mudança.
  const ecomRevenue   = mergePerDay((x) => toNum(x.conversionValue))
  const ecomPurchases = mergePerDay((x) => toNum(x.conversions))
  const revenue   = isLocalLike ? metaRevenue : ecomRevenue
  const purchases = isLocalLike ? metaConv    : ecomPurchases

  // ── Derived metrics ───────────────────────────────────────────────────────

  if (metric === 'ROAS') {
    const spend = isLocalLike ? metaSpend : totalSpend
    return spend > 0 && revenue > 0 ? revenue / spend : null
  }

  if (metric === 'FATURAMENTO' || metric === 'SALES') {
    return revenue > 0 ? revenue : null
  }

  if (metric === 'CONVERSIONS') {
    return purchases > 0 ? purchases : null
  }

  if (metric === 'MENSAGENS') {
    if (isLocalLike) {
      return metaMensagens > 0 ? metaMensagens : null
    }
    return null
  }

  if (metric === 'LEADS') {
    // Lead form campaigns → conversions field; WhatsApp campaigns → mensagens field
    if (metaConv > 0) return metaConv
    if (isLocalLike && metaMensagens > 0) return metaMensagens
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
      : (isLocalLike && metaMensagens > 0 ? metaMensagens : 0)
    return totalSpend > 0 && denom > 0 ? totalSpend / denom : null
  }

  if (metric === 'VISITAS_PERFIL' || metric === 'LIGACOES' || metric === 'AGENDAMENTOS') {
    if (isLocalLike) {
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

function computeAchievementPct(actual: number, target: number, lowerIsBetter: boolean): number | null {
  if (target === 0) return 0
  // ME-3: métricas lowerIsBetter (CPL/CPA/CAC/CPC/SPEND/CPS/CPM) dividem target/actual.
  // Com actual <= 0 (sem dado real de custo) isso gerava Infinity persistido em
  // HealthScore.achievementPct. Retornar null = indeterminado (sem dado).
  if (lowerIsBetter) {
    if (actual <= 0) return null
    return (target / actual) * 100
  }
  return (actual / target) * 100
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

  // AL-4: ancora "hoje" no UTC-midnight do dia-parede SP — mesmo fuso do
  // periodStart/End (que getWeekRange/getMonthRange já produzem em UTC-midnight
  // do dia SP). Sem isso, na janela 21-23h SP o `today` (UTC do runtime) ficava
  // 1 dia à frente e o pro-rata driftava. startDay/endDay usam a data UTC do
  // período (que É o dia SP às 00:00Z) — não re-derivar via saoPauloDateString,
  // pois 00:00Z = 21:00 SP do dia anterior.
  const today = new Date(`${saoPauloDateString()}T00:00:00.000Z`)
  const startDay = new Date(periodStart); startDay.setUTCHours(0, 0, 0, 0)
  const endDay   = new Date(periodEnd);   endDay.setUTCHours(0, 0, 0, 0)

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
    // ME-3: achievement indeterminado (métrica de custo com actual<=0) — não
    // persiste HealthScore com valor enganoso (antes gravava Infinity). Mesmo
    // tratamento de "sem dado" da linha acima; achievementPct segue não-nulável.
    if (pct === null) continue
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

  // A-120: "hoje" ancorado no UTC-midnight do dia-parede SP (mesmo padrão da
  // linha 337). `new Date().setHours(0,0,0,0)` zerava no fuso do RUNTIME (UTC),
  // fazendo o streak "virar de dia" às 21h SP — divergindo do resto do sistema.
  const today = new Date(`${saoPauloDateString()}T00:00:00.000Z`)

  // A-103: leitura dos HealthScores + escrita do ClientStatusStreak na MESMA
  // transação. Sem isto, o Board e o Client 360 podiam ler estados divergentes
  // durante a janela entre o findMany e o update/upsert do streak.
  await prisma.$transaction(async (tx) => {
    const healthScores = await tx.healthScore.findMany({
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

    const existing = await tx.clientStatusStreak.findUnique({ where: { clientId } })

    if (existing && existing.status === status) {
      // sinceDay no MESMO fuso de `today` (UTC-midnight SP) — setUTCHours, não
      // setHours, para não reintroduzir o drift de fuso do A-120.
      const sinceDay = new Date(existing.since)
      sinceDay.setUTCHours(0, 0, 0, 0)
      const days = Math.floor((today.getTime() - sinceDay.getTime()) / 86_400_000) + 1
      await tx.clientStatusStreak.update({ where: { clientId }, data: { days } })
    } else {
      const prevStatus = existing?.status ?? null
      await tx.clientStatusStreak.upsert({
        where:  { clientId },
        update: { status, prevStatus, since: today, days: 1 },
        create: { clientId, status, prevStatus: prevStatus ?? undefined, since: today, days: 1 },
      })
    }
  })
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
