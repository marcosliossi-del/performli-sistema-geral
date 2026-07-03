/**
 * Daily Digest WhatsApp
 *
 * Envia múltiplos blocos separados por gestor, ordenados do mais crítico ao melhor.
 * Cada bloco inclui insights cruzados baseados no histórico real do cliente.
 */

import { prisma } from '@/lib/prisma'
import { broadcastWhatsApp } from '@/lib/whatsapp'
import { getMonthRange, getWeekRange } from '@/lib/utils'
import { getRealizadoBatch, type Realizado } from '@/lib/metas/realizado'
import type { MetricType, BusinessType } from '@prisma/client'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function emoji(status: string | null) {
  if (status === 'OTIMO')   return '✅'
  if (status === 'REGULAR') return '⚠️'
  if (status === 'RUIM')    return '🔴'
  return '⚪'
}

function statusOrder(status: string | null): number {
  if (status === 'RUIM')    return 0
  if (status === 'REGULAR') return 1
  if (status === 'OTIMO')   return 2
  return 3
}

function streakLabel(status: string | null, days: number): string {
  const ordinal = `${days}º dia`
  if (status === 'RUIM')    return `${ordinal} em estado crítico`
  if (status === 'REGULAR') return `${ordinal} em estado regular`
  if (status === 'OTIMO')   return `${ordinal} em ótimo estado`
  return ordinal
}

function toNum(v: { toNumber: () => number } | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'number' ? v : v.toNumber()
}

// Metrics that are pace-based (value accumulates over period)
const PACE_METRICS = new Set([
  'FATURAMENTO', 'SALES', 'SPEND', 'INVESTMENT',
  'LEADS', 'CONVERSIONS', 'MENSAGENS', 'SEGUIDORES',
  'AGENDAMENTOS', 'LIGACOES', 'VISITAS_PERFIL',
])

// Compact formatting per metric type
function formatVal(metric: string, value: number): string {
  if (value === 0) return '—'
  switch (metric) {
    case 'ROAS':
      // 2 casas para casar com todas as telas internas (metas, Client 360, etc).
      return `${value.toFixed(2)}x`
    case 'CTR':
    case 'TAXA_CONVERSAO':
      return `${value.toFixed(1)}%`
    case 'CPL':
    case 'CPA':
    case 'CAC':
    case 'TICKET_MEDIO':
    case 'CPM':
    case 'CPS':
      return `R$${value.toFixed(0)}`
    case 'FATURAMENTO':
    case 'INVESTMENT':
    case 'SPEND':
      return value >= 1000 ? `R$${(value / 1000).toFixed(0)}k` : `R$${value.toFixed(0)}`
    default:
      return String(Math.round(value))
  }
}

type HealthScoreRow = {
  status: string
  period: string
  periodStart: Date
  metric: string
  achievementPct: { toNumber: () => number } | number
  actualValue:    { toNumber: () => number } | number
  targetValue:    { toNumber: () => number } | number
  trendPct:       { toNumber: () => number } | number | null
}

// Single-metric fallback labels (used when no cross-pattern matches)
const METRIC_FALLBACK: Record<string, { histDrop: string; action: string }> = {
  TICKET_MEDIO:   { histDrop: 'ticket médio caiu vs. histórico',          action: 'verificar estoque dos produtos principais e mix de anúncios' },
  ROAS:           { histDrop: 'ROAS caiu vs. média histórica',             action: 'pausar adsets de menor retorno e revisar criativos ativos' },
  FATURAMENTO:    { histDrop: 'faturamento abaixo do padrão histórico',    action: 'revisar campanhas, criativos e estoque dos produtos mais vendidos' },
  TAXA_CONVERSAO: { histDrop: 'taxa de conversão caiu vs. histórico',      action: 'revisar landing page, checkout e anúncios de fundo de funil' },
  CONVERSIONS:    { histDrop: 'conversões abaixo do padrão histórico',     action: 'verificar funil de vendas e campanhas de conversão' },
  LEADS:          { histDrop: 'geração de leads abaixo do histórico',      action: 'revisar formulários, criativos e segmentação de captação' },
  MENSAGENS:      { histDrop: 'volume de mensagens abaixo do padrão',      action: 'revisar segmentação, criativos e botão de WhatsApp nos anúncios' },
  SEGUIDORES:     { histDrop: 'crescimento de seguidores abaixo do padrão', action: 'revisar estratégia de conteúdo e frequência de posts' },
  CPL:            { histDrop: 'CPL acima do histórico',                    action: 'otimizar criativos de captação e testar novos públicos' },
  CPA:            { histDrop: 'CPA acima do histórico',                    action: 'revisar campanhas de conversão e testar públicos diferentes' },
  CAC:            { histDrop: 'CAC acima do histórico',                    action: 'rever estratégia de aquisição e incentivar recompras' },
  CTR:            { histDrop: 'CTR caiu vs. histórico',                    action: 'testar novos criativos — audiência pode estar saturada' },
  CPM:            { histDrop: 'CPM acima do histórico',                    action: 'expandir públicos ou ajustar horários de veiculação' },
  INVESTMENT:     { histDrop: 'investimento acima do padrão',              action: 'ajustar limite de gastos das campanhas' },
  SPEND:          { histDrop: 'budget acima do padrão',                    action: 'ajustar limite de gastos das campanhas' },
}

