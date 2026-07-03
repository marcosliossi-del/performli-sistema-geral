'use server'

import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { saoPauloDayStart } from '@/lib/utils'
import { getRealizadoBatch, type Realizado } from '@/lib/metas/realizado'
import {
  LOCAL_RESULT_METRICS,
  LOCAL_RESULT_METRIC_SET,
  costLabelFor,
} from '@/lib/metas/metricOptions'
import type { MetricType, BusinessType } from '@prisma/client'

const pad = (n: number) => String(n).padStart(2, '0')

export type ClientProgress = {
  id: string
  name: string
  slug: string
  managerName: string
  businessType: BusinessType
  // Goals
  goalFaturamento: number | null
  goalRoas: number | null
  goalSpend: number | null
  // Meta-resultado principal do cliente local/B2B (MENSAGENS/LEADS/AGENDAMENTOS/…).
  // Campos aditivos: null para e-commerce (que segue usando faturamento/ROAS).
  localMetric: MetricType | null   // métrica-resultado principal (enum)
  localMetricLabel: string | null  // rótulo humano ("Mensagens", "Agendamentos"…)
  localGoal: number | null         // alvo mensal da métrica-resultado
  localActual: number | null       // realizado MTD (fonte canônica getRealizadoBatch)
  localPct: number | null          // localActual / localGoal * 100
  localPacedGoal: number | null    // localGoal * diasDecorridos / diasDoMês (pró-rata)
  custoMetricLabel: 'CPL' | 'CPA' | null // custo-alvo correto p/ a métrica principal
  custoAlvo: number | null         // meta de CPL/CPA
  custoRealizado: number | null    // spend ÷ realizado (custo por resultado no mês)
  periodoLabel: string             // rótulo de período da fonte única ("no mês")
  // Actuals (current month to date)
  revenue: number        // GA4 only
  spend: number          // ad platforms only
  purchases: number      // GA4 only
  sessions: number       // GA4 only
  ctr: number | null     // avg CTR from ads
  cpc: number | null     // avg CPC from ads
  roas: number | null    // revenue / spend
  ticketMedio: number | null
  taxaConversao: number | null
  // Pacing
  projection: number | null     // (revenue / daysElapsed) * totalDays
  pacedGoal: number | null      // (goalFaturamento / totalDays) * daysElapsed
  daysElapsed: number
  daysRemaining: number
  totalDays: number
  pctMonthElapsed: number
  pctGoalAchieved: number | null   // revenue / goalFaturamento * 100
  pctSpendConsumed: number | null  // spend / goalSpend * 100
  // Prev month (for comparison)
  prevRevenue: number | null
  prevTicketMedio: number | null
}

