import 'server-only'
import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { saoPauloDateString } from '@/lib/utils'
import { aggregateSnapshots, type AggregatableSnapshot } from '@/services/health-scorer'
import { KPI_REGISTRY } from './kpi-registry'
import type { MetricType, BusinessType } from '@prisma/client'

/**
 * Camada de dados do dashboard do portal do cliente.
 *
 * Reusa `aggregateSnapshots` (health-scorer) como ÚNICA fonte de cálculo — o
 * portal mostra exatamente os mesmos números das telas internas (metas/saúde).
 *
 * Fuso: MetricSnapshot.date é `@db.Date` gravado à meia-noite UTC do dia-parede
 * (os writers usam `...T00:00:00Z`). Por isso o bucketing/comparação de datas é
 * feito em UTC (função `utcDateString`), enquanto os ÂNCORAS de janela (hoje,
 * início/fim) derivam do dia-parede SP via `saoPauloDateString`. Aplicar
 * `saoPauloDateString` direto sobre um valor `@db.Date` (00:00Z) deslocaria o
 * dia em -1, então o formato de saída da série usa o próprio dia-parede da
 * janela (que já é 'YYYY-MM-DD' SP).
 */
export type PortalPeriod = '7d' | '14d' | '30d' | 'mes_atual' | 'mes_anterior'

export type KpiPoint = { date: string; value: number | null }

export type KpiData = {
  metric: string
  value: number | null
  previousValue: number | null
  delta: number | null
  deltaPct: number | null
  series: KpiPoint[]
}

/**
 * Snapshot do portal: `AggregatableSnapshot` (fonte única de cálculo) + os
 * campos crus GA4 que NÃO são MetricType e o portal soma à parte
 * (`newUsers`, `addToCarts`, `checkoutsStarted`) + `date` para o bucketing.
 * `conversions`/`clicks` já vêm de `AggregatableSnapshot`.
 */
type PortalSnapshot = AggregatableSnapshot & {
  date: Date
  newUsers: number | null
  addToCarts: number | null
  checkoutsStarted: number | null
}

/** Uma etapa do funil de vendas (valor absoluto no período). */
export type FunnelStage = { key: string; label: string; value: number }

/**
 * Funil de vendas do período: 4 etapas GA4 + taxas de conversão etapa→etapa e
 * taxa geral. Todas as taxas em PERCENTUAL (0–100); divisão por zero → 0.
 */
export type PortalFunnel = {
  stages: FunnelStage[]
  /** carrinho ÷ sessões (%). */
  cartRate: number
  /** checkout ÷ carrinho (%). */
  checkoutRate: number
  /** compras ÷ checkout (%). */
  purchaseRate: number
  /** compras ÷ sessões (%) — conversão geral do funil. */
  overallRate: number
}

/**
 * Projeção do faturamento do MÊS CORRENTE (parede SP) por run-rate. Card
 * informativo — INDEPENDE do seletor de período (é sempre o mês em andamento).
 */
export type PortalProjection = {
  /** Projeção de fechamento do mês (null se não há realizado/dia decorrido). */
  value: number | null
  /** Faturamento acumulado do mês até hoje (dia-parede SP). */
  accumulated: number | null
  /** Dias decorridos no mês (inclui hoje). */
  daysElapsed: number
  /** Total de dias do mês corrente. */
  daysInMonth: number
  /** Mês de referência 'YYYY-MM' (parede SP). */
  month: string
}

const VALID_PERIODS: readonly PortalPeriod[] = ['7d', '14d', '30d', 'mes_atual', 'mes_anterior']

/** Whitelist manual (zod não está no repo). Default '30d'. */
export function normalizePeriod(raw: string | undefined): PortalPeriod {
  if (raw && (VALID_PERIODS as readonly string[]).includes(raw)) {
    return raw as PortalPeriod
  }
  return '30d'
}