/**
 * Smart cross-metric insight.
 * Looks at ALL failing metrics to find the most specific diagnostic pattern.
 * Falls back to single-metric insight with actual vs. target values + historical drop.
 */
type FunnelRates = { visitToCart: number | null; cartToCheckout: number | null; checkoutToPurchase: number | null } | null

/**
 * Números canônicos (realizado MTD via fonte única + meta mensal via Goal) por
 * (cliente, métrica). O STATUS continua vindo do HealthScore; só os NÚMEROS
 * exibidos (realizado, meta, ritmo %) passam a bater com as telas internas.
 */
type MetricNumbers = {
  /** realizado MTD por métrica → Map<clientId, Realizado> (fonte única). */
  realizadoByMetric: Map<string, Map<string, Realizado>>
  /** meta mensal por `${clientId}:${metric}` (Goal MONTHLY). */
  goalLookup: Map<string, number>
  daysElapsed: number
  daysInMonth: number
}

function buildSmartInsight(
  clientId: string,
  scores: HealthScoreRow[],
  businessType: string,
  getHistAvgFn: (cId: string, metric: string) => number | null,
  nums: MetricNumbers,
  funnelRates: FunnelRates = null,
): string | null {
  const ruimSet = new Set(scores.filter(s => s.status === 'RUIM').map(s => s.metric))
  const badSet  = new Set(scores.filter(s => s.status === 'RUIM' || s.status === 'REGULAR').map(s => s.metric))
  const okSet   = new Set(scores.filter(s => s.status === 'OTIMO').map(s => s.metric))

  if (badSet.size === 0) return null

  const isRuim   = (m: string) => ruimSet.has(m)
  const isBad    = (m: string) => badSet.has(m)
  const isOk     = (m: string) => okSet.has(m)
  const notRuim  = (m: string) => !ruimSet.has(m)
  const exists   = (m: string) => scores.some(s => s.metric === m)

  // Compact "actual vs full-period target (pace X%)" label for a single metric.
  // Realizado e meta vêm da FONTE ÚNICA (realizado MTD + Goal mensal), não mais
  // do HealthScore — assim os números batem com /agency/metas e Client 360.
  // O ritmo % das métricas de pacing usa a meta pró-rateada pelos dias do mês.
  const label = (metric: string): string => {
    const s = scores.find(s => s.metric === metric)
    if (!s) return metric
    const actual = nums.realizadoByMetric.get(metric)?.get(clientId)?.valor ?? 0
    const target = nums.goalLookup.get(`${clientId}:${metric}`) ?? 0
    const isPace = PACE_METRICS.has(metric)
    let pct = 0
    if (isPace) {
      const paced = target * (nums.daysElapsed / nums.daysInMonth)
      pct = paced > 0 ? Math.round((actual / paced) * 100) : 0
    } else {
      pct = target > 0 ? Math.round((actual / target) * 100) : 0
    }
    const pctLabel = isPace ? `ritmo ${pct}%` : `${pct}%`
    let base = `${metric}: ${formatVal(metric, actual)} (meta ${formatVal(metric, target)}, ${pctLabel})`
    const trend = toNum(s.trendPct)
    if (Math.abs(trend) >= 20) {
      const arrow = trend > 0 ? '↗' : '↘'
      const sign  = trend > 0 ? '+' : ''
      base += ` ${arrow} ${sign}${Math.round(trend)}% vs 7d ant.`
    }
    return base
  }

  const isLocal = businessType === 'LOCAL'

  if (!isLocal) {
    // ── E-commerce patterns (most specific → least specific) ──────────────────

    // Visitors arriving but not converting → checkout/product page issue
    if (isRuim('TAXA_CONVERSAO') && notRuim('CTR')) {
      // Check if we have funnel data to be more specific
      const atcRate  = funnelRates?.visitToCart
      const chkRate  = funnelRates?.cartToCheckout
      const purRate  = funnelRates?.checkoutToPurchase
      if (atcRate !== undefined && atcRate !== null && atcRate < 4) {
        return `   ↳ ${label('TAXA_CONVERSAO')} — taxa de adição ao carrinho baixa (${atcRate.toFixed(1)}%, ref 4–8%), produto sem apelo, preço alto ou falta de urgência na página`
      }
      if (chkRate !== undefined && chkRate !== null && chkRate < 38) {
        return `   ↳ ${label('TAXA_CONVERSAO')} — excesso de abandono de carrinho (${chkRate.toFixed(1)}% chegam ao checkout, ref 38–56%), verificar frete, cupom ou fluxo do carrinho`
      }
      if (purRate !== undefined && purRate !== null && purRate < 55) {
        return `   ↳ ${label('TAXA_CONVERSAO')} — abandono na finalização (${purRate.toFixed(1)}% completam a compra, ref 55–82%), verificar erros de pagamento ou atrito no checkout`
      }
      return `   ↳ ${label('TAXA_CONVERSAO')} — visitantes chegando mas não convertendo, possível abandono no checkout ou página do produto com problema`
    }

    // CTR AND ROAS both down → creative/audience saturation
    if (isRuim('CTR') && isRuim('ROAS')) {
      return `   ↳ ${label('ROAS')} | ${label('CTR')} — CTR em queda junto com ROAS, criativos desgastados ou audiência saturada, testar novas peças e públicos`
    }

    // ROAS ok but faturamento low → traffic volume / budget constraint
    if (isRuim('FATURAMENTO') && isOk('ROAS') && !isBad('TAXA_CONVERSAO')) {
      return `   ↳ ${label('FATURAMENTO')} — ROAS saudável mas faturamento baixo, orçamento pode estar limitando o volume de vendas`
    }

    // Ticket médio down but conversions/volume ok → product mix or stock
    if (isRuim('TICKET_MEDIO') && notRuim('CONVERSIONS') && notRuim('FATURAMENTO')) {
      return `   ↳ ${label('TICKET_MEDIO')} — volume de conversões ok mas ticket caiu, produtos de menor valor priorizados ou grade quebrada nos itens principais`
    }

    // High CPM compressing ROAS
    if (isRuim('ROAS') && isRuim('CPM')) {
      return `   ↳ ${label('CPM')} | ${label('ROAS')} — CPM elevado comprimindo o ROAS, audiência saturada, expandir público ou testar novos formatos`
    }

    // Budget being spent but poor return, CTR not the issue
    if (isRuim('ROAS') && exists('SPEND') && notRuim('SPEND') && notRuim('CTR')) {
      return `   ↳ ${label('ROAS')} — investimento e tráfego ok mas ROAS abaixo, pausar adsets de menor retorno e consolidar budget nos melhores`
    }

    // CPA rising with ok conversions → cost efficiency issue
    if (isRuim('CPA') && notRuim('CONVERSIONS')) {
      return `   ↳ ${label('CPA')} — conversões acontecendo mas custo por aquisição alto, revisar lances e segmentações das campanhas`
    }

    // Conversion + ROAS + revenue all bad → full funnel issue
    if (isRuim('ROAS') && isRuim('FATURAMENTO') && isRuim('TAXA_CONVERSAO')) {
      return `   ↳ ${label('ROAS')} — cadeia completa comprometida (ROAS + faturamento + conversão), revisão urgente de criativos, público e checkout`
    }

  } else {
    // ── Local business patterns ────────────────────────────────────────────────

    // CTR ok but leads not arriving → landing page / form issue
    if (isRuim('LEADS') && notRuim('CTR')) {
      return `   ↳ ${label('LEADS')} — CTR ok mas leads não chegando, formulário ou landing page com problema, revisar CTA e fluxo de conversão`
    }

    // Both CTR and leads down → creative/audience problem
    if (isRuim('LEADS') && isRuim('CTR')) {
      return `   ↳ ${label('LEADS')} | ${label('CTR')} — poucos cliques e leads, criativos desgastados, testar novas peças e segmentação de público`
    }

    // Leads arriving but CPL too high → audience too broad or high bids
    if (isRuim('CPL') && notRuim('LEADS')) {
      return `   ↳ ${label('CPL')} — leads chegando mas CPL acima do esperado, segmentação muito ampla ou lances altos, apertar o público`
    }

    // Clicks happening but no WhatsApp messages → CTA / button issue
    if (isRuim('MENSAGENS') && notRuim('CTR')) {
      return `   ↳ ${label('MENSAGENS')} — cliques acontecendo mas sem mensagens, verificar botão de WhatsApp e CTA nos anúncios`
    }

    // Leads ok but no appointments → follow-up gap
    if (isRuim('AGENDAMENTOS') && notRuim('LEADS')) {
      return `   ↳ ${label('AGENDAMENTOS')} — leads entrando mas sem agendamentos, gap no follow-up ou processo de atendimento travado`
    }
  }

  // ── Trend-driven REGULAR: month on track but recent decline ──────────────────
  // When no metric is RUIM and the REGULAR status was triggered purely by recent trend
  if (ruimSet.size === 0) {
    const trendDriven = scores
      .filter(s => s.status === 'REGULAR')
      .find(s => {
        const trend = toNum(s.trendPct)
        const pct   = toNum(s.achievementPct)
        return Math.abs(trend) >= 20 && pct >= 80
      })
    if (trendDriven) {
      const trend = Math.round(toNum(trendDriven.trendPct))
      const dir   = trend < 0 ? `queda de ${Math.abs(trend)}%` : `alta de ${Math.abs(trend)}%`
      return `   ↳ ${label(trendDriven.metric)} — ritmo do mês ainda ok, mas ${dir} nos últimos 7 dias, monitorar de perto`
    }
  }

  // ── Fallback: worst metric with historical context ─────────────────────────
  const ruimScores = scores.filter(s => s.status === 'RUIM')
  const worstScore = ruimScores.length > 0
    ? ruimScores.sort((a, b) => toNum(a.achievementPct) - toNum(b.achievementPct))[0]
    : scores.filter(s => s.status === 'REGULAR').sort((a, b) => toNum(a.achievementPct) - toNum(b.achievementPct))[0]

  if (!worstScore) return null

  const ctx        = METRIC_FALLBACK[worstScore.metric]
  const currentPct = toNum(worstScore.achievementPct)
  const histAvg    = getHistAvgFn(clientId, worstScore.metric)
  const metricLabel = label(worstScore.metric)

  if (ctx && histAvg !== null && histAvg > 10) {
    const drop = Math.round(((histAvg - currentPct) / histAvg) * 100)
    if (drop >= 15) {
      return `   ↳ ${metricLabel} — ${ctx.histDrop} (queda de ${drop}% vs. média histórica), ${ctx.action}`
    }
  }

  if (ctx) {
    return `   ↳ ${metricLabel} — ${ctx.action}`
  }

  return `   ↳ ${metricLabel}`
}

