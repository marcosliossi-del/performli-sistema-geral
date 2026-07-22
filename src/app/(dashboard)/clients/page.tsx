import { Users, AlertTriangle, UserMinus, UserPlus, DollarSign, TrendingUp, PauseCircle, Clock, TrendingDown } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireSession, countInadimplentes, getChurnLtvStats } from '@/lib/dal'
import { formatCurrency } from '@/lib/utils'
import { ClientesTable } from '@/components/clientes/ClientesTable'
import { RecalcularTudoButton } from '@/components/clients/RecalcularTudoButton'
import { normalizeRole, scopeClients } from '@/lib/rbac'
import { spDayInfo } from '@/lib/metas/pace'

export const dynamic = 'force-dynamic'

// Classificação comercial (print do Marcos): OURO/PRATA/BRONZE derivam da CURVA
// existente (A/B/C) — não há campo dedicado no schema. Mapeamento único aqui
// (lacuna documentada no DOSSIE §15). Se o Marcos quiser desacoplar de curva,
// vira migration aditiva `classificacao`.
const CURVA_TO_CLASSIFICACAO: Record<string, 'OURO' | 'PRATA' | 'BRONZE'> = {
  A: 'OURO',
  B: 'PRATA',
  C: 'BRONZE',
}

const MS_DIA = 86_400_000

