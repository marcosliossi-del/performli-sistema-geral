import { Suspense } from 'react'
import { requireSession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { FinanceiroKpiCard } from '@/components/financeiro/FinanceiroKpiCard'
import { EntradaSaidaChart } from '@/components/financeiro/EntradaSaidaChart'
import { ReceitaMediaChart } from '@/components/financeiro/ReceitaMediaChart'
import { DistribuicaoDonut } from '@/components/financeiro/DistribuicaoDonut'
import { MovimentacoesTable } from '@/components/financeiro/MovimentacoesTable'
import { PeriodSelector } from '@/components/financeiro/PeriodSelector'
import {
  TrendingUp, TrendingDown, DollarSign, Users, AlertCircle,
  Clock, Calendar, BarChart3, RefreshCw,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string }>
}

async function getFinanceiroData(from: Date, to: Date) {
  const today    = new Date()
  const duration = to.getTime() - from.getTime()
  const prevFrom = new Date(from.getTime() - duration)
  const prevTo   = new Date(from.getTime() - 1)

  const [
    payments, prevPayments,
    transfers, prevTransfers,
    subscriptions, allClients,
    inadimplentes, inadimplenciaAgg,
    entradasPrevAgg, saidasPrevAgg,
    topEntradas, topSaidas,
  ] = await Promise.all([
    prisma.asaasPayment.findMany({
      where: { status: { in: ['RECEIVED', 'CONFIRMED'] }, paymentDate: { gte: from, lte: to } },
      include: { customer: { select: { name: true } } },
      orderBy: { value: 'desc' },
    }),
    prisma.asaasPayment.aggregate({
      where: { status: { in: ['RECEIVED', 'CONFIRMED'] }, paymentDate: { gte: prevFrom, lte: prevTo } },
      _sum: { value: true },
    }),
    prisma.asaasTransfer.findMany({
      where: { status: 'DONE', transferDate: { gte: from, lte: to } },
      include: { category: { select: { name: true, color: true } } },
      orderBy: { value: 'desc' },
    }),
    prisma.asaasTransfer.aggregate({
      where: { status: 'DONE', transferDate: { gte: prevFrom, lte: prevTo } },
      _sum: { value: true },
    }),
    prisma.asaasSubscription.findMany({
      where: { status: 'ACTIVE' },
    }),
    prisma.client.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, contractStart: true },
    }),
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
    // Top 10 payments for table
    prisma.asaasPayment.findMany({
      where: { status: { in: ['RECEIVED', 'CONFIRMED'] }, paymentDate: { gte: from, lte: to } },
      include: { customer: { select: { name: true } } },
      orderBy: { value: 'desc' },
      take: 10,
    }),
    prisma.asaasTransfer.findMany({
      where: { status: 'DONE', transferDate: { gte: from, lte: to } },
      include: { category: { select: { name: true, color: true } } },
      orderBy: { value: 'desc' },
      take: 10,
    }),
  ])

  const entradas     = payments.reduce((s, p) => s + Number(p.value), 0)
  const prevEntradas = Number(prevPayments._sum.value ?? 0)
  const saidas       = transfers.reduce((s, t) => s + Number(t.value), 0)
  const prevSaidas   = Number(prevTransfers._sum.value ?? 0)
  const lucro        = entradas - saidas
  const prevLucro    = prevEntradas - prevSaidas

  const receitaRecorrente = subscriptions.reduce((s, sub) => {
    const v = Number(sub.value)
    if (sub.cycle === 'YEARLY')    return s + v / 12
    if (sub.cycle === 'QUARTERLY') return s + v / 3
    if (sub.cycle === 'WEEKLY')    return s + v * 4.33
    return s + v
  }, 0)

  const clientesRecorrentes   = subscriptions.length
  const clientesInadimplentes = inadimplentes.length
  const inadimplenciaValue    = Number(inadimplenciaAgg._sum.value ?? 0)

  const tempoMedioMeses = allClients.reduce((sum, c) => {
    if (!c.contractStart) return sum
    return sum + (today.getTime() - new Date(c.contractStart).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  }, 0) / (allClients.length || 1)

  const receitaMedia = clientesRecorrentes > 0 ? receitaRecorrente / clientesRecorrentes : 0
  const ltv          = receitaMedia * Math.max(tempoMedioMeses, 1)

  const pct = (curr: number, prev: number) =>
    prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 10000) / 100

  // Distribuição entradas por cliente
  const entradaMap = new Map<string, number>()
  for (const p of payments) {
    const k = p.customer?.name ?? 'Sem cliente'
    entradaMap.set(k, (entradaMap.get(k) ?? 0) + Number(p.value))
  }
  const distribuicaoEntradas = Array.from(entradaMap.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([name, value]) => ({ name, value }))

  // Distribuição saídas por categoria
  const saidaMap = new Map<string, { value: number; color: string }>()
  for (const t of transfers) {
    const k = t.category?.name ?? 'Sem categoria'
    const c = t.category?.color ?? '#6B7280'
    const prev = saidaMap.get(k) ?? { value: 0, color: c }
    saidaMap.set(k, { value: prev.value + Number(t.value), color: c })
  }
  const distribuicaoSaidas = Array.from(saidaMap.entries())
    .sort((a, b) => b[1].value - a[1].value).slice(0, 6)
    .map(([name, d]) => ({ name, value: d.value, color: d.color }))

  return {
    entradas, saidas, lucro,
    prevEntradas, prevSaidas, prevLucro,
    deltaEntradas: pct(entradas, prevEntradas),
    deltaSaidas:   pct(saidas, prevSaidas),
    deltaLucro:    pct(lucro, prevLucro),
    receitaRecorrente,
    receitaMedia,
    ltv,
    clientesRecorrentes,
    clientesInadimplentes,
    inadimplenciaValue,
    tempoMedioMeses,
    entradasPrevistas: Number(entradasPrevAgg._sum.value ?? 0),
    saidasPrevistas:   Number(saidasPrevAgg._sum.value ?? 0),
    distribuicaoEntradas,
    distribuicaoSaidas,
    topEntradas: topEntradas.map(p => ({
      name: p.customer?.name ?? 'Sem cliente',
      description: p.description ?? undefined,
      value: Number(p.value),
    })),
    topSaidas: topSaidas.map(t => ({
      name: t.category?.name ?? 'Sem categoria',
      description: t.description ?? undefined,
      value: Number(t.value),
    })),
  }
}

