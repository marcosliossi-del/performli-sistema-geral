import { Suspense } from 'react'
import { requireSession, getOverdueInvoices, getClientsWithoutBilling } from '@/lib/dal'
import { redirect } from 'next/navigation'
import { InadimplenciaFila } from '@/components/financeiro/InadimplenciaFila'
import { prisma } from '@/lib/prisma'
import { FinanceiroKpiCard } from '@/components/financeiro/FinanceiroKpiCard'
import { EntradaSaidaChart } from '@/components/financeiro/EntradaSaidaChart'
import { ReceitaMediaChart } from '@/components/financeiro/ReceitaMediaChart'
import { DistribuicaoDonut } from '@/components/financeiro/DistribuicaoDonut'
import { MovimentacoesTable } from '@/components/financeiro/MovimentacoesTable'
import { PeriodSelector } from '@/components/financeiro/PeriodSelector'
import { SyncAsaasButton } from '@/components/financeiro/SyncAsaasButton'
import { ExpenseLaunchButton } from '@/components/financeiro/ExpenseLaunchButton'
import { categoryColor, categoryLabel } from '@/components/financeiro/ExpenseModal'
import { saoPauloDateString, saoPauloDayStart, formatSaoPauloDateTime } from '@/lib/utils'
import {
  TrendingUp, TrendingDown, DollarSign, Users, AlertCircle,
  Clock, Calendar, BarChart3, Percent,
} from 'lucide-react'
import { hasSpaceGrant } from '@/lib/nav-access'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string }>
}