// ── Helpers de data (UTC, alinhados ao armazenamento @db.Date) ────────────────

/** 'YYYY-MM-DD' em UTC de um instante (dia-parede dos snapshots @db.Date). */
function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Instante UTC 00:00 de um dia 'YYYY-MM-DD'. */
function utcDayStart(dayStr: string): Date {
  return new Date(`${dayStr}T00:00:00.000Z`)
}

/** Soma `n` dias a um 'YYYY-MM-DD' (aritmética UTC). */
function addDays(dayStr: string, n: number): string {
  const d = utcDayStart(dayStr)
  d.setUTCDate(d.getUTCDate() + n)
  return utcDateString(d)
}

/** Lista de dias 'YYYY-MM-DD' de start..end (inclusive). */
function dayRange(start: string, end: string): string[] {
  const out: string[] = []
  let cur = start
  // Guard de segurança contra loop infinito (períodos são pequenos).
  for (let i = 0; i < 400 && cur <= end; i++) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

type Window = { start: string; end: string; prevStart: string; prevEnd: string }

/**
 * Resolve as janelas atual e anterior (dia-parede SP) para o período.
 * - 7d/14d/30d: últimos N dias terminando ONTEM (dia fechado).
 * - mes_atual: dia 1 do mês SP até hoje.
 * - mes_anterior: mês fechado anterior.
 * Período anterior comparável = janela imediatamente anterior de mesma duração.
 */
function resolveWindows(period: PortalPeriod, now: Date = new Date()): Window {
  const today = saoPauloDateString(now)

  let start: string
  let end: string

  if (period === 'mes_atual') {
    start = `${today.slice(0, 7)}-01`
    end = today
  } else if (period === 'mes_anterior') {
    const firstOfThisMonth = `${today.slice(0, 7)}-01`
    end = addDays(firstOfThisMonth, -1) // último dia do mês anterior
    start = `${end.slice(0, 7)}-01`
  } else {
    const n = period === '7d' ? 7 : period === '14d' ? 14 : 30
    end = addDays(today, -1) // ontem (dia fechado)
    start = addDays(end, -(n - 1))
  }

  // Janela anterior: mesma duração, imediatamente antes de `start`.
  const durationDays = dayRange(start, end).length
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(prevEnd, -(durationDays - 1))

  return { start, end, prevStart, prevEnd }
}

// ── Cálculo ───────────────────────────────────────────────────────────────────

/**
 * Soma de um campo cru GA4 (`clicks`=sessões, `newUsers`=clientes novos, etc.)
 * dos snapshots de plataforma GA4. Retorna null quando não há snapshot GA4 ou o
 * total é 0 (sem dado no período), coerente com `aggregateSnapshots`.
 */
function sumGa4Field(
  snaps: PortalSnapshot[],
  field: 'clicks' | 'newUsers' | 'addToCarts' | 'checkoutsStarted' | 'conversions',
): number | null {
  const ga4 = snaps.filter((s) => s.platformAccount.platform === 'GA4')
  if (ga4.length === 0) return null
  const total = ga4.reduce((acc, s) => {
    const v = s[field]
    return acc + (v != null ? Number(v) : 0)
  }, 0)
  return total > 0 ? total : null
}

/**
 * Valor de um KPI para um conjunto de snapshots. Roteia à parte os casos que
 * NÃO são MetricType do Prisma (somas de campos crus GA4); o resto vai à fonte
 * única `aggregateSnapshots`.
 */
function computeValue(
  metric: string,
  snaps: PortalSnapshot[],
  businessType: BusinessType,
): number | null {
  if (metric === 'SESSOES') return sumGa4Field(snaps, 'clicks')
  if (metric === 'NEW_USERS') return sumGa4Field(snaps, 'newUsers')
  return aggregateSnapshots(snaps, metric as MetricType, businessType)
}

/** Divisão em % protegida contra zero/NaN/Infinity (numerador,denominador). */
function safePct(num: number | null, den: number | null): number {
  const n = Number(num ?? 0)
  const d = Number(den ?? 0)
  if (!(d > 0) || !Number.isFinite(n)) return 0
  const pct = (n / d) * 100
  return Number.isFinite(pct) ? pct : 0
}

async function loadKpis(clientId: string, period: PortalPeriod): Promise<Array<[string, KpiData]>> {
  const win = resolveWindows(period)

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { businessType: true },
  })
  const businessType: BusinessType = client?.businessType ?? 'ECOMMERCE'

  // UMA query cobrindo AMBAS as janelas (anterior + atual).
  const rows = await prisma.metricSnapshot.findMany({
    where: {
      clientId,
      date: { gte: utcDayStart(win.prevStart), lte: utcDayStart(win.end) },
    },
    include: { platformAccount: { select: { platform: true } } },
  })
  const snaps = rows as unknown as PortalSnapshot[]

  // Particiona em memória: por janela e por dia (bucket = dia-parede UTC).
  const current: PortalSnapshot[] = []
  const previous: PortalSnapshot[] = []
  const byDay = new Map<string, PortalSnapshot[]>()

  for (const s of snaps) {
    const day = utcDateString(s.date)
    if (day >= win.start && day <= win.end) {
      current.push(s)
      const arr = byDay.get(day) ?? []
      arr.push(s)
      byDay.set(day, arr)
    } else if (day >= win.prevStart && day <= win.prevEnd) {
      previous.push(s)
    }
  }

  const currentDays = dayRange(win.start, win.end)

  // KPIs standalone (ex.: projeção do mês) NÃO seguem o período nem geram série
  // — são servidos por função dedicada. Aqui só entram os KPIs de série.
  const entries: Array<[string, KpiData]> = KPI_REGISTRY.filter((d) => !d.standalone).map((def) => {
    const value = computeValue(def.metric, current, businessType)
    const previousValue = computeValue(def.metric, previous, businessType)

    const delta = value != null && previousValue != null ? value - previousValue : null
    const deltaPct =
      value != null && previousValue != null && previousValue !== 0
        ? ((value - previousValue) / Math.abs(previousValue)) * 100
        : null

    const series: KpiPoint[] = currentDays.map((day) => ({
      date: day,
      value: computeValue(def.metric, byDay.get(day) ?? [], businessType),
    }))

    return [def.key, { metric: def.metric, value, previousValue, delta, deltaPct, series }]
  })

  return entries
}