async function getCashflowData() {
  const today  = new Date()
  const months = 6
  const ptMonths = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

  const cashflow = []
  const receitaMedia = []
  const activeCount = await prisma.client.count({ where: { status: 'ACTIVE' } })

  for (let i = months - 1; i >= 0; i--) {
    const d     = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const start = new Date(d.getFullYear(), d.getMonth(), 1)
    const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)

    const [entradasAgg, saidasAgg] = await Promise.all([
      prisma.asaasPayment.aggregate({
        where: { status: { in: ['RECEIVED', 'CONFIRMED'] }, paymentDate: { gte: start, lte: end } },
        _sum: { value: true },
      }),
      prisma.asaasTransfer.aggregate({
        where: { status: 'DONE', transferDate: { gte: start, lte: end } },
        _sum: { value: true },
      }),
    ])

    const e = Number(entradasAgg._sum.value ?? 0)
    const s = Number(saidasAgg._sum.value ?? 0)

    cashflow.push({ month: ptMonths[d.getMonth()], entradas: e, saidas: s })
    receitaMedia.push({ month: ptMonths[d.getMonth()], value: activeCount > 0 ? e / activeCount : 0 })
  }

  return { cashflow, receitaMedia }
}

export default async function FinanceiroPage({ searchParams }: PageProps) {
  const session = await requireSession()
  if (!['ADMIN', 'CS'].includes(session.role)) redirect('/dashboard')

  const params = await searchParams
  const today  = new Date()
  const from   = params.from ? new Date(params.from) : new Date(today.getFullYear(), today.getMonth(), 1)
  const to     = params.to   ? new Date(params.to)   : new Date(today.getFullYear(), today.getMonth() + 1, 0)

  const [data, { cashflow, receitaMedia }] = await Promise.all([
    getFinanceiroData(from, to),
    getCashflowData(),
  ])

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#EBEBEB]">DRE — Financeiro</h1>
          <p className="text-sm text-[#87919E] mt-0.5">Demonstrativo de resultado da agência</p>
        </div>
        <a
          href="/api/asaas/sync"
          className="flex items-center gap-1.5 text-xs text-[#87919E] hover:text-[#EBEBEB] transition-colors"
        >
          <RefreshCw size={12} />
          Sincronizar Asaas
        </a>
      </div>

      {/* Period selector */}
      <Suspense>
        <PeriodSelector />
      </Suspense>

      {/* KPI Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <FinanceiroKpiCard
          label="Entradas"
          value={data.entradas}
          delta={data.deltaEntradas}
          colorScheme="green"
          icon={<TrendingUp size={14} />}
        />
        <FinanceiroKpiCard
          label="Saídas"
          value={data.saidas}
          delta={data.deltaSaidas}
          colorScheme="red"
          icon={<TrendingDown size={14} />}
        />
        <FinanceiroKpiCard
          label="Saldo"
          value={data.entradas - data.saidas}
          colorScheme={data.entradas >= data.saidas ? 'green' : 'red'}
          icon={<DollarSign size={14} />}
        />
        <FinanceiroKpiCard
          label="LTV"
          value={data.ltv}
          colorScheme="neutral"
          icon={<BarChart3 size={14} />}
        />
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <FinanceiroKpiCard
          label="Tempo médio do cliente (meses)"
          value={data.tempoMedioMeses}
          format="months"
          colorScheme="neutral"
          icon={<Clock size={14} />}
        />
        <FinanceiroKpiCard
          label="Entradas previstas"
          value={data.entradasPrevistas}
          colorScheme="green"
          icon={<Calendar size={14} />}
        />
        <FinanceiroKpiCard
          label="Saídas previstas"
          value={data.saidasPrevistas}
          colorScheme="red"
          icon={<Calendar size={14} />}
        />
        <FinanceiroKpiCard
          label="Receita recorrente (MRR)"
          value={data.receitaRecorrente}
          colorScheme="green"
          icon={<TrendingUp size={14} />}
        />
      </div>

      {/* KPI Row 3 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <FinanceiroKpiCard
          label="Clientes recorrentes"
          value={data.clientesRecorrentes}
          format="number"
          colorScheme="green"
          icon={<Users size={14} />}
        />
        <FinanceiroKpiCard
          label="Clientes inadimplentes"
          value={data.clientesInadimplentes}
          format="number"
          colorScheme="red"
          icon={<AlertCircle size={14} />}
        />
        <FinanceiroKpiCard
          label="Receita média por cliente"
          value={data.receitaMedia}
          colorScheme="neutral"
          icon={<DollarSign size={14} />}
        />
        <FinanceiroKpiCard
          label="Inadimplência"
          value={data.inadimplenciaValue}
          colorScheme="red"
          icon={<AlertCircle size={14} />}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EntradaSaidaChart data={cashflow} />
        <ReceitaMediaChart data={receitaMedia} />
      </div>

      {/* Donut row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DistribuicaoDonut title="Distribuição de entradas" data={data.distribuicaoEntradas} />
        <DistribuicaoDonut title="Distribuição de saídas"   data={data.distribuicaoSaidas} />
      </div>

      {/* Tables row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MovimentacoesTable title="Principais entradas" rows={data.topEntradas} type="entrada" />
        <MovimentacoesTable title="Principais saídas"   rows={data.topSaidas}   type="saida" />
      </div>
    </div>
  )
}
