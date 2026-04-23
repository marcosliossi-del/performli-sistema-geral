import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { getAsaasClient } from '@/services/asaas/client'

export const dynamic = 'force-dynamic'

/**
 * GET /api/financeiro/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns aggregated financial KPIs for the given period.
 * Falls back to current month if no params.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session || !['ADMIN', 'CS'].includes(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const today = new Date()
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1)
  const defaultTo   = new Date(today.getFullYear(), today.getMonth() + 1, 0)

  const from = searchParams.get('from') ? new Date(searchParams.get('from')!) : defaultFrom
  const to   = searchParams.get('to')   ? new Date(searchParams.get('to')!)   : defaultTo

  // Previous period (same duration)
  const duration = to.getTime() - from.getTime()
  const prevFrom = new Date(from.getTime() - duration)
  const prevTo   = new Date(from.getTime() - 1)

  const [
    payments,
    prevPayments,
    transfers,
    prevTransfers,
    subscriptions,
    allClients,
  ] = await Promise.all([
    // Current period payments
    prisma.asaasPayment.findMany({
      where: {
        status: { in: ['RECEIVED', 'CONFIRMED'] },
        paymentDate: { gte: from, lte: to },
      },
      include: { customer: { select: { name: true, clientId: true } } },
    }),
    // Previous period payments
    prisma.asaasPayment.findMany({
      where: {
        status: { in: ['RECEIVED', 'CONFIRMED'] },
        paymentDate: { gte: prevFrom, lte: prevTo },
      },
    }),
    // Current period transfers (saídas)
    prisma.asaasTransfer.findMany({
      where: {
        status: 'DONE',
        transferDate: { gte: from, lte: to },
      },
      include: { category: { select: { name: true, color: true } } },
    }),
    // Previous period transfers
    prisma.asaasTransfer.findMany({
      where: { status: 'DONE', transferDate: { gte: prevFrom, lte: prevTo } },
    }),
    // Active subscriptions for MRR
    prisma.asaasSubscription.findMany({
      where: { status: 'ACTIVE' },
      include: { customer: { select: { name: true } } },
    }),
    // Active clients for LTV / tempo médio
    prisma.client.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, contractStart: true, contractValue: true },
    }),
  ])

  // ── Entradas ──────────────────────────────────────────────────────────────
  const entradas     = payments.reduce((s, p) => s + Number(p.value), 0)
  const prevEntradas = prevPayments.reduce((s, p) => s + Number(p.value), 0)

  // ── Saídas ────────────────────────────────────────────────────────────────
  const saidas     = transfers.reduce((s, t) => s + Number(t.value), 0)
  const prevSaidas = prevTransfers.reduce((s, t) => s + Number(t.value), 0)

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
  const inadimplentes = await prisma.asaasPayment.findMany({
    where: { status: 'OVERDUE', dueDate: { lte: today } },
    distinct: ['customerId'],
    select: { customerId: true },
  })
  const clientesInadimplentes = inadimplentes.length
  const inadimplenciaValue = await prisma.asaasPayment.aggregate({
    where: { status: 'OVERDUE', dueDate: { lte: today } },
    _sum: { value: true },
  })

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
  const entradasPrevistas = await prisma.asaasPayment.aggregate({
    where: { status: 'PENDING', dueDate: { gte: today } },
    _sum: { value: true },
  })
  const saidasPrevistas = await prisma.asaasTransfer.aggregate({
    where: { status: 'PENDING', scheduleDate: { gte: today } },
    _sum: { value: true },
  })

  // ── Distribuição entradas por cliente (para donut) ────────────────────────
  const entradaByCustomer = new Map<string, number>()
  for (const p of payments) {
    const label = p.customer?.name ?? 'Sem cliente'
    entradaByCustomer.set(label, (entradaByCustomer.get(label) ?? 0) + Number(p.value))
  }
  const distribuicaoEntradas = buildTop5(entradaByCustomer)

  // ── Distribuição saídas por categoria ────────────────────────────────────
  const saidaByCategory = new Map<string, { value: number; color: string }>()
  for (const t of transfers) {
    const label = t.category?.name ?? 'Sem categoria'
    const color = t.category?.color ?? '#6B7280'
    const prev  = saidaByCategory.get(label) ?? { value: 0, color }
    saidaByCategory.set(label, { value: prev.value + Number(t.value), color })
  }
  const distribuicaoSaidas = Array.from(saidaByCategory.entries())
    .map(([name, d]) => ({ name, value: d.value, color: d.color }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  // ── Saldo atual via Asaas API ─────────────────────────────────────────────
  let saldo = 0
  try {
    const asaas = getAsaasClient()
    const balance = await asaas.getBalance()
    saldo = balance.balance
  } catch { /* use 0 if API unavailable */ }

  // ── Churn rate (clientes churned / total no período) ─────────────────────
  const churnedThisPeriod = await prisma.client.count({
    where: { status: 'CHURNED', updatedAt: { gte: from, lte: to } },
  })
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