/**
 * KPIs do portal para (cliente, período). Envolto em `unstable_cache`
 * (revalidate 900s ≈ TTL folgado sobre o sync diário). Retorna um
 * Map<key, KpiData> — o cache guarda entries serializáveis e o Map é
 * reconstruído na saída.
 */
export async function getPortalKpis(
  clientId: string,
  period: PortalPeriod,
): Promise<Map<string, KpiData>> {
  const cached = unstable_cache(
    () => loadKpis(clientId, period),
    ['portal-kpis', clientId, period],
    { revalidate: 900, tags: [`portal-kpis:${clientId}`] },
  )
  const entries = await cached()
  return new Map(entries)
}

// ── Funil de vendas ─────────────────────────────────────────────────────────

async function loadFunnel(clientId: string, period: PortalPeriod): Promise<PortalFunnel> {
  const win = resolveWindows(period)

  // UMA query, filtrando clientId (defesa em profundidade), só da janela ATUAL
  // (o funil não compara com período anterior). Só GA4 tem as etapas.
  const rows = await prisma.metricSnapshot.findMany({
    where: {
      clientId,
      date: { gte: utcDayStart(win.start), lte: utcDayStart(win.end) },
      platformAccount: { platform: 'GA4' },
    },
    select: { clicks: true, addToCarts: true, checkoutsStarted: true, conversions: true },
  })

  let sessoes = 0
  let carrinho = 0
  let checkout = 0
  let compras = 0
  for (const r of rows) {
    sessoes += r.clicks != null ? Number(r.clicks) : 0
    carrinho += r.addToCarts != null ? Number(r.addToCarts) : 0
    checkout += r.checkoutsStarted != null ? Number(r.checkoutsStarted) : 0
    compras += r.conversions != null ? Number(r.conversions) : 0
  }

  const stages: FunnelStage[] = [
    { key: 'sessoes', label: 'Visitas', value: sessoes },
    { key: 'carrinho', label: 'Adicionaram ao carrinho', value: carrinho },
    { key: 'checkout', label: 'Iniciaram o checkout', value: checkout },
    { key: 'compras', label: 'Compraram', value: compras },
  ]

  return {
    stages,
    cartRate: safePct(carrinho, sessoes),
    checkoutRate: safePct(checkout, carrinho),
    purchaseRate: safePct(compras, checkout),
    overallRate: safePct(compras, sessoes),
  }
}

