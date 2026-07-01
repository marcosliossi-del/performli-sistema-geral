/**
 * Oscillation Detector
 *
 * Compares MetricSnapshots for today vs yesterday per client.
 * When a KPI changes by more than 20%, creates a KPI_DROP_24H or KPI_SPIKE_24H alert.
 *
 * "Lower is better" metrics (CPL, CPA):
 *   - Value went DOWN  → improvement → KPI_SPIKE_24H
 *   - Value went UP    → worsening   → KPI_DROP_24H
 */

import { prisma } from '@/lib/prisma'
import { metricLabels } from '@/lib/dal'

/** KPIs to monitor for oscillation */
const MONITORED_KPIS = ['ROAS', 'FATURAMENTO', 'CPL', 'CPA', 'CONVERSIONS', 'LEADS'] as const
type MonitoredKPI = (typeof MONITORED_KPIS)[number]

/** Metrics where a lower value is better */
const LOWER_IS_BETTER: Set<string> = new Set(['CPL', 'CPA'])

/** Minimum % change to trigger an alert */
const THRESHOLD_PCT = 20

type Snapshot = {
  spend: unknown
  roas: unknown
  cpl: unknown
  cpa: unknown
  conversions: unknown
  conversionValue: unknown
  clicks: unknown
}

/**
 * Extracts a numeric value for a given KPI from aggregated snapshots.
 * Returns null if not enough data.
 */
function extractKPIValue(snapshots: Snapshot[], kpi: MonitoredKPI): number | null {
  if (snapshots.length === 0) return null
  const toNum = (v: unknown) => (v != null ? Number(v) : 0)

  switch (kpi) {
    case 'ROAS': {
      // Weighted average: total conversionValue / total spend
      const totalSpend = snapshots.reduce((s, x) => s + toNum(x.spend), 0)
      const totalRevenue = snapshots.reduce((s, x) => s + toNum(x.conversionValue), 0)
      return totalSpend > 0 && totalRevenue > 0 ? totalRevenue / totalSpend : null
    }
    case 'FATURAMENTO': {
      // Prefer GA4 revenue (spend=0), fall back to ad platform
      const ga4Rev = snapshots
        .filter((x) => toNum(x.spend) === 0)
        .reduce((s, x) => s + toNum(x.conversionValue), 0)
      const adRev = snapshots
        .filter((x) => toNum(x.spend) > 0)
        .reduce((s, x) => s + toNum(x.conversionValue), 0)
      const total = ga4Rev > 0 ? ga4Rev : adRev
      return total > 0 ? total : null
    }
    case 'CPL': {
      const values = snapshots.map((s) => toNum(s.cpl)).filter((v) => v > 0)
      if (values.length === 0) return null
      return values.reduce((a, b) => a + b, 0) / values.length
    }
    case 'CPA': {
      const values = snapshots.map((s) => toNum(s.cpa)).filter((v) => v > 0)
      if (values.length === 0) return null
      return values.reduce((a, b) => a + b, 0) / values.length
    }
    case 'CONVERSIONS': {
      const total = snapshots.reduce((s, x) => s + toNum(x.conversions), 0)
      return total > 0 ? total : null
    }
    case 'LEADS': {
      // Leads ~ conversions from non-ecommerce context (CPL > 0)
      const total = snapshots
        .filter((x) => toNum(x.cpl) > 0)
        .reduce((s, x) => s + toNum(x.conversions), 0)
      return total > 0 ? total : null
    }
    default:
      return null
  }
}

function formatValue(kpi: MonitoredKPI, value: number): string {
  if (kpi === 'ROAS') return `${value.toFixed(2)}x`
  if (kpi === 'CPL' || kpi === 'CPA') return `R$ ${value.toFixed(2)}`
  if (kpi === 'FATURAMENTO') return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return value.toLocaleString('pt-BR')
}

export type OscillationResult = {
  clientId: string
  alertsCreated: number
}

/**
 * Runs oscillation detection for a single client.
 * Compares today's vs yesterday's KPI values and creates alerts on >20% change.
 */
export async function detectOscillationsForClient(clientId: string): Promise<number> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const [todaySnaps, yesterdaySnaps] = await Promise.all([
    prisma.metricSnapshot.findMany({
      where: { clientId, date: { gte: today, lt: tomorrow } },
    }),
    prisma.metricSnapshot.findMany({
      where: { clientId, date: { gte: yesterday, lt: today } },
    }),
  ])

  if (todaySnaps.length === 0 || yesterdaySnaps.length === 0) return 0

  let alertsCreated = 0

  for (const kpi of MONITORED_KPIS) {
    const todayVal = extractKPIValue(todaySnaps as Snapshot[], kpi)
    const yesterdayVal = extractKPIValue(yesterdaySnaps as Snapshot[], kpi)

    if (todayVal === null || yesterdayVal === null || yesterdayVal === 0) continue

    const changePct = ((todayVal - yesterdayVal) / Math.abs(yesterdayVal)) * 100
    const absChangePct = Math.abs(changePct)

    if (absChangePct < THRESHOLD_PCT) continue

    // Determine if the change is an improvement or worsening
    const lowerIsBetter = LOWER_IS_BETTER.has(kpi)
    let isImprovement: boolean

    if (lowerIsBetter) {
      // For CPL/CPA: value going down = improvement
      isImprovement = changePct < 0
    } else {
      // For ROAS/FATURAMENTO/CONVERSIONS/LEADS: value going up = improvement
      isImprovement = changePct > 0
    }

    const alertType = isImprovement ? ('KPI_SPIKE_24H' as const) : ('KPI_DROP_24H' as const)
    const label = metricLabels[kpi] ?? kpi
    const roundedPct = Math.abs(Math.round(changePct))
    const fromFmt = formatValue(kpi, yesterdayVal)
    const toFmt = formatValue(kpi, todayVal)

    const title = isImprovement
      ? `${label} subiu ${roundedPct}% nas últimas 24h`
      : `${label} caiu ${roundedPct}% nas últimas 24h`

    const body = isImprovement
      ? `${label} passou de ${fromFmt} para ${toFmt}. Excelente evolução!`
      : `${label} passou de ${fromFmt} para ${toFmt}. Verifique a campanha.`

    // Deduplicate: skip if same client + type + kpi within last 24h
    const recentAlert = await prisma.alert.findFirst({
      where: {
        clientId,
        type: alertType,
        title: { contains: label },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    })
    if (recentAlert) continue

    await prisma.alert.create({
      data: {
        clientId,
        type: alertType,
        title,
        body,
      },
    })
    alertsCreated++
  }

  return alertsCreated
}

/**
 * Runs oscillation detection for all active clients.
 */
export async function detectOscillationsForAll(): Promise<{
  clientsProcessed: number
  totalAlerts: number
  failed: number
}> {
  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  })

  let totalAlerts = 0
  let failed = 0
  // Resiliência (CLAUDE.md regra 7): isola cada cliente; falha de um não derruba a rotina.
  for (const client of clients) {
    try {
      const alerts = await detectOscillationsForClient(client.id)
      totalAlerts += alerts
    } catch (err) {
      failed++
      console.error(`[oscillation-detector] falha no cliente ${client.id}:`, err)
    }
  }

  return { clientsProcessed: clients.length, totalAlerts, failed }
}