async function getClientesData(userId: string, role: string) {
  // Posse (CLAUDE.md #2): staff amplo vê toda a carteira; só GESTOR_TRAFEGO fica
  // restrito aos clientes atribuídos (scopeClients).
  const viewerRole = normalizeRole(role)
  const isAdmin = viewerRole === 'ADMIN'
  const where = scopeClients(viewerRole, userId)

  const now        = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const prevStart  = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevEnd    = new Date(now.getFullYear(), now.getMonth(), 0)

  const [clients, prevNewCount, overdueCount, staffRaw] = await Promise.all([
    prisma.client.findMany({
      where,
      select: {
        id: true, name: true, razaoSocial: true, slug: true, source: true, phone: true,
        email: true, status: true, pausedAt: true, pauseReason: true,
        contractValue: true, createdAt: true,
        businessType: true,
        resultado: true, etapa: true, resultadoRoas: true, resultadoUpdatedAt: true,
        nps: true, relacionamento: true, curva: true,
        // Fatia FUNDACAO (tela Clientes / print Marcos):
        produtos: true,
        investimentoMeta: true, investimentoGoogle: true, investimentoTiktok: true, roasMinimo: true,
        // Fallback de contrato (cache do cadastro) quando NÃO há Contract vigente
        contractStart: true, contractEndDate: true, feeAmount: true,
        // Contrato vigente do Jurídico = FONTE ÚNICA de período + valor.
        // status VIGENTE ou RENOVACAO; mais recente pelo início. Sem N+1: include
        // batelado numa única query.
        contracts: {
          where:   { status: { in: ['VIGENTE', 'RENOVACAO'] } },
          orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
          take:    1,
          select:  { startDate: true, endDate: true, feeValue: true, status: true },
        },
        // Plataformas ATIVAS (badges) — fonte de verdade é PlatformAccount.
        platformAccounts: {
          where:  { active: true },
          select: { platform: true },
        },
        // Responsável = assignment primário; fallback para gestor direto.
        assignments: {
          where:  { isPrimary: true },
          take:   1,
          select: { userId: true, user: { select: { name: true } } },
        },
        gestor: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.client.count({
      where: { ...where, createdAt: { gte: prevStart, lte: prevEnd } },
    }),
    // Inadimplência (Asaas) é dado financeiro/receita da agência: SÓ ADMIN.
    // Para os demais papéis o contador fica em 0 (não vaza financeiro).
    // A-114 (P9=B): CLIENTES DISTINTOS vencidos (dueDate<=hoje) — fonte única
    // compartilhada com /financeiro e o summary (antes /clients contava
    // FATURAS e divergia da /financeiro).
    isAdmin
      ? countInadimplentes()
      : Promise.resolve(0),
    // Staff atribuível como gestor primário (mesma régua da tela de Atribuição):
    // usuários ativos gestores/admin. Usado só pelo select de Responsável (ADMIN).
    isAdmin
      ? prisma.user.findMany({
          where:   { active: true, role: { in: ['ADMIN', 'GESTOR_TRAFEGO', 'MANAGER'] } },
          select:  { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
  ])

  // PAUSED é contado À PARTE (T-23): não infla os ativos nem vira churn — é um
  // terceiro estado (cliente temporariamente sem operação, contrato intacto).
  const active   = clients.filter(c => c.status === 'ACTIVE')
  const paused   = clients.filter(c => c.status === 'PAUSED')
  const churned  = clients.filter(c => c.status === 'CHURNED')
  const newMonth = clients.filter(c => c.createdAt >= monthStart)

  // Receita/fee da agência (contractValue) é financeiro: só ADMIN vê valores.
  const recorrente  = isAdmin ? active.reduce((s, c) => s + Number(c.contractValue ?? 0), 0) : 0
  const comContrato = active.filter(c => c.contractValue).length
  const mediaReceita = isAdmin && comContrato > 0 ? recorrente / comContrato : 0

  const deltaNew = prevNewCount > 0
    ? Math.round(((newMonth.length - prevNewCount) / prevNewCount) * 100)
    : 0

  // Dia-parede SP (fonte única de "hoje" para vencimento) — evita off-by-one por
  // fuso do servidor. Contract.endDate é @db.Date (midnight UTC).
  const { spDayStartUtc } = spDayInfo(now)
  const hojeUtc = spDayStartUtc.getTime()

  // Somatórios do rodapé (financeiro → só ADMIN). Somamos o valor JÁ RESOLVIDO
  // (contrato vigente com fallback), não o cache bruto, p/ bater com a coluna.
  let somaContrato   = 0
  let somaInvestimento = 0
  let somaInvestMeta   = 0
  let somaInvestGoogle = 0
  let somaInvestTiktok = 0

  const rows = clients.map(c => {
    // ── Amarração Jurídico: contrato vigente é a fonte única de período+valor ──
    const vigente = c.contracts[0] ?? null
    const fonteContrato: 'juridico' | 'cadastro' = vigente ? 'juridico' : 'cadastro'

    const periodoInicio = vigente?.startDate ?? c.contractStart ?? null
    const periodoFim    = vigente?.endDate   ?? c.contractEndDate ?? null

    // Valor: fee do contrato vigente; fallback cache do cadastro (feeAmount →
    // contractValue). Financeiro: só ADMIN vê números.
    const valorContratoRaw =
      vigente?.feeValue ?? c.feeAmount ?? c.contractValue ?? null
    const valorContrato = isAdmin && valorContratoRaw != null ? Number(valorContratoRaw) : null

    // Investimento em anúncios = soma das metas de investimento por plataforma
    // (campos existentes investimentoMeta/Google/Tiktok). Financeiro: só ADMIN.
    const invSoma =
      Number(c.investimentoMeta ?? 0) +
      Number(c.investimentoGoogle ?? 0) +
      Number(c.investimentoTiktok ?? 0)
    const investimento = isAdmin ? (invSoma > 0 ? invSoma : null) : null

    // Vencimento (dia-parede SP): vencido = fim < hoje; alerta se vence em <30d.
    let vencido = false
    let venceEmDias: number | null = null
    if (periodoFim) {
      const fimUtc = periodoFim.getTime()
      const dias = Math.round((fimUtc - hojeUtc) / MS_DIA)
      venceEmDias = dias
      vencido = dias < 0
    }

    // "Em renovação" = DERIVADO do Contract vigente (Jurídico), NUNCA status do
    // seletor nem campo no Client (regra 0 DADO AMARRADO). Cobre DOIS casos:
    //  (a) Contract com status RENOVACAO (marcado pelo cron/Jurídico), e
    //  (b) Contract VIGENTE já VENCIDO (endDate < dia-parede SP) — sem depender do
    //      cron rodar. Só quando a fonte é o Jurídico (cadastro sem contrato não
    //      "renova"). Vira badge na coluna Período E rótulo âmbar na pill de status.
    const emRenovacao =
      fonteContrato === 'juridico' && (vigente!.status === 'RENOVACAO' || vencido)

    if (isAdmin) {
      if (valorContrato) somaContrato += valorContrato
      if (investimento)  somaInvestimento += investimento
      somaInvestMeta   += Number(c.investimentoMeta   ?? 0)
      somaInvestGoogle += Number(c.investimentoGoogle ?? 0)
      somaInvestTiktok += Number(c.investimentoTiktok ?? 0)
    }

    return {
      id:            c.id,
      name:          c.name,
      razaoSocial:   c.razaoSocial,
      slug:          c.slug,
      phone:         c.phone,
      email:         c.email,
      status:        c.status,
      pausedAt:      c.pausedAt ? c.pausedAt.toISOString() : null,
      pauseReason:   c.pauseReason ?? null,
      createdAt:     c.createdAt.toISOString(),
      businessType:  c.businessType,
      // Tipo de serviço: primeiro produto cadastrado; sem produtos → rótulo padrão
      // "Gestão de Tráfego" (não há campo dedicado — lacuna documentada).
      tipoServico:   c.produtos.length > 0 ? c.produtos.join(' · ') : 'Gestão de Tráfego',
      // Lista bruta de produtos (fonte da edição inline de Tipo de Serviço).
      produtos:      c.produtos,
      classificacao: c.curva ? CURVA_TO_CLASSIFICACAO[c.curva] ?? null : null,
      // Curva canônica (A/B/C) — a edição da classificação escreve AQUI, não num
      // campo paralelo (regra 0 DADO AMARRADO).
      curva:         c.curva ?? null,
      periodoInicio: periodoInicio ? periodoInicio.toISOString() : null,
      periodoFim:    periodoFim ? periodoFim.toISOString() : null,
      fonteContrato,
      emRenovacao,
      vencido,
      venceEmDias,
      plataformas:   c.platformAccounts.map(p => p.platform),
      responsavel:   c.assignments[0]?.user?.name ?? c.gestor?.name ?? null,
      // Id do gestor primário (assignment) p/ o select — fallback gestorId direto.
      responsavelId: c.assignments[0]?.userId ?? c.gestor?.id ?? null,
      investimento,
      // Breakdown do budget por plataforma (print Marcos): 4 colunas. Financeiro
      // → só ADMIN vê valores; para os demais mandamos null (a UI mostra "—").
      investimentoMeta:   isAdmin ? (c.investimentoMeta   != null ? Number(c.investimentoMeta)   : null) : null,
      investimentoGoogle: isAdmin ? (c.investimentoGoogle != null ? Number(c.investimentoGoogle) : null) : null,
      investimentoTiktok: isAdmin ? (c.investimentoTiktok != null ? Number(c.investimentoTiktok) : null) : null,
      roasMinimo:         c.roasMinimo != null ? Number(c.roasMinimo) : null,
      contractValue: valorContrato,
    }
  })

  return {
    clients: rows,
    staff: staffRaw,
    totals: {
      count:            rows.length,
      somaContrato:     isAdmin ? somaContrato : null,
      somaInvestimento: isAdmin ? somaInvestimento : null,
      somaInvestMeta:   isAdmin ? somaInvestMeta : null,
      somaInvestGoogle: isAdmin ? somaInvestGoogle : null,
      somaInvestTiktok: isAdmin ? somaInvestTiktok : null,
    },
    kpis: {
      recorrentes:       active.length,
      pausados:          paused.length,
      inadimplentes:     overdueCount,
      cancelados:        churned.length,
      novos:             newMonth.length,
      deltaNew,
      receitaMedia:      mediaReceita,
      receitaRecorrente: recorrente,
    },
  }
}

export default async function ClientsPage() {
  const session = await requireSession()
  const { clients, staff, kpis, totals } = await getClientesData(session.userId, session.role)
  const viewerRole = normalizeRole(session.role)
  const isAdmin = viewerRole === 'ADMIN'
  // LTV/tempo-de-casa/churn são dados estratégicos-financeiros: mesmo recorte de
  // papel de "receita média/recorrente" (só ADMIN). Fora do ADMIN, nem consulta.
  const churnLtv = isAdmin ? await getChurnLtvStats() : null
  // Editar status (inline + massa) é ação estrutural: só ADMIN e SUPERVISOR.
  // Espelha o gate da action updateClientsStatus (defesa em profundidade na UI).
  const canEditStatus = viewerRole === 'ADMIN' || viewerRole === 'SUPERVISOR_TRAFEGO'
  // Editar campos do Client (nome/serviço/classificação/modelo/ROAS) inline: staff
  // de tráfego (ADMIN, SUPERVISOR, ANALISTA e GESTOR nos clientes atribuídos —
  // a lista já vem escopada). CS/leitura não editam. Espelha assertClientMutationAccess.
  const canEditFields =
    viewerRole === 'ADMIN' ||
    viewerRole === 'SUPERVISOR_TRAFEGO' ||
    viewerRole === 'ANALISTA_TRAFEGO' ||
    viewerRole === 'GESTOR_TRAFEGO'

  const cards = [
    {
      label: 'Clientes recorrentes',
      value: String(kpis.recorrentes),
      icon:  Users,
      color: '#22C55E',
      sub:   'Ativos na carteira hoje',
    },
    {
      label: 'Clientes inadimplentes',
      value: isAdmin ? String(kpis.inadimplentes) : '—',
      icon:  AlertTriangle,
      color: '#EF4444',
      sub:   isAdmin ? 'Clientes com fatura vencida no Asaas' : 'Restrito ao administrador',
    },
    {
      label: 'Clientes pausados',
      value: String(kpis.pausados),
      icon:  PauseCircle,
      color: '#F59E0B',
      sub:   'Operação em pausa · contrato ativo',
    },
    {
      label: 'Clientes cancelados',
      value: String(kpis.cancelados),
      icon:  UserMinus,
      color: '#EF4444',
      sub:   'Já saíram da carteira',
    },
    {
      label: 'Novos clientes',
      value: String(kpis.novos),
      icon:  UserPlus,
      color: '#22C55E',
      sub:   `Este mês · ${kpis.deltaNew >= 0 ? '+' : ''}${kpis.deltaNew}% vs. mês anterior`,
    },
    {
      label: 'Receita média por cliente',
      value: formatCurrency(kpis.receitaMedia),
      icon:  DollarSign,
      color: '#22C55E',
      sub:   'Média dos contratos ativos',
    },
    {
      label: 'Receita recorrente',
      value: formatCurrency(kpis.receitaRecorrente),
      icon:  TrendingUp,
      color: '#22C55E',
      sub:   'Soma dos contratos ativos',
    },
    // ── LTV / tempo de casa (média dos cancelados) — só ADMIN ──────────────────
    {
      label: 'Tempo de casa · LTV médio',
      value: !isAdmin
        ? '—'
        : churnLtv?.avgTenureAtivosMonths != null
          ? `${churnLtv.avgTenureAtivosMonths.toFixed(1).replace('.', ',')} meses (base ativa)`
          : 'Sem histórico',
      icon:  Clock,
      color: '#54e0ee',
      sub:   !isAdmin
        ? 'Restrito ao administrador'
        : churnLtv && churnLtv.baseComputados > 0
          ? `Cancelados saíram com ${churnLtv.avgTenureMonths != null ? `${churnLtv.avgTenureMonths.toFixed(1).replace('.', ',')} meses` : '—'} · LTV ${churnLtv.avgLtv != null ? `${formatCurrency(churnLtv.avgLtv)} (${churnLtv.baseLtv} com valor)` : '—'}`
          : 'Nenhum cancelado com data de saída confiável ainda',
    },
    // ── Taxa de churn (12 meses) — só ADMIN ────────────────────────────────────
    {
      label: 'Taxa de churn (12 meses)',
      value: !isAdmin
        ? '—'
        : churnLtv?.churnRate12m != null
          ? `${churnLtv.churnRate12m.toFixed(1).replace('.', ',')}%`
          : '—',
      icon:  TrendingDown,
      color: '#EF4444',
      sub:   !isAdmin
        ? 'Restrito ao administrador'
        : churnLtv
          ? `${churnLtv.cancelados12m} cancelamento${churnLtv.cancelados12m === 1 ? '' : 's'} em 12 meses · sobre ${churnLtv.ativosHoje + churnLtv.cancelados12m} clientes da base`
          : '',
    },
  ]

  return (
    <div className="flex flex-col gap-5 p-5 min-h-screen">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#EBEBEB]">Clientes</h1>
          <p className="text-sm text-[#87919E] mt-0.5">Gestão de carteira de clientes</p>
        </div>
        {isAdmin && <RecalcularTudoButton />}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map(card => (
          <div key={card.label} className="bg-[#0D2137] border border-[#38435C] rounded-2xl p-4">
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs text-[#87919E] leading-tight max-w-[130px]">{card.label}</p>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `${card.color}18` }}
              >
                <card.icon size={15} style={{ color: card.color }} />
              </div>
            </div>
            <p className="text-2xl font-bold text-[#EBEBEB]">{card.value}</p>
            <p className="text-[11px] text-[#87919E] mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <ClientesTable
        clients={clients}
        totals={totals}
        isAdmin={isAdmin}
        canEditStatus={canEditStatus}
        canEditFields={canEditFields}
        staff={staff}
      />
    </div>
  )
}