/**
 * Funil de vendas do portal (cliente, período). Cache próprio com clientId +
 * period na chave e MESMO TTL/tag dos KPIs (revalidate 900s).
 */
export async function getPortalFunnel(
  clientId: string,
  period: PortalPeriod,
): Promise<PortalFunnel> {
  const cached = unstable_cache(
    () => loadFunnel(clientId, period),
    ['portal-funnel', clientId, period],
    { revalidate: 900, tags: [`portal-kpis:${clientId}`] },
  )
  return cached()
}

// ── Projeção do mês (run-rate) ──────────────────────────────────────────────

async function loadProjection(clientId: string): Promise<PortalProjection> {
  const today = saoPauloDateString() // 'YYYY-MM-DD' parede SP
  const month = today.slice(0, 7)
  const monthStart = `${month}-01`
  const daysElapsed = Number(today.slice(8, 10)) // dia do mês (inclui hoje)
  const year = Number(month.slice(0, 4))
  const monthNum = Number(month.slice(5, 7)) // 1-based
  const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate()

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { businessType: true },
  })
  const businessType: BusinessType = client?.businessType ?? 'ECOMMERCE'

  // Faturamento acumulado do mês corrente até hoje. Query filtra clientId; a
  // janela usa utcDayStart (mesma convenção @db.Date do restante do módulo).
  const rows = await prisma.metricSnapshot.findMany({
    where: {
      clientId,
      date: { gte: utcDayStart(monthStart), lte: utcDayStart(today) },
    },
    include: { platformAccount: { select: { platform: true } } },
  })
  const snaps = rows as unknown as PortalSnapshot[]

  const accumulated = aggregateSnapshots(snaps, 'FATURAMENTO', businessType)

  // Run-rate simples: acumulado ÷ dias decorridos × dias do mês. NÃO reusa
  // `projetarAlvo` (@/lib/metas/projection): aquele é crescimento MoM (+15%
  // e-commerce) do fechamento do mês ANTERIOR, não a projeção intra-mês do
  // ritmo atual pedida aqui. Guarda contra divisão por zero (dia 1 antes do
  // primeiro sync → daysElapsed>0 sempre, mas defensivo).
  const value =
    accumulated != null && daysElapsed > 0
      ? Math.round((accumulated / daysElapsed) * daysInMonth * 100) / 100
      : null

  return { value, accumulated, daysElapsed, daysInMonth, month }
}

/**
 * Projeção do faturamento do mês corrente (run-rate). Independe do período do
 * dashboard — chave de cache só com clientId. TTL/tag iguais aos KPIs.
 */
export async function getPortalProjection(clientId: string): Promise<PortalProjection> {
  const cached = unstable_cache(
    () => loadProjection(clientId),
    ['portal-projection', clientId],
    { revalidate: 900, tags: [`portal-kpis:${clientId}`] },
  )
  return cached()
}