// `to` é o limite superior EXCLUSIVO (início do dia seguinte ao fim do período,
// no fuso SP). Toda comparação usa `lt: to` / `lt: prevTo`.
async function getFinanceiroData(from: Date, to: Date) {
  const today    = new Date()
  const duration = to.getTime() - from.getTime()
  const prevFrom = new Date(from.getTime() - duration)
  const prevTo   = from // período anterior termina onde o atual começa (exclusivo)

  const [
    payments, prevPayments,
    transfers, prevTransfersAgg,
    manualExpenses, prevManualAgg,
    subscriptions, allClients,
    inadimplentes, inadimplenciaAgg,
    entradasPrevAgg, saidasPrevAgg,
    topEntradas, topTransfers,
  ] = await Promise.all([
    prisma.asaasPayment.findMany({
      where: { status: { in: ['RECEIVED', 'CONFIRMED'] }, paymentDate: { gte: from, lt: to } },
      include: {
        customer: {
          select: { name: true, client: { select: { name: true, razaoSocial: true } } },
        },
      },
      orderBy: { value: 'desc' },
    }),
    prisma.asaasPayment.aggregate({
      where: { status: { in: ['RECEIVED', 'CONFIRMED'] }, paymentDate: { gte: prevFrom, lt: prevTo } },
      _sum: { value: true },
    }),
    // Saídas automáticas via sync Asaas (transferências PIX/TED já pagas)
    prisma.asaasTransfer.findMany({
      where: { status: 'DONE', transferDate: { gte: from, lt: to } },
      include: { category: { select: { name: true, color: true } } },
      orderBy: { value: 'desc' },
    }),
    prisma.asaasTransfer.aggregate({
      where: { status: 'DONE', transferDate: { gte: prevFrom, lt: prevTo } },
      _sum: { value: true },
    }),
    // Saídas manuais lançadas pelo usuário (salários, impostos, etc.)
    prisma.expense.findMany({
      where: { date: { gte: from, lt: to } },
      orderBy: { value: 'desc' },
    }),
    prisma.expense.aggregate({
      where: { date: { gte: prevFrom, lt: prevTo } },
      _sum: { value: true },
    }),
    prisma.asaasSubscription.findMany({ where: { status: 'ACTIVE' } }),
    prisma.client.findMany({ where: { status: 'ACTIVE' }, select: { id: true, contractStart: true } }),
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
    prisma.asaasPayment.findMany({
      where: { status: { in: ['RECEIVED', 'CONFIRMED'] }, paymentDate: { gte: from, lt: to } },
      include: {
        customer: {
          select: { name: true, client: { select: { name: true, razaoSocial: true } } },
        },
      },
      orderBy: { value: 'desc' },
      take: 10,
    }),
    prisma.asaasTransfer.findMany({
      where: { status: 'DONE', transferDate: { gte: from, lt: to } },
      include: { category: { select: { name: true, color: true } } },
      orderBy: { value: 'desc' },
      take: 10,
    }),
  ])

  // DRE usa valor líquido (netValue) — igual à conciliação —, caindo no bruto
  // quando o Asaas ainda não informou a taxa. Mantém Lucro/Margem consistentes.
  const entradas       = payments.reduce((s, p) => s + Number(p.netValue ?? p.value), 0)
  const prevEntradas   = Number(prevPayments._sum.value ?? 0)
  const saidasAsaas    = transfers.reduce((s, t) => s + Number(t.value), 0)
  const saidasManuais  = manualExpenses.reduce((s, e) => s + Number(e.value), 0)
  const saidas         = saidasAsaas + saidasManuais
  const prevSaidas     = Number(prevTransfersAgg._sum.value ?? 0) + Number(prevManualAgg._sum.value ?? 0)
  const lucro          = entradas - saidas
  const prevLucro      = prevEntradas - prevSaidas
  const margem         = entradas > 0 ? (lucro / entradas) * 100 : 0

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

  // Distribuição entradas por cliente. Preferimos a identidade do cliente
  // vinculado (fantasia; razão como complemento); sem vínculo, nome cru do Asaas
  // com indicação "(sem vínculo)" — mesmo padrão da MovimentacoesTable.
  const entradaMap = new Map<string, number>()
  for (const p of payments) {
    const linked = p.customer?.client
    const k = linked
      ? (linked.razaoSocial ? `${linked.name} — ${linked.razaoSocial}` : linked.name)
      : `${p.customer?.name ?? 'Sem cliente'} (sem vínculo)`
    entradaMap.set(k, (entradaMap.get(k) ?? 0) + Number(p.netValue ?? p.value))
  }
  const distribuicaoEntradas = Array.from(entradaMap.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([name, value]) => ({ name, value }))

  // Distribuição saídas: Asaas transfers (por FinancialCategory) + manuais (por ExpenseCategory)
  const saidaMap = new Map<string, { value: number; color: string }>()
  for (const t of transfers) {
    const k    = t.category?.name ?? 'Transferências'
    const c    = t.category?.color ?? '#6B7280'
    const prev = saidaMap.get(k) ?? { value: 0, color: c }
    saidaMap.set(k, { value: prev.value + Number(t.value), color: c })
  }
  for (const e of manualExpenses) {
    const k    = categoryLabel(e.category)
    const c    = categoryColor(e.category)
    const prev = saidaMap.get(k) ?? { value: 0, color: c }
    saidaMap.set(k, { value: prev.value + Number(e.value), color: c })
  }
  const distribuicaoSaidas = Array.from(saidaMap.entries())
    .sort((a, b) => b[1].value - a[1].value).slice(0, 6)
    .map(([name, d]) => ({ name, value: d.value, color: d.color }))

  const allSaidas = [
    ...topTransfers.map(t => ({
      name: t.category?.name ?? 'Transferências',
      description: t.description ?? undefined,
      value: Number(t.value),
    })),
    ...manualExpenses.map(e => ({
      name: categoryLabel(e.category),
      description: e.description,
      value: Number(e.value),
    })),
  ].sort((a, b) => b.value - a.value).slice(0, 10)

  return {
    entradas, saidas, lucro, margem,
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
    topEntradas: topEntradas.map(p => {
      const linked = p.customer?.client
      return {
        // Preferimos a identidade do cliente vinculado (fantasia + razão).
        // Sem vínculo, mantemos o nome cru do Asaas e sinalizamos discretamente.
        name: linked?.name ?? p.customer?.name ?? 'Sem cliente',
        razaoSocial: linked?.razaoSocial ?? null,
        unlinked: !linked,
        description: p.description ?? undefined,
        value: Number(p.value),
      }
    }),
    topSaidas: allSaidas,
  }
}

async function getCashflowData() {
  const today  = new Date()
  const months = 6
  const ptMonths = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

  // Janelas dos últimos `months` meses (mais antigo → atual).
  const ranges = Array.from({ length: months }, (_, idx) => {
    const i = months - 1 - idx
    const d     = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const start = new Date(d.getFullYear(), d.getMonth(), 1)
    const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
    return { monthIndex: d.getMonth(), start, end }
  })

  // Uma rodada de queries em paralelo (antes eram ~18 sequenciais).
  const [activeCount, perMonth] = await Promise.all([
    prisma.client.count({ where: { status: 'ACTIVE' } }),
    Promise.all(
      ranges.map(async ({ monthIndex, start, end }) => {
        const [entradasAgg, transfersAgg, expensesAgg] = await Promise.all([
          prisma.asaasPayment.aggregate({
            where: { status: { in: ['RECEIVED', 'CONFIRMED'] }, paymentDate: { gte: start, lte: end } },
            _sum: { value: true },
          }),
          prisma.asaasTransfer.aggregate({
            where: { status: 'DONE', transferDate: { gte: start, lte: end } },
            _sum: { value: true },
          }),
          prisma.expense.aggregate({
            where: { date: { gte: start, lte: end } },
            _sum: { value: true },
          }),
        ])
        return {
          monthIndex,
          entradas: Number(entradasAgg._sum.value ?? 0),
          saidas: Number(transfersAgg._sum.value ?? 0) + Number(expensesAgg._sum.value ?? 0),
        }
      }),
    ),
  ])

  const cashflow = perMonth.map((m) => ({ month: ptMonths[m.monthIndex], entradas: m.entradas, saidas: m.saidas }))
  const receitaMedia = perMonth.map((m) => ({
    month: ptMonths[m.monthIndex],
    value: activeCount > 0 ? m.entradas / activeCount : 0,
  }))

  return { cashflow, receitaMedia }
}

