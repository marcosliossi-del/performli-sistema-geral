'use server'

import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'

export type ClientProgress = {
  id: string
  name: string
  slug: string
  managerName: string
  // Goals
  goalFaturamento: number | null
  goalRoas: number | null
  goalSpend: number | null
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

  const monthStart = new Date(year, month, 1)
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
          metric:    { in: ['FATURAMENTO', 'ROAS', 'SPEND'] },
        },
        select: { metric: true, targetValue: true },
      },
      metricSnapshots: {
        where: { date: { gte: monthStart, lte: isCurrentMonth ? today : monthEnd } },
        select: {
          spend: true, conversions: true, conversionValue: true,
          clicks: true, ctr: true, cpc: true,
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

  return clients.map((c): ClientProgress => {
    const ga4  = c.metricSnapshots.filter((x) => x.platformAccount.platform === 'GA4')
    const ads  = c.metricSnapshots.filter((x) => x.platformAccount.platform !== 'GA4')

    const revenue    = ga4.reduce((s, x) => s + Number(x.conversionValue ?? 0), 0)
    const purchases  = ga4.reduce((s, x) => s + (x.conversions ?? 0), 0)
    const sessions   = ga4.reduce((s, x) => s + (x.clicks ?? 0), 0)
    const spend      = ads.reduce((s, x) => s + Number(x.spend ?? 0), 0)

    const adClicks   = ads.reduce((s, x) => s + (x.clicks ?? 0), 0)
    const ctrVals    = ads.filter((x) => x.ctr != null).map((x) => Number(x.ctr))
    const ctr        = ctrVals.length > 0 ? ctrVals.reduce((a, b) => a + b, 0) / ctrVals.length : null
    const cpc        = spend > 0 && adClicks > 0 ? spend / adClicks : null

    const roas        = spend > 0 && revenue > 0 ? revenue / spend : null
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
      goalFaturamento: gFat,
      goalRoas: gRoas,
      goalSpend: gSpend,
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