export async function fetchMonthProgress(year: number, month: number): Promise<ClientProgress[]> {
  await requireSession()

  // S2-014 (borda): fronteira INFERIOR do mês alinhada ao fuso São Paulo, igual
  // ao helper canônico realizado.ts (resolveJanela → saoPauloDayStart). `month`
  // é 0-indexado (getMonth), por isso `month + 1` no rótulo YYYY-MM-DD.
  // MetricSnapshot.date é @db.Date, então a comparação usa só a parte de data;
  // o alinhamento evita divergência quando o servidor não roda em UTC e casa a
  // borda exatamente com /agency/metas. monthEnd permanece local: é usado apenas
  // como limite superior de mês PASSADO (parte de data) e para totalDays via
  // getDate() — mantê-lo preserva os números históricos.
  const monthStart = saoPauloDayStart(`${year}-${pad(month + 1)}-01`)
  const monthEnd   = new Date(year, month + 1, 0)

  const today      = new Date()
  const todayDay   = today.getDate()
  const totalDays  = monthEnd.getDate()
  // If viewing current month use today's day, otherwise use full month
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month
  const daysElapsed    = isCurrentMonth ? Math.max(1, todayDay) : totalDays
  const daysRemaining  = isCurrentMonth ? totalDays - todayDay : 0
  const pctMonthElapsed = daysElapsed / totalDays

  // Previous month bounds
  const prevStart = new Date(year, month - 1, 1)
  const prevEnd   = new Date(year, month, 0)

  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      businessType: true,
      assignments: {
        where: { isPrimary: true },
        select: { user: { select: { name: true } } },
        take: 1,
      },
      goals: {
        where: {
          period: 'MONTHLY',
          startDate: { lte: monthEnd },
          endDate:   { gte: monthStart },
          metric:    { in: ['FATURAMENTO', 'ROAS', 'SPEND', 'CPL', 'CPA', ...LOCAL_RESULT_METRICS.map((m) => m.value)] },
        },
        // updatedAt asc: se houver mais de uma meta-resultado no mês, a mais
        // recente prevalece como métrica principal (mesma regra da grade).
        orderBy: { updatedAt: 'asc' },
        select: { metric: true, targetValue: true },
      },
      metricSnapshots: {
        where: { date: { gte: monthStart, lte: isCurrentMonth ? today : monthEnd } },
        select: {
          spend: true, conversions: true, conversionValue: true,
          clicks: true, impressions: true, cpc: true,
          platformAccount: { select: { platform: true } },
        },
      },
    },
  })

  // Prev month snapshots for comparison (GA4 only for revenue accuracy)
  const prevSnaps = await prisma.metricSnapshot.findMany({
    where: {
      clientId: { in: clients.map((c) => c.id) },
      date: { gte: prevStart, lte: prevEnd },
      platformAccount: { platform: 'GA4' },
    },
    select: { clientId: true, conversionValue: true, conversions: true },
  })

  const prevByClient = new Map<string, { revenue: number; purchases: number }>()
  for (const s of prevSnaps) {
    const cur = prevByClient.get(s.clientId) ?? { revenue: 0, purchases: 0 }
    cur.revenue    += Number(s.conversionValue ?? 0)
    cur.purchases  += Number(s.conversions ?? 0)
    prevByClient.set(s.clientId, cur)
  }

  // ── Métrica-resultado principal dos clientes local/B2B ────────────────────
  // Elege a meta-resultado principal por cliente (última por updatedAt, já que
  // c.goals vem ordenado asc). E-commerce fica de fora (usa faturamento/ROAS).
  const localGoalByClient = new Map<string, { metric: MetricType; goal: number }>()
  for (const c of clients) {
    if (c.businessType === 'ECOMMERCE') continue
    let elected: { metric: MetricType; goal: number } | null = null
    for (const g of c.goals) {
      if (LOCAL_RESULT_METRIC_SET.has(g.metric)) {
        const goal = Number(g.targetValue)
        if (goal > 0) elected = { metric: g.metric, goal }
      }
    }
    if (elected) localGoalByClient.set(c.id, elected)
  }

  // Realizado MTD da métrica principal SEM N+1: agrupa clientes por métrica e
  // faz UMA query por métrica distinta (getRealizadoBatch), não por cliente.
  const clientsByMetric = new Map<MetricType, Array<{ id: string; businessType: BusinessType }>>()
  const btById = new Map(clients.map((c) => [c.id, c.businessType]))
  for (const [clientId, { metric }] of localGoalByClient) {
    const bt = btById.get(clientId) ?? 'LOCAL'
    const arr = clientsByMetric.get(metric) ?? []
    arr.push({ id: clientId, businessType: bt })
    clientsByMetric.set(metric, arr)
  }

  const localActualByClient = new Map<string, number | null>()
  let localPeriodoLabel = 'no mês'
  for (const [metric, group] of clientsByMetric) {
    const realizados = await getRealizadoBatch(group, metric, 'MTD')
    for (const [clientId, r] of realizados) {
      localActualByClient.set(clientId, r.valor)
      localPeriodoLabel = r.periodoLabel
    }
  }

  // ── Realizado ECOM (faturamento/investimento/ROAS) via fonte única ────────
  // Mesma definição que estava duplicada aqui (GA4 conversionValue, spend das
  // contas de mídia, revenue÷spend), agora servida por getRealizadoBatch — assim
  // não diverge de /agency/metas na primeira mudança de aggregateSnapshots.
  // SEM N+1: três queries (uma por métrica), não uma por cliente.
  // Só se aplica ao MÊS CORRENTE (janela MTD do helper) e a clientes ECOMMERCE;
  // meses passados e clientes LOCAL preservam o cálculo local e seus números.
  let fatBatch:   Map<string, Realizado> | null = null
  let spendBatch: Map<string, Realizado> | null = null
  let roasBatch:  Map<string, Realizado> | null = null
  if (isCurrentMonth) {
    const ecomForBatch = clients
      .filter((c) => c.businessType === 'ECOMMERCE')
      .map((c) => ({ id: c.id, businessType: c.businessType }))
    if (ecomForBatch.length > 0) {
      ;[fatBatch, spendBatch, roasBatch] = await Promise.all([
        getRealizadoBatch(ecomForBatch, 'FATURAMENTO', 'MTD'),
        getRealizadoBatch(ecomForBatch, 'SPEND', 'MTD'),
        getRealizadoBatch(ecomForBatch, 'ROAS', 'MTD'),
      ])
    }
  }

  const labelByMetric = new Map(LOCAL_RESULT_METRICS.map((m) => [m.value, m.label]))

  return clients.map((c): ClientProgress => {
    const ga4  = c.metricSnapshots.filter((x) => x.platformAccount.platform === 'GA4')
    const ads  = c.metricSnapshots.filter((x) => x.platformAccount.platform !== 'GA4')

    const localRevenue = ga4.reduce((s, x) => s + Number(x.conversionValue ?? 0), 0)
    const purchases    = ga4.reduce((s, x) => s + (x.conversions ?? 0), 0)
    const sessions     = ga4.reduce((s, x) => s + (x.clicks ?? 0), 0)
    const localSpend   = ads.reduce((s, x) => s + Number(x.spend ?? 0), 0)

    // Faturamento/investimento vêm da fonte única no mês corrente (ECOM); nos
    // demais casos mantém o cálculo local (idêntico em definição para ECOM).
    const isEcom  = c.businessType === 'ECOMMERCE'
    const revenue = isEcom && fatBatch   ? (fatBatch.get(c.id)?.valor   ?? 0) : localRevenue
    const spend   = isEcom && spendBatch ? (spendBatch.get(c.id)?.valor ?? 0) : localSpend

    // clicks = link clicks from ad platforms (outbound link clicks, not all clicks)
    const adClicks      = ads.reduce((s, x) => s + (x.clicks ?? 0), 0)
    const adImpressions = ads.reduce((s, x) => s + (x.impressions ?? 0), 0)
    // Link CTR = link clicks / impressions — more accurate than stored ctr field (which may be CTR All)
    const ctr  = adImpressions > 0 && adClicks > 0 ? (adClicks / adImpressions) * 100 : null
    const cpc  = spend > 0 && adClicks > 0 ? spend / adClicks : null

    // ROAS da fonte única no mês corrente (ECOM); senão revenue÷spend local.
    const roas        = isEcom && roasBatch
      ? (roasBatch.get(c.id)?.valor ?? null)
      : (spend > 0 && revenue > 0 ? revenue / spend : null)
    const ticketMedio = purchases > 0 && revenue > 0 ? revenue / purchases : null
    const taxaConversao = sessions > 0 && purchases > 0 ? (purchases / sessions) * 100 : null

    const goalFat   = c.goals.find((g) => g.metric === 'FATURAMENTO')
    const goalRoas  = c.goals.find((g) => g.metric === 'ROAS')
    const goalSpend = c.goals.find((g) => g.metric === 'SPEND')

    const gFat   = goalFat   ? Number(goalFat.targetValue)   : null
    const gRoas  = goalRoas  ? Number(goalRoas.targetValue)  : null
    const gSpend = goalSpend ? Number(goalSpend.targetValue) : null

    const projection  = revenue > 0 && daysElapsed > 0
      ? (revenue / daysElapsed) * totalDays
      : null
    const pacedGoal   = gFat != null ? (gFat / totalDays) * daysElapsed : null
    const pctGoal     = gFat != null && gFat > 0 ? (revenue / gFat) * 100 : null
    const pctSpend    = gSpend != null && gSpend > 0 ? (spend / gSpend) * 100 : null

    // ── Meta-resultado local/B2B ──────────────────────────────────────────
    const localElected = localGoalByClient.get(c.id)
    let localMetric: MetricType | null = null
    let localMetricLabel: string | null = null
    let localGoal: number | null = null
    let localActual: number | null = null
    let localPct: number | null = null
    let localPacedGoal: number | null = null
    let custoMetricLabel: 'CPL' | 'CPA' | null = null
    let custoAlvo: number | null = null
    let custoRealizado: number | null = null

    if (localElected) {
      localMetric      = localElected.metric
      localMetricLabel = labelByMetric.get(localElected.metric) ?? null
      localGoal        = localElected.goal   // já garantido > 0 na eleição
      localActual      = localActualByClient.get(c.id) ?? null
      localPct         = localActual != null && localGoal > 0
        ? (localActual / localGoal) * 100
        : null
      localPacedGoal   = (localGoal / totalDays) * daysElapsed

      // Custo-alvo correto: CPL p/ LEADS, CPA p/ o resto.
      custoMetricLabel = costLabelFor(localElected.metric)
      const custoGoal  = c.goals.find((g) => g.metric === custoMetricLabel)
      custoAlvo        = custoGoal ? Number(custoGoal.targetValue) : null
      // Custo realizado = investimento ÷ resultados (guarda divisão por zero).
      custoRealizado   = localActual != null && localActual > 0 && spend > 0
        ? spend / localActual
        : null
    }

    const prev = prevByClient.get(c.id)
    const prevRevenue     = prev ? prev.revenue : null
    const prevTicketMedio = prev && prev.purchases > 0 && prev.revenue > 0
      ? prev.revenue / prev.purchases
      : null

    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      managerName: c.assignments[0]?.user?.name ?? '—',
      businessType: c.businessType,
      goalFaturamento: gFat,
      goalRoas: gRoas,
      goalSpend: gSpend,
      localMetric,
      localMetricLabel,
      localGoal,
      localActual,
      localPct,
      localPacedGoal,
      custoMetricLabel,
      custoAlvo,
      custoRealizado,
      periodoLabel: localPeriodoLabel,
      revenue,
      spend,
      purchases,
      sessions,
      ctr,
      cpc,
      roas,
      ticketMedio,
      taxaConversao,
      projection,
      pacedGoal,
      daysElapsed,
      daysRemaining,
      totalDays,
      pctMonthElapsed,
      pctGoalAchieved: pctGoal,
      pctSpendConsumed: pctSpend,
      prevRevenue,
      prevTicketMedio,
    }
  })
}
