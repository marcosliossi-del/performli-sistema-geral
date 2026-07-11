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

/** Sessões GA4 = soma do campo `clicks` dos snapshots de plataforma GA4. */
function sumGa4Sessions(snaps: AggregatableSnapshot[]): number | null {
  const ga4 = snaps.filter((s) => s.platformAccount.platform === 'GA4')
  if (ga4.length === 0) return null
  const total = ga4.reduce((acc, s) => acc + (s.clicks != null ? Number(s.clicks) : 0), 0)
  return total > 0 ? total : null
}

/** Valor de um KPI para um conjunto de snapshots (roteia SESSOES à parte). */
function computeValue(
  metric: string,
  snaps: AggregatableSnapshot[],
  businessType: BusinessType,
): number | null {
  if (metric === 'SESSOES') return sumGa4Sessions(snaps)
  return aggregateSnapshots(snaps, metric as MetricType, businessType)
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
  const snaps = rows as unknown as Array<AggregatableSnapshot & { date: Date }>

  // Particiona em memória: por janela e por dia (bucket = dia-parede UTC).
  const current: AggregatableSnapshot[] = []
  const previous: AggregatableSnapshot[] = []
  const byDay = new Map<string, AggregatableSnapshot[]>()

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

  const entries: Array<[string, KpiData]> = KPI_REGISTRY.map((def) => {
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
