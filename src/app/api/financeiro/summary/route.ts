import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { getAsaasClient } from '@/services/asaas/client'
import { saoPauloDateString, saoPauloDayStart } from '@/lib/utils'
import { spDayInfo } from '@/lib/metas/pace'

export const dynamic = 'force-dynamic'

/**
 * GET /api/financeiro/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns aggregated financial KPIs for the given period.
 * Falls back to current month if no params.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)

  // A-119/A-115: bounds no MESMO padrão SP da página /financeiro. `to` é o
  // limite superior EXCLUSIVO (início do dia SEGUINTE ao fim do período, SP), e
  // toda comparação usa `lt: to` — antes `new Date('YYYY-MM-DD')` + `lte`
  // cortava/deslocava o último dia e divergia do DRE da página.
  const todayStr = saoPauloDateString() // 'YYYY-MM-DD' em SP
  const [y, m]   = todayStr.split('-').map(Number)
  const nextY    = m === 12 ? y + 1 : y
  const nextM    = m === 12 ? 1 : m + 1
  const fromParam = searchParams.get('from')
  const toParam   = searchParams.get('to')

  const from = saoPauloDayStart(fromParam ?? `${todayStr.slice(0, 7)}-01`)
  const to   = toParam
    ? new Date(saoPauloDayStart(toParam).getTime() + 86_400_000) // dia seguinte ao fim selecionado
    : saoPauloDayStart(`${nextY}-${String(nextM).padStart(2, '0')}-01`)

  // "Hoje" (inadimplência/previstos) = 00:00Z do dia-parede SP, igual à página.
  const today = spDayInfo().spDayStartUtc

  // Período anterior: mesma duração, terminando onde o atual começa (EXCLUSIVO).
  const duration = to.getTime() - from.getTime()
  const prevFrom = new Date(from.getTime() - duration)
  const prevTo   = from

  const [
    payments,
    prevPayments,
    expenses,
    prevExpenses,
    subscriptions,
    allClients,
  ] = await Promise.all([
    // Current period payments
    prisma.asaasPayment.findMany({
      where: {
        status: { in: ['RECEIVED', 'CONFIRMED'] },
        paymentDate: { gte: from, lt: to },
      },
      include: { customer: { select: { name: true, clientId: true } } },
    }),
    // Previous period payments (só soma — aggregate em vez de findMany+reduce)
    prisma.asaasPayment.aggregate({
      where: {
        status: { in: ['RECEIVED', 'CONFIRMED'] },
        paymentDate: { gte: prevFrom, lt: prevTo },
      },
      _sum: { value: true },
    }),
    // Saídas realizadas do período: despesas (Expense) — inclui débitos do extrato
    // do Asaas (source=ASAAS) + lançamentos manuais. Fonte única, sem dupla contagem.
    prisma.expense.findMany({
      where: { date: { gte: from, lt: to } },
      select: { value: true, category: true },
    }),
    // Previous period expenses (só soma — aggregate em vez de findMany+reduce)
    prisma.expense.aggregate({
      where: { date: { gte: prevFrom, lt: prevTo } },
      _sum: { value: true },
    }),
    // Active subscriptions for MRR (include morto removido — name nunca é usado)
    prisma.asaasSubscription.findMany({
      where: { status: 'ACTIVE' },
    }),
    // Active clients for LTV / tempo médio
    prisma.client.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, contractStart: true, contractValue: true },
    }),
  ])

  // ── Entradas ──────────────────────────────────────────────────────────────
  const entradas     = payments.reduce((s, p) => s + Number(p.value), 0)
  const prevEntradas = Number(prevPayments._sum.value ?? 0)

  // ── Saídas realizadas (despesas: extrato Asaas + manuais) ───────────────────
  const saidas     = expenses.reduce((s, e) => s + Number(e.value), 0)
  const prevSaidas = Number(prevExpenses._sum.value ?? 0)

  // ── Lucro ─────────────────────────────────────────────────────────────────
  const lucro     = entradas - saidas
  const prevLucro = prevEntradas - prevSaidas

  // ── MRR / Receita Recorrente ───────────────────────────────────────────────
  const receitaRecorrente = subscriptions.reduce((s, sub) => {
    const monthly = sub.cycle === 'YEARLY'      ? Number(sub.value) / 12
                  : sub.cycle === 'QUARTERLY'   ? Number(sub.value) / 3
                  : sub.cycle === 'WEEKLY'       ? Number(sub.value) * 4.33
                  : Number(sub.value) // MONTHLY
    return s + monthly
  }, 0)

  // ── Clientes recorrentes / inadimplentes ──────────────────────────────────
  const clientesRecorrentes = subscriptions.length

  // Queries independentes agrupadas (antes rodavam em série)
  const [
    inadimplentes,
    inadimplenciaValue,
    entradasPrevistas,
    saidasPrevistas,
    churnedThisPeriod,
  ] = await Promise.all([
    prisma.asaasPayment.findMany({
      where: { status: 'OVERDUE', dueDate: { lte: today } },
      distinct: ['customerId'],
      select: { customerId: true },
    }),
    prisma.asaasPayment.aggregate({
      where: { status: 'OVERDUE', dueDate: { lte: today } },
      _sum: { value: true },
    }),
    prisma.asaasPayment.aggregate({
      where: { status: 'PENDING', dueDate: { gte: today } },
      _sum: { value: true },
    }),
    prisma.asaasTransfer.aggregate({
      where: { status: 'PENDING', scheduleDate: { gte: today } },
      _sum: { value: true },
    }),
    prisma.client.count({
      where: { status: 'CHURNED', updatedAt: { gte: from, lt: to } },
    }),
  ])
  const clientesInadimplentes = inadimplentes.length

  // ── Receita média por cliente ─────────────────────────────────────────────
  const receitaMediaPorCliente = clientesRecorrentes > 0
    ? receitaRecorrente / clientesRecorrentes
    : 0

  // ── LTV ───────────────────────────────────────────────────────────────────
  const tempoMedioMeses = allClients.reduce((sum, c) => {
    if (!c.contractStart) return sum
    const months = (today.getTime() - new Date(c.contractStart).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    return sum + months
  }, 0) / (allClients.length || 1)

  const ltv = receitaMediaPorCliente * Math.max(tempoMedioMeses, 1)

  // ── Entradas / Saídas previstas ───────────────────────────────────────────
  // (entradasPrevistas / saidasPrevistas agregados no Promise.all acima)

  // ── Distribuição entradas por cliente (para donut) ────────────────────────
  const entradaByCustomer = new Map<string, number>()
  for (const p of payments) {
    const label = p.customer?.name ?? 'Sem cliente'
    entradaByCustomer.set(label, (entradaByCustomer.get(label) ?? 0) + Number(p.value))
  }
  const distribuicaoEntradas = buildTop5(entradaByCustomer)

  // ── Distribuição saídas por categoria (despesas) ──────────────────────────
  const saidaByCategory = new Map<string, { value: number; color: string }>()
  for (const e of expenses) {
    const cfg   = EXPENSE_CATEGORY[e.category] ?? { label: e.category, color: '#6B7280' }
    const prev  = saidaByCategory.get(cfg.label) ?? { value: 0, color: cfg.color }
    saidaByCategory.set(cfg.label, { value: prev.value + Number(e.value), color: cfg.color })
  }
  const distribuicaoSaidas = Array.from(saidaByCategory.entries())
    .map(([name, d]) => ({ name, value: d.value, color: d.color }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  // ── Saldo atual via Asaas API ─────────────────────────────────────────────
  let saldo = 0
  try {
    const asaas = await getAsaasClient()
    const balance = await asaas.getBalance()
    saldo = balance.balance
  } catch { /* use 0 if API unavailable */ }

  // ── Churn rate (clientes churned / total no período) ─────────────────────
  // (churnedThisPeriod contado no Promise.all acima)
  const churnRate = allClients.length > 0 ? (churnedThisPeriod / allClients.length) * 100 : 0

  return NextResponse.json({
    entradas,
    saidas,
    lucro,
    saldo,
    ltv,
    receitaRecorrente,
    receitaMediaPorCliente,
    clientesRecorrentes,
    clientesInadimplentes,
    inadimplenciaValue: Number(inadimplenciaValue._sum.value ?? 0),
    entradasPrevistas: Number(entradasPrevistas._sum.value ?? 0),
    saidasPrevistas: Number(saidasPrevistas._sum.value ?? 0),
    tempoMedioCliente: Math.round(tempoMedioMeses * 100) / 100,
    churnRate: Math.round(churnRate * 100) / 100,
    distribuicaoEntradas,
    distribuicaoSaidas,
    // Period-over-period deltas (%)
    deltaEntradas: pct(entradas, prevEntradas),
    deltaSaidas:   pct(saidas, prevSaidas),
    deltaLucro:    pct(lucro, prevLucro),
  })
}

const EXPENSE_CATEGORY: Record<string, { label: string; color: string }> = {
  SALARIOS:      { label: 'Salários',      color: '#a98cff' },
  MARKETING:     { label: 'Marketing',     color: '#4d96ff' },
  FERRAMENTAS:   { label: 'Ferramentas',   color: '#54e0ee' },
  IMPOSTOS:      { label: 'Impostos',      color: '#ff5e6a' },
  CONTABILIDADE: { label: 'Contabilidade', color: '#e3ad45' },
  ESCRITORIO:    { label: 'Escritório',    color: '#34c97a' },
  OUTROS:        { label: 'Outros',        color: '#647488' },
}

function pct(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 10000) / 100
}

function buildTop5(map: Map<string, number>) {
  const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  const top5    = entries.slice(0, 5)
  const others  = entries.slice(5).reduce((s, [, v]) => s + v, 0)
  const result  = top5.map(([name, value]) => ({ name, value }))
  if (others > 0) result.push({ name: 'Outros', value: others })
  return result
}
