import { Suspense } from 'react'
import { requireSession, getOverdueInvoices, getClientsWithoutBilling, getDreTotals, countInadimplentes } from '@/lib/dal'
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
import { saoPauloDateString, formatSaoPauloDateTime } from '@/lib/utils'
import { spDayInfo, spUtcMidnight } from '@/lib/metas/pace'
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
//
// A-112 (decisão P8=B, 2026-07-17): `fullAccess` = viewer é ADMIN. Usuário com
// GRANT de espaço (hasSpaceGrant) recebe VISÃO RESUMIDA/somente-leitura: vê os
// AGREGADOS da agência (DRE total, previstas, MRR, inadimplência agregada), mas
// NÃO o breakdown por cliente/contrato — sem "principais entradas/saídas", sem
// distribuição de entradas por cliente e sem a fila de inadimplência nominal.
// Interpretação conservadora registrada no DOSSIE §15 para o Marcos validar.
async function getFinanceiroData(from: Date, to: Date, fullAccess: boolean) {
  // A-116: "hoje" = 00:00Z do dia-parede SP. Alinha a fila de vencidos
  // (getOverdueInvoices) e os KPIs de inadimplência/previstos ao MESMO boundary
  // — as colunas de data financeiras são `@db.Date` (voltam 00:00Z).
  const today = spDayInfo().spDayStartUtc

  // A-115: DRE canônico único (getDreTotals) — entradas netValue, saídas =
  // Expense + asaasTransfer(DONE). A-114: inadimplentes = clientes distintos.
  const [
    dre, clientesInadimplentes,
    transfers, manualExpenses,
    subscriptions, allClients,
    inadimplenciaAgg, entradasPrevAgg, saidasPrevAgg,
    // Só em acesso pleno (ADMIN): breakdown por cliente / movimentações.
    payments, topTransfers,
  ] = await Promise.all([
    getDreTotals(from, to),
    countInadimplentes(),
    // Saídas automáticas via sync Asaas (transferências PIX/TED já pagas) — por CATEGORIA
    prisma.asaasTransfer.findMany({
      where: { status: 'DONE', transferDate: { gte: from, lt: to } },
      include: { category: { select: { name: true, color: true } } },
      orderBy: { value: 'desc' },
    }),
    // Saídas manuais lançadas pelo usuário (salários, impostos, etc.) — por CATEGORIA
    prisma.expense.findMany({
      where: { date: { gte: from, lt: to } },
      orderBy: { value: 'desc' },
    }),
    prisma.asaasSubscription.findMany({ where: { status: 'ACTIVE' } }),
    prisma.client.findMany({ where: { status: 'ACTIVE' }, select: { id: true, contractStart: true } }),
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
    fullAccess
      ? prisma.asaasPayment.findMany({
          where: { status: { in: ['RECEIVED', 'CONFIRMED'] }, paymentDate: { gte: from, lt: to } },
          include: {
            customer: {
              select: { name: true, client: { select: { name: true, razaoSocial: true } } },
            },
          },
          orderBy: { value: 'desc' },
        })
      : Promise.resolve([] as never[]),
    fullAccess
      ? prisma.asaasTransfer.findMany({
          where: { status: 'DONE', transferDate: { gte: from, lt: to } },
          include: { category: { select: { name: true, color: true } } },
          orderBy: { value: 'desc' },
          take: 10,
        })
      : Promise.resolve([] as never[]),
  ])

  const { entradas, saidas, lucro, margem, prevEntradas, prevSaidas, prevLucro,
    deltaEntradas, deltaSaidas, deltaLucro } = dre

  const receitaRecorrente = subscriptions.reduce((s, sub) => {
    const v = Number(sub.value)
    if (sub.cycle === 'YEARLY')    return s + v / 12
    if (sub.cycle === 'QUARTERLY') return s + v / 3
    if (sub.cycle === 'WEEKLY')    return s + v * 4.33
    return s + v
  }, 0)

  const clientesRecorrentes = subscriptions.length
  const inadimplenciaValue  = Number(inadimplenciaAgg._sum.value ?? 0)

  const tempoMedioMeses = allClients.reduce((sum, c) => {
    if (!c.contractStart) return sum
    return sum + (today.getTime() - new Date(c.contractStart).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  }, 0) / (allClients.length || 1)

  const receitaMedia = clientesRecorrentes > 0 ? receitaRecorrente / clientesRecorrentes : 0
  const ltv          = receitaMedia * Math.max(tempoMedioMeses, 1)

  // Distribuição entradas por cliente (top clientes) — SÓ em acesso pleno.
  const entradaMap = new Map<string, number>()
  for (const p of payments) {
    const linked = p.customer?.client
    const k = linked
      ? (linked.razaoSocial ? `${linked.name} — ${linked.razaoSocial}` : linked.name)
      : `${p.customer?.name ?? 'Sem cliente'} (sem vínculo)`
    entradaMap.set(k, (entradaMap.get(k) ?? 0) + Number(p.netValue ?? p.value))
  }
  const distribuicaoEntradas = fullAccess
    ? Array.from(entradaMap.entries())
        .sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([name, value]) => ({ name, value }))
    : []

  // Distribuição saídas por CATEGORIA (não expõe cliente) — visível a todos.
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

  const allSaidas = fullAccess
    ? [
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
    : []

  return {
    entradas, saidas, lucro, margem,
    prevEntradas, prevSaidas, prevLucro,
    deltaEntradas, deltaSaidas, deltaLucro,
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
    topEntradas: fullAccess
      ? payments.slice(0, 10).map(p => {
          const linked = p.customer?.client
          return {
            name: linked?.name ?? p.customer?.name ?? 'Sem cliente',
            razaoSocial: linked?.razaoSocial ?? null,
            unlinked: !linked,
            description: p.description ?? undefined,
            value: Number(p.value),
          }
        })
      : [],
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

  // A-112 (P8=B): acesso pleno só para ADMIN. Quem chega por grant vê a página
  // em modo RESUMIDO/somente-leitura — agregados sim, breakdown por cliente não,
  // botões de mutação escondidos (as APIs de mutação seguem ADMIN-only, A-113).
  const fullAccess = session.role === 'ADMIN'

  const params = await searchParams

  // Range normalizado no fuso America/Sao_Paulo: ambos os limites saem de
  // ano/mês/dia-parede SP (evita defaults em fuso local e searchParams caindo em
  // UTC). `to` é EXCLUSIVO — início do dia SEGUINTE ao fim do período.
  const todayStr = saoPauloDateString()             // 'YYYY-MM-DD' em SP
  const [y, m]   = todayStr.split('-').map(Number)
  const nextY    = m === 12 ? y + 1 : y
  const nextM    = m === 12 ? 1 : m + 1

  const from = spUtcMidnight(params.from ?? `${todayStr.slice(0, 7)}-01`)
  const to   = params.to
    ? new Date(spUtcMidnight(params.to).getTime() + 86_400_000) // dia seguinte ao fim selecionado
    : spUtcMidnight(`${nextY}-${String(nextM).padStart(2, '0')}-01`)

  const [data, { cashflow, receitaMedia }, overdueInvoices, clientsWithoutBilling, lastSyncAgg] = await Promise.all([
    getFinanceiroData(from, to, fullAccess),
    getCashflowData(),
    // Fila nominal de vencidos + ativos sem cobrança: breakdown por cliente →
    // só em acesso pleno (A-112). No modo resumido não buscamos os nomes.
    fullAccess ? getOverdueInvoices(session.role) : Promise.resolve([]),
    fullAccess ? getClientsWithoutBilling(session.role) : Promise.resolve([]),
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
        {/* A-112/A-113: mutações (lançar despesa / sincronizar) só ADMIN. */}
        {fullAccess && (
          <div className="flex items-center gap-2">
            <ExpenseLaunchButton />
            <SyncAsaasButton />
          </div>
        )}
      </div>

      {/* A-112: aviso de visão resumida para acesso via grant (não-ADMIN). */}
      {!fullAccess && (
        <div className="flex items-start gap-2 rounded-xl border border-[#38435C] bg-[#0D2137] px-4 py-3 text-sm text-[#95BBE2]">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <p>
            <span className="font-semibold text-[#EBEBEB]">Visão resumida.</span>{' '}
            Você vê os totais da agência (somente leitura). O detalhamento por
            cliente, a fila de inadimplência nominal e o lançamento de despesas
            são restritos ao administrador.
          </p>
        </div>
      )}

      {/* Period selector */}
      <Suspense>
        <PeriodSelector />
      </Suspense>

      {/* FIN-19 — Inadimplência nominal por cliente: só em acesso pleno (A-112) */}
      {fullAccess && (
        <InadimplenciaFila overdue={overdueInvoices} withoutBilling={clientsWithoutBilling} />
      )}

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

      {/* Donut row — "Distribuição de entradas" expõe TOP CLIENTES: só ADMIN (A-112).
          "Distribuição de saídas" é por categoria (agregado): visível a todos. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fullAccess && (
          <DistribuicaoDonut title="Distribuição de entradas" data={data.distribuicaoEntradas} />
        )}
        <DistribuicaoDonut title="Distribuição de saídas" data={data.distribuicaoSaidas} />
      </div>

      {/* Tables row — movimentações nominais por cliente/fornecedor: só ADMIN (A-112). */}
      {fullAccess && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MovimentacoesTable title="Principais entradas" rows={data.topEntradas} type="entrada" />
          <MovimentacoesTable title="Principais saídas"   rows={data.topSaidas}   type="saida" />
        </div>
      )}
    </div>
  )
}
