'use server'

import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import {
  getRealizadoBatch,
  type Realizado,
  type PeriodoOuJanela,
} from '@/lib/metas/realizado'
import {
  LOCAL_RESULT_METRICS,
  LOCAL_RESULT_METRIC_SET,
  costLabelFor,
} from '@/lib/metas/metricOptions'
import { isAdPlatform } from '@/services/health-scorer'
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
  revenue: number        // ECOM: canônico (GA4SYNC>GA4/dia) · LOCAL: GA4
  spend: number          // ad platforms only (exclui GA4/GA4SYNC/NUVEMSHOP)
  purchases: number      // ECOM: canônico (CONVERSIONS GA4SYNC>GA4/dia) · LOCAL: GA4
  sessions: number       // GA4 only (sem análogo canônico)
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

  // QA Onda A (A-004/A-005): bounds contra MetricSnapshot.date (@db.Date =
  // 00:00Z) DEVEM ser UTC-midnight do dia-parede — o padrão AL-3/AL-4. O
  // saoPauloDayStart anterior (03:00Z) EXCLUÍA o snapshot do dia 1 do mês,
  // divergindo do gráfico de 6 meses (bucket calendário UTC).
  const monthStart = new Date(`${year}-${pad(month + 1)}-01T00:00:00.000Z`)
  const monthEnd   = new Date(Date.UTC(year, month + 1, 0)) // último dia do mês, 00:00Z

  const today      = new Date()
  const todayDay   = today.getDate()
  const totalDays  = monthEnd.getUTCDate()
  // If viewing current month use today's day, otherwise use full month
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month
  const daysElapsed    = isCurrentMonth ? Math.max(1, todayDay) : totalDays
  const daysRemaining  = isCurrentMonth ? totalDays - todayDay : 0
  const pctMonthElapsed = daysElapsed / totalDays

  // Previous month bounds — mesmo padrão UTC-midnight (coerência dia-1 com o
  // mês exibido; QA Onda A).
  const prevStart = new Date(Date.UTC(year, month - 1, 1))
  const prevEnd   = new Date(Date.UTC(year, month, 0))

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

  // Mês anterior (comparação/tendência A-004): fonte CANÔNICA, não GA4-only.
  // Para ECOMMERCE, faturamento/pedidos vêm de getRealizadoBatch (janela do mês
  // anterior) — precedência GA4SYNC>GA4 por dia, igual ao mês corrente. Assim a
  // seta mês-a-mês compara duas grandezas na MESMA base (antes: mês atual
  // GA4SYNC vs anterior GA4-only). Clientes LOCAL/B2B seguem via a mesma
  // agregação (aggregateSnapshots roteia por businessType).
  const ecomForBatch = clients
    .filter((c) => c.businessType === 'ECOMMERCE')
    .map((c) => ({ id: c.id, businessType: c.businessType }))

  const janelaPrev: PeriodoOuJanela = { start: prevStart, end: prevEnd, label: 'mês anterior' }
  let prevFatBatch:   Map<string, Realizado> | null = null
  let prevPurchBatch: Map<string, Realizado> | null = null
  if (ecomForBatch.length > 0) {
    ;[prevFatBatch, prevPurchBatch] = await Promise.all([
      getRealizadoBatch(ecomForBatch, 'FATURAMENTO', janelaPrev),
      getRealizadoBatch(ecomForBatch, 'CONVERSIONS', janelaPrev),
    ])
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

  // ── Realizado ECOM (faturamento/investimento/ROAS/pedidos) via fonte única ─
  // Agregação canônica (aggregateSnapshots via getRealizadoBatch): faturamento
  // GA4SYNC>GA4 por dia, investimento só das plataformas de anúncio, revenue÷spend.
  // SEM N+1: quatro queries (uma por métrica), não uma por cliente.
  // Aplica-se ao MÊS CORRENTE (janela MTD) E a MESES PASSADOS (janela explícita
  // do mês exibido) — antes o histórico caía no cálculo GA4-only e divergia do
  // gráfico de 6 meses (A-005). Clientes LOCAL seguem o cálculo local.
  const janelaMes: PeriodoOuJanela = isCurrentMonth
    ? 'MTD'
    : { start: monthStart, end: monthEnd, label: 'no mês' }
  let fatBatch:   Map<string, Realizado> | null = null
  let spendBatch: Map<string, Realizado> | null = null
  let roasBatch:  Map<string, Realizado> | null = null
  let purchBatch: Map<string, Realizado> | null = null
  if (ecomForBatch.length > 0) {
    ;[fatBatch, spendBatch, roasBatch, purchBatch] = await Promise.all([
      getRealizadoBatch(ecomForBatch, 'FATURAMENTO', janelaMes),
      getRealizadoBatch(ecomForBatch, 'SPEND', janelaMes),
      getRealizadoBatch(ecomForBatch, 'ROAS', janelaMes),
      getRealizadoBatch(ecomForBatch, 'CONVERSIONS', janelaMes),
    ])
  }

  const labelByMetric = new Map(LOCAL_RESULT_METRICS.map((m) => [m.value, m.label]))

  return clients.map((c): ClientProgress => {
    const ga4  = c.metricSnapshots.filter((x) => x.platformAccount.platform === 'GA4')
    // `ads` = plataformas de ANÚNCIO (spend). Exclui GA4/GA4SYNC/NUVEMSHOP via a
    // constante canônica (A-006): antes `!== 'GA4'` deixava GA4SYNC/NUVEMSHOP no
    // conjunto, divergindo da definição de spend do health-scorer/dal.
    const ads  = c.metricSnapshots.filter((x) => isAdPlatform(x.platformAccount.platform))

    const localRevenue = ga4.reduce((s, x) => s + Number(x.conversionValue ?? 0), 0)
    const localPurchases = ga4.reduce((s, x) => s + (x.conversions ?? 0), 0)
    const sessions     = ga4.reduce((s, x) => s + (x.clicks ?? 0), 0)
    const localSpend   = ads.reduce((s, x) => s + Number(x.spend ?? 0), 0)

    // Faturamento/investimento/pedidos vêm da fonte única (ECOM, mês corrente E
    // passado); clientes LOCAL mantêm o cálculo local (GA4 receita, ads spend).
    const isEcom  = c.businessType === 'ECOMMERCE'
    const revenue = isEcom && fatBatch   ? (fatBatch.get(c.id)?.valor   ?? 0) : localRevenue
    const spend   = isEcom && spendBatch ? (spendBatch.get(c.id)?.valor ?? 0) : localSpend
    // Pedidos canônicos (A-003): CONVERSIONS com precedência GA4SYNC>GA4 por dia,
    // não a soma GA4-only. Garante que ticket médio (revenue÷purchases) bata com
    // o Client 360. LOCAL preserva a contagem GA4.
    const purchases = isEcom && purchBatch ? (purchBatch.get(c.id)?.valor ?? 0) : localPurchases

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

    // Mês anterior canônico (A-004): mesma base do mês corrente. Para ECOM vem
    // dos batches do mês anterior (GA4SYNC>GA4 por dia); LOCAL fica sem histórico
    // aqui (a tendência de LOCAL não usa faturamento/ticket de e-commerce).
    const prevRevenue  = isEcom && prevFatBatch ? (prevFatBatch.get(c.id)?.valor ?? null) : null
    const prevPurchases = isEcom && prevPurchBatch ? (prevPurchBatch.get(c.id)?.valor ?? 0) : 0
    const prevTicketMedio = prevRevenue != null && prevRevenue > 0 && prevPurchases > 0
      ? prevRevenue / prevPurchases
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