export async function sendDailyDigest(): Promise<{ sent: number; skipped: boolean }> {
  const instanceId   = process.env.ZAPI_INSTANCE_ID
  const token        = process.env.ZAPI_TOKEN
  const hasRecipient = process.env.WHATSAPP_GROUP_ID || process.env.WHATSAPP_NOTIFY_NUMBERS
  if (!instanceId || !token || !hasRecipient) {
    const missing = [
      !instanceId   && 'ZAPI_INSTANCE_ID',
      !token        && 'ZAPI_TOKEN',
      !hasRecipient && 'WHATSAPP_GROUP_ID (or WHATSAPP_NOTIFY_NUMBERS)',
    ].filter(Boolean).join(', ')
    console.warn(`[daily-digest] Skipped — missing env vars: ${missing}`)
    return { sent: 0, skipped: true }
  }

  const now          = new Date()
  const { start: weekStart }  = getWeekRange()
  const { start: monthStart, end: monthEnd } = getMonthRange()
  const fetchFrom    = monthStart < weekStart ? monthStart : weekStart
  const yesterday    = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  const sixWeeksAgo  = new Date(now.getTime() - 42 * 86_400_000)

  // ── Fetch clients ────────────────────────────────────────────────────────────
  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id:           true,
      name:         true,
      businessType: true,
      healthScores: {
        where:   { periodStart: { gte: fetchFrom } },
        orderBy: { calculatedAt: 'desc' },
        select: {
          status: true, period: true, periodStart: true,
          metric: true, achievementPct: true, actualValue: true, targetValue: true,
          trendPct: true,
        },
      },
      assignments: {
        where: { isPrimary: true },
        select: { user: { select: { id: true, name: true } } },
        take: 1,
      },
      statusStreak: { select: { status: true, days: true } },
    },
    orderBy: { name: 'asc' },
  })

  // ── Números canônicos: realizado MTD (fonte única) + meta mensal (Goal) ──────
  // STATUS continua vindo do HealthScore; só os NÚMEROS exibidos passam por aqui,
  // para não divergir de /agency/metas e Client 360. SEM N+1: uma query de
  // snapshots por MÉTRICA distinta (getRealizadoBatch), não por cliente; e uma
  // única query de metas mensais para todos os clientes.
  const clientsForBatch = clients.map((c) => ({
    id:           c.id,
    businessType: (c.businessType ?? 'ECOMMERCE') as BusinessType,
  }))
  const distinctMetrics = new Set<string>()
  for (const c of clients) for (const s of c.healthScores) distinctMetrics.add(s.metric)

  const realizadoByMetric = new Map<string, Map<string, Realizado>>()
  for (const metric of distinctMetrics) {
    realizadoByMetric.set(
      metric,
      await getRealizadoBatch(clientsForBatch, metric as MetricType, 'MTD'),
    )
  }

  const monthlyGoals = await prisma.goal.findMany({
    where: {
      clientId:  { in: clients.map((c) => c.id) },
      period:    'MONTHLY',
      startDate: { lte: monthEnd },
      endDate:   { gte: monthStart },
    },
    select: { clientId: true, metric: true, targetValue: true },
  })
  const goalLookup = new Map<string, number>()
  for (const g of monthlyGoals) goalLookup.set(`${g.clientId}:${g.metric}`, Number(g.targetValue))

  const digestNow    = new Date()
  const daysElapsed  = digestNow.getDate()
  const daysInMonth  = new Date(digestNow.getFullYear(), digestNow.getMonth() + 1, 0).getDate()
  const metricNumbers: MetricNumbers = { realizadoByMetric, goalLookup, daysElapsed, daysInMonth }

  // ── Historical HealthScores (last 6 weeks, WEEKLY) for context ───────────────
  const historicalRaw = await prisma.healthScore.findMany({
    where: {
      period:      'WEEKLY',
      periodStart: { gte: sixWeeksAgo, lt: weekStart },
    },
    select: { clientId: true, metric: true, achievementPct: true },
  })

  // clientId → metric → achievementPct[]
  const histMap = new Map<string, Map<string, number[]>>()
  for (const h of historicalRaw) {
    if (!histMap.has(h.clientId)) histMap.set(h.clientId, new Map())
    const m = histMap.get(h.clientId)!
    if (!m.has(h.metric)) m.set(h.metric, [])
    m.get(h.metric)!.push(toNum(h.achievementPct))
  }

  function getHistAvg(clientId: string, metric: string): number | null {
    const vals = histMap.get(clientId)?.get(metric)
    if (!vals || vals.length < 2) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }

  // ── Funnel rates for ECOMMERCE clients (current month, GA4) ─────────────────
  const ecommerceClientIds = clients
    .filter((c) => (c.businessType ?? 'ECOMMERCE') === 'ECOMMERCE')
    .map((c) => c.id)

  const funnelSnaps = ecommerceClientIds.length > 0
    ? await prisma.metricSnapshot.findMany({
        where: {
          clientId: { in: ecommerceClientIds },
          date:     { gte: monthStart },
          platformAccount: { platform: 'GA4' },
        },
        select: { clientId: true, clicks: true, addToCarts: true, checkoutsStarted: true, conversions: true },
      })
    : []

  // clientId → funnel rates (only when GA4 is tracking add_to_cart events)
  const funnelMap = new Map<string, FunnelRates>()
  for (const cid of ecommerceClientIds) {
    const snaps = funnelSnaps.filter((s) => s.clientId === cid)
    const sessions         = snaps.reduce((s, x) => s + (x.clicks           ?? 0), 0)
    const addToCarts       = snaps.reduce((s, x) => s + (x.addToCarts       ?? 0), 0)
    const checkoutsStarted = snaps.reduce((s, x) => s + (x.checkoutsStarted ?? 0), 0)
    const purchases        = snaps.reduce((s, x) => s + (x.conversions      ?? 0), 0)
    // Require addToCarts > 0 — old snapshots have null/0 for funnel fields
    // and a 0% visit-to-cart rate would generate false "site confuso" insights
    if (addToCarts > 0) {
      funnelMap.set(cid, {
        visitToCart:        sessions         > 0 ? (addToCarts       / sessions)         * 100 : null,
        cartToCheckout:     addToCarts       > 0 ? (checkoutsStarted / addToCarts)       * 100 : null,
        checkoutToPurchase: checkoutsStarted > 0 ? (purchases        / checkoutsStarted) * 100 : null,
      })
    }
  }

  // ── Critical alerts (last 24h) ───────────────────────────────────────────────
  const criticalAlerts = await prisma.alert.findMany({
    where: {
      type:      { in: ['STATUS_DROPPED_TO_RUIM', 'BUDGET_EXHAUSTED', 'SYNC_FAILED'] },
      read:      false,
      createdAt: { gte: yesterday },
    },
    select: { title: true },
    take: 10,
  })

  // ── Build client rows ────────────────────────────────────────────────────────
  let otimo = 0, regular = 0, ruim = 0, semDados = 0

  type ClientRow = {
    id:           string
    name:         string
    businessType: string
    status:       string | null
    managerName:  string
    managerId:    string
    streakDays:   number
    activeScores: HealthScoreRow[]
  }

  const rows: ClientRow[] = clients.map((c) => {
    const weeklyScores  = c.healthScores.filter((s) => s.period === 'WEEKLY'  && s.periodStart >= weekStart)
    const monthlyScores = c.healthScores.filter((s) => s.period === 'MONTHLY' && s.periodStart >= monthStart)
    const scores = weeklyScores.length > 0 ? weeklyScores : monthlyScores

    const status: string | null =
      scores.length === 0  ? null :
      scores.some((s) => s.status === 'RUIM')    ? 'RUIM'    :
      scores.some((s) => s.status === 'REGULAR') ? 'REGULAR' : 'OTIMO'

    if (status === 'OTIMO')        otimo++
    else if (status === 'REGULAR') regular++
    else if (status === 'RUIM')    ruim++
    else                           semDados++

    const assignment = c.assignments[0]?.user
    return {
      id:           c.id,
      name:         c.name,
      businessType: c.businessType ?? 'ECOMMERCE',
      status,
      managerName:  assignment?.name ?? 'Sem Gestor',
      managerId:    assignment?.id   ?? '__none__',
      streakDays:   c.statusStreak?.days ?? 1,
      activeScores: scores as HealthScoreRow[],
    }
  })

  // ── Group by manager ─────────────────────────────────────────────────────────
  const managerOrder: string[] = []
  const byManager = new Map<string, { name: string; clients: ClientRow[] }>()

  for (const row of rows) {
    if (!byManager.has(row.managerId)) {
      managerOrder.push(row.managerId)
      byManager.set(row.managerId, { name: row.managerName, clients: [] })
    }
    byManager.get(row.managerId)!.clients.push(row)
  }

  // Sort each manager's clients: RUIM → REGULAR → OTIMO (worst streak first within status)
  for (const entry of byManager.values()) {
    entry.clients.sort((a, b) => {
      const d = statusOrder(a.status) - statusOrder(b.status)
      return d !== 0 ? d : b.streakDays - a.streakDays
    })
  }

  // Sort managers: most RUIM clients first, then total streak weight
  managerOrder.sort((a, b) => {
    const aC = byManager.get(a)!.clients
    const bC = byManager.get(b)!.clients
    const aR = aC.filter((c) => c.status === 'RUIM').length
    const bR = bC.filter((c) => c.status === 'RUIM').length
    if (aR !== bR) return bR - aR
    const aD = aC.filter((c) => c.status === 'RUIM').reduce((s, c) => s + c.streakDays, 0)
    const bD = bC.filter((c) => c.status === 'RUIM').reduce((s, c) => s + c.streakDays, 0)
    return bD - aD
  })

  // ── Send messages ────────────────────────────────────────────────────────────
  let totalSent = 0

  // Message 1: Summary header
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
  const summaryLines = [
    `*📊 Performli — Resumo Diário*`,
    `_${dateStr}_`,
    ``,
    `*Saúde Geral da Agência*`,
    `✅ Ótimo: *${otimo}*  ⚠️ Regular: *${regular}*  🔴 Ruim: *${ruim}*  ⚪ Sem dados: *${semDados}*`,
    `Total: *${clients.length}* clientes ativos`,
    ``,
    `_A seguir, detalhes por gestor — do mais crítico ao melhor._`,
  ]
  totalSent += await broadcastWhatsApp(summaryLines.join('\n'), true)
  await sleep(1500)

  // Messages 2..N: one per manager block
  for (const managerId of managerOrder) {
    const { name, clients: mClients } = byManager.get(managerId)!
    const mRuim    = mClients.filter((c) => c.status === 'RUIM').length
    const mRegular = mClients.filter((c) => c.status === 'REGULAR').length
    const mOtimo   = mClients.filter((c) => c.status === 'OTIMO').length

    const lines: string[] = []
    lines.push(`*👤 ${name}* — ${mClients.length} cliente${mClients.length !== 1 ? 's' : ''}  (✅${mOtimo} ⚠️${mRegular} 🔴${mRuim})`)
    lines.push('')

    for (const c of mClients) {
      let line = `${emoji(c.status)} *${c.name}*`
      if (c.status === 'RUIM' || c.status === 'REGULAR') {
        line += ` — _${streakLabel(c.status, c.streakDays)}_`
      } else if (c.status === 'OTIMO' && c.streakDays >= 5) {
        line += ` — _${streakLabel(c.status, c.streakDays)}_`
      }
      lines.push(line)

      // Smart cross-metric insight for RUIM clients, and REGULAR clients with trend signal
      if (c.activeScores.length > 0 && (c.status === 'RUIM' || (
        c.status === 'REGULAR' && c.activeScores.some(s => Math.abs(toNum(s.trendPct)) >= 20)
      ))) {
        const insight = buildSmartInsight(c.id, c.activeScores, c.businessType, getHistAvg, metricNumbers, funnelMap.get(c.id) ?? null)
        if (insight) lines.push(insight)
      }
    }

    totalSent += await broadcastWhatsApp(lines.join('\n'), false)
    await sleep(1500)
  }

  // Last message: attention section + alerts (only if relevant)
  const atencao = rows
    .filter((c) => (c.status === 'RUIM' && c.streakDays >= 5) || (c.status === 'REGULAR' && c.streakDays >= 7))
    .sort((a, b) => {
      const d = statusOrder(a.status) - statusOrder(b.status)
      return d !== 0 ? d : b.streakDays - a.streakDays
    })

  const hasExtra = atencao.length > 0 || criticalAlerts.length > 0

  if (hasExtra) {
    const extraLines: string[] = []

    if (atencao.length > 0) {
      extraLines.push(`*⚠️ Atenção — Contas travadas há mais de 5 dias*`)
      for (const c of atencao) {
        extraLines.push(`${emoji(c.status)} *${c.name}* — *${streakLabel(c.status, c.streakDays)}* — gestor ${c.managerName}`)
        if (c.activeScores.length > 0 && (c.status === 'RUIM' || (
          c.status === 'REGULAR' && c.activeScores.some(s => Math.abs(toNum(s.trendPct)) >= 20)
        ))) {
          const insight = buildSmartInsight(c.id, c.activeScores, c.businessType, getHistAvg, metricNumbers, funnelMap.get(c.id) ?? null)
          if (insight) extraLines.push(insight)
        }
      }
    }

    if (criticalAlerts.length > 0) {
      if (extraLines.length > 0) extraLines.push('')
      extraLines.push(`*🚨 Alertas Críticos (últimas 24h)*`)
      for (const a of criticalAlerts) {
        extraLines.push(`• ${a.title}`)
      }
    }

    extraLines.push('')
    extraLines.push(`_Acesse o painel para mais detalhes._`)
    totalSent += await broadcastWhatsApp(extraLines.join('\n'), false)
  }

  return { sent: totalSent, skipped: false }
}