export default async function FinanceiroPage({ searchParams }: PageProps) {
  const session = await requireSession()
  // Guard de papel + grant de espaço (lista personalizada 'dá' acesso — QA D2)
  if (session.role !== 'ADMIN' && !(await hasSpaceGrant(session.userId, 'administrativo.financeiro'))) redirect('/cockpit')

  const params = await searchParams

  // Range normalizado no fuso America/Sao_Paulo: ambos os limites saem de
  // ano/mês/dia-parede SP (evita defaults em fuso local e searchParams caindo em
  // UTC). `to` é EXCLUSIVO — início do dia SEGUINTE ao fim do período.
  const todayStr = saoPauloDateString()             // 'YYYY-MM-DD' em SP
  const [y, m]   = todayStr.split('-').map(Number)
  const nextY    = m === 12 ? y + 1 : y
  const nextM    = m === 12 ? 1 : m + 1

  const from = saoPauloDayStart(params.from ?? `${todayStr.slice(0, 7)}-01`)
  const to   = params.to
    ? new Date(saoPauloDayStart(params.to).getTime() + 86_400_000) // dia seguinte ao fim selecionado
    : saoPauloDayStart(`${nextY}-${String(nextM).padStart(2, '0')}-01`)

  const [data, { cashflow, receitaMedia }, overdueInvoices, clientsWithoutBilling, lastSyncAgg] = await Promise.all([
    getFinanceiroData(from, to),
    getCashflowData(),
    getOverdueInvoices(session.role),
    getClientsWithoutBilling(session.role),
    prisma.asaasPayment.aggregate({ _max: { syncedAt: true } }),
  ])

  const lastAsaasSync = lastSyncAgg._max.syncedAt
  // Sync travada: passou de 26h sem sincronizar (o cron diário roda 1x/dia).
  // A DRE fica desatualizada em silêncio se o Asaas parar — por isso alertamos.
  const asaasStaleHours = lastAsaasSync
    ? (Date.now() - new Date(lastAsaasSync).getTime()) / 3_600_000
    : null
  const asaasStale = asaasStaleHours != null && asaasStaleHours > 26
  const asaasStaleDias = asaasStaleHours != null ? Math.floor(asaasStaleHours / 24) : 0

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#EBEBEB]">DRE — Financeiro</h1>
          <p className="text-sm text-[#87919E] mt-0.5">Demonstrativo de resultado da agência</p>
          <p className={`text-xs mt-1 flex items-center gap-1.5 ${lastAsaasSync && !asaasStale ? 'text-[#87919E]' : 'text-[#EF4444]'}`}>
            <Clock size={11} />
            {lastAsaasSync
              ? `Sincronizado com o Asaas em ${formatSaoPauloDateTime(new Date(lastAsaasSync))}`
              : 'Asaas nunca sincronizado'}
          </p>
          {asaasStale && (
            <p className="text-xs mt-1 flex items-center gap-1.5 text-[#EF4444] font-semibold">
              ⚠ Sincronização travada {asaasStaleDias >= 1 ? `há ${asaasStaleDias} dia(s)` : 'há mais de 26h'} — a DRE pode estar desatualizada. Clique em “Sincronizar” ou verifique a integração do Asaas.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ExpenseLaunchButton />
          <SyncAsaasButton />
        </div>
      </div>

      {/* Period selector */}
      <Suspense>
        <PeriodSelector />
      </Suspense>

      {/* FIN-19 — Inadimplência: fila de cobrança + ativos sem cobrança */}
      <InadimplenciaFila overdue={overdueInvoices} withoutBilling={clientsWithoutBilling} />

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
          label="Lucro"
          value={data.lucro}
          delta={data.deltaLucro}
          colorScheme={data.lucro >= 0 ? 'green' : 'red'}
          icon={<DollarSign size={14} />}
        />
        <FinanceiroKpiCard
          label="Margem de lucro"
          value={data.margem}
          format="percent"
          colorScheme={data.margem >= 0 ? 'green' : 'red'}
          icon={<Percent size={14} />}
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
