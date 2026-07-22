/**
 * Oscillation Detector
 *
 * Compara os DOIS ÚLTIMOS DIAS COMPLETOS (ontem vs anteontem, dia-parede SP)
 * por cliente. Variação > 20% num KPI gera KPI_DROP_24H ou KPI_SPIKE_24H.
 *
 * Reescrito no caso "DonnaSo 2026-07-22" (conversões -80%, faturamento -62% e
 * ROAS +318% ao mesmo tempo). Os três defeitos corrigidos:
 *   1. Comparava HOJE (dia PARCIAL — o cron roda 08:00) contra ontem completo
 *      → quedas falsas todo dia de manhã. Agora: ontem × anteontem, ambos
 *      completos, ancorados no dia-parede SP (spDayInfo → 00:00Z p/ @db.Date).
 *   2. Cada KPI tinha agregação própria e inconsistente (FATURAMENTO preferia
 *      GA4, ROAS misturava tudo) → contradições. Agora: TODOS os KPIs saem de
 *      aggregateSnapshots (fonte canônica, regra 0), com precedência GA4SYNC>
 *      GA4 por dia e roteamento por businessType.
 *   3. Monitorava ROAS/afins em negócio local (pastelaria com alerta de ROAS).
 *      Agora o conjunto de KPIs monitorados é por tipo de negócio.
 *
 * "Lower is better" (CPL, CPA): caiu → melhora (SPIKE); subiu → piora (DROP).
 */

import { prisma } from '@/lib/prisma'
import { metricLabels } from '@/lib/dal'
import { aggregateSnapshots, type AggregatableSnapshot } from '@/services/health-scorer'
import { spDayInfo } from '@/lib/metas/pace'
import type { BusinessType, MetricType } from '@prisma/client'

/** KPIs monitorados por tipo de negócio (linguagem da operação de cada um). */
const ECOM_KPIS: MetricType[] = ['FATURAMENTO', 'ROAS', 'CONVERSIONS']
const LOCAL_KPIS: MetricType[] = ['LEADS', 'MENSAGENS', 'CONVERSIONS', 'CPL', 'CPA']

/** Metrics where a lower value is better */
const LOWER_IS_BETTER: Set<string> = new Set(['CPL', 'CPA'])

/** Minimum % change to trigger an alert */
const THRESHOLD_PCT = 20

function kpisFor(businessType: BusinessType): MetricType[] {
  return businessType === 'LOCAL' || businessType === 'B2B' ? LOCAL_KPIS : ECOM_KPIS
}

function formatValue(kpi: MetricType, value: number): string {
  if (kpi === 'ROAS') return `${value.toFixed(2)}x`
  if (kpi === 'CPL' || kpi === 'CPA') return `R$ ${value.toFixed(2)}`
  if (kpi === 'FATURAMENTO')
    return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return value.toLocaleString('pt-BR')
}

export type OscillationResult = {
  clientId: string
  alertsCreated: number
}

/**
 * Detecção para um cliente: ontem (D-1) × anteontem (D-2), dias-parede SP
 * completos. Alerta em variação > 20%.
 */
export async function detectOscillationsForClient(clientId: string): Promise<number> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { businessType: true },
  })
  if (!client) return 0

  // Janelas em UTC-midnight sobre MetricSnapshot.date (@db.Date), ancoradas no
  // dia-parede SP de hoje — NUNCA setHours local do servidor.
  const dayMs = 86_400_000
  const s0 = spDayInfo(new Date()).spDayStartUtc.getTime() // 00:00Z do dia SP de hoje
  const d1 = new Date(s0 - 1 * dayMs) // ontem (completo)
  const d2 = new Date(s0 - 2 * dayMs) // anteontem (completo)

  const include = { platformAccount: { select: { platform: true } } } as const
  const [d1Snaps, d2Snaps] = await Promise.all([
    prisma.metricSnapshot.findMany({ where: { clientId, date: d1 }, include }),
    prisma.metricSnapshot.findMany({ where: { clientId, date: d2 }, include }),
  ])

  if (d1Snaps.length === 0 || d2Snaps.length === 0) return 0

  let alertsCreated = 0

  for (const kpi of kpisFor(client.businessType)) {
    // Fonte canônica única para os dois lados da comparação (regra 0).
    const todayVal = aggregateSnapshots(d1Snaps as AggregatableSnapshot[], kpi, client.businessType)
    const yesterdayVal = aggregateSnapshots(d2Snaps as AggregatableSnapshot[], kpi, client.businessType)

    if (todayVal === null || yesterdayVal === null || yesterdayVal === 0) continue

    const changePct = ((todayVal - yesterdayVal) / Math.abs(yesterdayVal)) * 100
    const absChangePct = Math.abs(changePct)

    if (absChangePct < THRESHOLD_PCT) continue

    const lowerIsBetter = LOWER_IS_BETTER.has(kpi)
    const isImprovement = lowerIsBetter ? changePct < 0 : changePct > 0

    const alertType = isImprovement ? ('KPI_SPIKE_24H' as const) : ('KPI_DROP_24H' as const)
    const label = metricLabels[kpi] ?? kpi
    const roundedPct = Math.abs(Math.round(changePct))
    const fromFmt = formatValue(kpi, yesterdayVal)
    const toFmt = formatValue(kpi, todayVal)

    const title = isImprovement
      ? `${label} subiu ${roundedPct}% ontem`
      : `${label} caiu ${roundedPct}% ontem`

    const body = isImprovement
      ? `${label} passou de ${fromFmt} (anteontem) para ${toFmt} (ontem). Excelente evolução!`
      : `${label} passou de ${fromFmt} (anteontem) para ${toFmt} (ontem). Verifique a campanha.`

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
