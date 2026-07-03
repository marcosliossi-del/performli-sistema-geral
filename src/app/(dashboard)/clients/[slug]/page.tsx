import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import {
  requireSession, getClientDetail, getClientMetricHistory,
  getClientKPIs, getGoalPaceMetrics, getClientChat, getClientWeeklyReport,
  getClientMonthlyReport,
  getClientCampaigns, getLatestCampaignInsight, metricLabels,
  getClientDailyRevenue, getClientMonthlyComparison, getClientInteractions,
  getHealthScoreHistory, getWeekScoreComparison, getClientSalesFunnel,
  getClienteTarefas, getWeeklyReportFunnel,
} from '@/lib/dal'
import type { ClienteTarefas, ClienteTarefaRow } from '@/lib/dal'
import { normalizeRole } from '@/lib/rbac'
import {
  STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS, label as opLabel,
} from '@/components/operacional/labels'
import { ListTodo } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardValue } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { healthLabels, healthBgClasses } from '@/lib/health'
import { HealthStatus } from '@prisma/client'
import { formatCurrency, formatNumber, timeAgo, getWeekRange, getMonthRange } from '@/lib/utils'
import { deriveOverallStatus } from '@/lib/health-derive'
import { getRealizadoForMetrics } from '@/lib/metas/realizado'
import { ArrowLeft, Target, BookOpen, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { ClientContractCard } from '@/components/clients/ClientContractCard'
import { GoalFormModal } from '@/components/clients/GoalFormModal'
import { SyncButton } from '@/components/clients/SyncButton'
import { LinkAccountModal } from '@/components/clients/LinkAccountModal'
import { LinkGA4Modal } from '@/components/clients/LinkGA4Modal'
import { MetaSyncButton } from '@/components/clients/MetaSyncButton'
import { GA4SyncButton } from '@/components/clients/GA4SyncButton'
import { GoogleAdsSyncButton } from '@/components/clients/GoogleAdsSyncButton'
import { LinkGoogleAdsModal } from '@/components/clients/LinkGoogleAdsModal'
import { MetricsChartsGrid } from '@/components/clients/MetricsChartsGrid'
import { DateRangePicker } from '@/components/clients/DateRangePicker'
import { ClientChatPanel } from '@/components/clients/ClientChatPanel'
import { WeeklyReportCard } from '@/components/clients/WeeklyReportCard'
import { WeeklyReportFunnel } from '@/components/clients/WeeklyReportFunnel'
import { MonthlyReportCard } from '@/components/clients/MonthlyReportCard'
import { ExportPdfButton } from '@/components/clients/ExportPdfButton'
import { GoalPaceCard } from '@/components/clients/GoalPaceCard'
import { KPIDiagnosticCard } from '@/components/clients/KPIDiagnosticCard'
import { CampaignBreakdownTable } from '@/components/clients/CampaignBreakdownTable'
import { CampaignInsightCard } from '@/components/clients/CampaignInsightCard'
import { RevenuePaceChart } from '@/components/clients/RevenuePaceChart'
import { MonthlyComparisonChart } from '@/components/clients/MonthlyComparisonChart'
import { InteractionTimeline } from '@/components/clients/InteractionTimeline'
import { EditClientButton } from '@/components/clients/ClientHeader'
import { PlanoAcaoPanel } from '@/components/clients/PlanoAcaoPanel'
import { RemovePlatformButton } from '@/components/clients/RemovePlatformButton'
import { HealthScoreHistoryChart } from '@/components/clients/HealthScoreHistoryChart'
import { PillarBenchmarkPanel } from '@/components/clients/PillarBenchmarkPanel'
import { WeekComparisonTable } from '@/components/clients/WeekComparisonTable'
import { LocalBusinessKPISection } from '@/components/clients/LocalBusinessKPISection'
import { SalesFunnelSection } from '@/components/clients/SalesFunnelSection'
import { FichaCsPanel } from '@/components/clients/FichaCsPanel'
import { CheckinReportPanel } from '@/components/clients/CheckinReportPanel'
import { ClientSectionNav, type ClientSectionAnchor } from '@/components/clients/ClientSectionNav'

const platformColors: Record<string, string> = {
  META_ADS: '#1877F2',
  GOOGLE_ADS: '#4285F4',
  GA4: '#E37400',
}
const platformNames: Record<string, string> = {
  META_ADS: 'Meta Ads',
  GOOGLE_ADS: 'Google Ads',
  GA4: 'GA4',
}

function TrendBadge({ value, lowerIsBetter = false }: { value: number | null; lowerIsBetter?: boolean }) {
  if (value === null) return null
  const isGood = lowerIsBetter ? value < 0 : value > 0
  const neutral = Math.abs(value) < 1
  if (neutral) return (
    <span className="flex items-center gap-0.5 text-[10px] text-[#87919E]">
      <Minus size={10} /> 0%
    </span>
  )
  return (
    <span className={`flex items-center gap-0.5 text-[10px] font-medium ${isGood ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
      {isGood ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {value > 0 ? '+' : ''}{Math.round(value)}%
    </span>
  )
}

function KpiCard({
  label, value, trend, lowerIsBetter = false, sub,
}: {
  label: string; value: string; trend?: number | null; lowerIsBetter?: boolean; sub?: string
}) {
  return (
    <div className="bg-[#0A1E2C] border border-[#38435C] rounded-xl p-4">
      <p className="text-[10px] font-medium text-[#87919E] uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-bold text-[#EBEBEB] leading-tight">{value}</p>
      <div className="flex items-center gap-1.5 mt-1">
        {trend !== undefined && <TrendBadge value={trend ?? null} lowerIsBetter={lowerIsBetter} />}
        {sub && <span className="text-[10px] text-[#87919E]">{sub}</span>}
      </div>
    </div>
  )
}

function goalValueFormat(metric: string, value: number) {
  const currency = ['INVESTMENT', 'SPEND', 'CPL', 'CPA', 'CAC', 'CPC', 'FATURAMENTO', 'TICKET_MEDIO', 'CPS', 'CPM']
  const pct = ['CTR', 'TAXA_CONVERSAO']
  const xRate = ['ROAS']
  if (currency.includes(metric)) return formatCurrency(value)
  if (pct.includes(metric)) return `${value.toFixed(2)}%`
  if (xRate.includes(metric)) return `${value.toFixed(2)}x`
  return formatNumber(value, 0)
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { slug } = await params
  const { from, to } = await searchParams
  const session = await requireSession()
  const client = await getClientDetail(slug, { userId: session.userId, role: session.role })
  if (!client) notFound()

  // Default: 1st of current month → yesterday
  const today = new Date()
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  const defaultTo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).toISOString().split('T')[0]
  const activeFrom = from ?? defaultFrom
  const activeTo = to ?? defaultTo

  const [metricHistory, kpis, paceGoals, chat, weeklyReport, reportFunnel, monthlyReport, campaigns, campaignInsight, dailyRevenue, monthlyComparison, interactions, healthHistory, weekComparison, salesFunnel, activeContract, clienteTarefas, resultadoInfo, checkinInfo] = await Promise.all([
    getClientMetricHistory(client.id, 14),
    getClientKPIs(client.id, activeFrom, activeTo),
    getGoalPaceMetrics(client.id),
    getClientChat(client.id),
    getClientWeeklyReport(client.id),
    getWeeklyReportFunnel(client.id, { userId: session.userId, role: session.role }),
    getClientMonthlyReport(client.id),
    getClientCampaigns(client.id, 7),
    getLatestCampaignInsight(client.id),
    getClientDailyRevenue(client.id, activeFrom, activeTo),
    getClientMonthlyComparison(client.id),
    getClientInteractions(client.id),
    getHealthScoreHistory(client.id, 8),
    getWeekScoreComparison(client.id),
    getClientSalesFunnel(client.id, activeFrom, activeTo),
    prisma.contract.findFirst({
      where:   { clientId: client.id, status: { in: ['VIGENTE', 'RENOVACAO', 'RASCUNHO'] } },
      orderBy: [{ status: 'asc' }, { endDate: 'asc' }],
      select: {
        id: true, status: true, type: true,
        feeValue: true, setupFee: true,
        startDate: true, endDate: true, signedAt: true,
        documentUrl: true, autoRenew: true,
        responsible: { select: { name: true } },
      },
    }),
    getClienteTarefas(client.id, session.userId, session.role),
    prisma.client.findUnique({
      where: { id: client.id },
      select: {
        resultado: true, etapa: true, resultadoRoas: true, resultadoUpdatedAt: true,
        nps: true, relacionamento: true, curva: true, feedbackNegativo: true, salaDeGuerra: true, fichaCsUpdatedAt: true,
      },
    }),
    prisma.clientWeeklyCheckin.findFirst({
      where: { clientId: client.id },
      orderBy: { weekStart: 'desc' },
      select: {
        problema: true, oQueFoiFeito: true, resultadoSemana: true,
        proximosPassos: true, pedidosCliente: true, novosSeguidores: true, submittedAt: true,
      },
    }),
  ])

  // Ficha de CS / check-in — staff amplo (ADMIN/CS/SUPERVISOR/ANALISTA) edita
  // qualquer cliente; GESTOR_TRAFEGO só a carteira.
  const viewerRole = normalizeRole(session.role)
  const ownsClient = client.assignments.some((a) => a.user.id === session.userId)
  const canEditFicha = viewerRole !== 'GESTOR_TRAFEGO' || ownsClient
  const canGerarRelatorio = viewerRole !== 'GESTOR_TRAFEGO' || ownsClient

  // Contrato = jurídico/financeiro da AGÊNCIA (fee/valor): SÓ ADMIN. Para os
  // demais papéis o cartão de contrato não recebe dados (stripSensitive → null).
  const contractData = (activeContract && viewerRole === 'ADMIN') ? {
    ...activeContract,
    feeValue:  Number(activeContract.feeValue),
    setupFee:  activeContract.setupFee ? Number(activeContract.setupFee) : null,
    startDate: activeContract.startDate.toISOString(),
    endDate:   activeContract.endDate.toISOString(),
    signedAt:  activeContract.signedAt ? activeContract.signedAt.toISOString() : null,
  } : null

  const weeklyGoals = client.goals.filter((g) => g.period === 'WEEKLY')
  const monthlyGoals = client.goals.filter((g) => g.period === 'MONTHLY')

  // S2-014 — FONTE ÚNICA de "realizado no mês": reusa o realizado MTD já
  // computado por getGoalPaceMetrics (helper src/lib/metas/realizado.ts), a MESMA
  // base de /agency/metas. NÃO usar HealthScore.actualValue aqui (divergia).
  const monthlyRealizadoByMetric = new Map(paceGoals.map((p) => [p.metric, p.actualValue]))

  // Metas da Semana: REALIZADO da fonte única (getRealizado, janela SEMANA_FECHADA),
  // não de HealthScore.actualValue. HealthScore permanece como STATUS.
  const weeklyRealizadoByMetric = await getRealizadoForMetrics(
    client.id,
    weeklyGoals.map((g) => g.metric),
    'SEMANA_FECHADA',
    client.businessType,
  )

  // Régua A (health) — MESMA janela canônica das demais telas (helper único):
  // WEEKLY da semana corrente preferido, fallback MONTHLY do mês. Antes era
  // weekly-only, divergindo do grid/tabela/rollups.
  const { start: pageWeekStart } = getWeekRange()
  const { start: pageMonthStart } = getMonthRange()
  const overallStatus: HealthStatus | null = deriveOverallStatus(
    client.goals.flatMap((g) => g.healthScores),
    pageWeekStart,
    pageMonthStart,
  )

  const STATUS_RANK_PAGE: Record<HealthStatus, number> = { RUIM: 0, REGULAR: 1, OTIMO: 2 }
  const streakStatus = client.statusStreak?.status ?? null
  const streakPrevStatus = client.statusStreak?.prevStatus ?? null
  const headerStatusTrend: 'up' | 'down' | null = (() => {
    if (!streakStatus || !streakPrevStatus) return null
    const diff = STATUS_RANK_PAGE[streakStatus] - STATUS_RANK_PAGE[streakPrevStatus]
    if (diff > 0) return 'up'
    if (diff < 0) return 'down'
    return null
  })()

  const isLocal = client.businessType === 'LOCAL' || client.businessType === 'B2B'
  const hasData = kpis.faturamento > 0 || kpis.investimento > 0 || kpis.sessoes > 0

  const sectionAnchors: ClientSectionAnchor[] = [
    { id: 'sec-visao-geral', label: 'Visão geral' },
    { id: 'sec-metas',       label: 'Metas & Resultado' },
    { id: 'sec-diagnostico', label: 'Histórico & Diagnóstico' },
    { id: 'sec-campanhas',   label: 'Campanhas & Relatórios' },
    { id: 'sec-conversas',   label: 'Conversas & Operações' },
    { id: 'sec-tarefas',     label: 'Tarefas & Plano de Ação' },
    { id: 'sec-crm',         label: 'Interações CRM' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link href="/clients" className="flex items-center gap-1 text-[#87919E] hover:text-[#EBEBEB] text-sm transition-colors">
            <ArrowLeft size={15} />
            Clientes
          </Link>
          <div className="w-px h-4 bg-[#38435C]" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0A1E2C] flex items-center justify-center">
              <span className="text-[#95BBE2] font-bold">{client.name.charAt(0)}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <div>
                  <h1 className="text-xl font-bold text-[#EBEBEB] leading-tight">{client.name}</h1>
                  {client.razaoSocial && (
                    <p className="text-[11px] text-[#647488] leading-tight" title={client.razaoSocial}>
                      {client.razaoSocial}
                    </p>
                  )}
                </div>
                {overallStatus && (
                  <div className="flex items-center gap-0.5">
                    {headerStatusTrend === 'up' && (
                      <span className="text-[#22C55E] text-sm font-bold leading-none">↑</span>
                    )}
                    {headerStatusTrend === 'down' && (
                      <span className="text-[#EF4444] text-sm font-bold leading-none">↓</span>
                    )}
                    <Badge variant={overallStatus.toLowerCase() as 'otimo' | 'regular' | 'ruim'}>
                      {healthLabels[overallStatus]}
                    </Badge>
                  </div>
                )}
              </div>
              <p className="text-[#87919E] text-sm">
                {client.industry ?? '—'}{' '}
                {client.website && <span className="text-[#95BBE2]">· {client.website}</span>}
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <ExportPdfButton />
          <EditClientButton
            client={{
              id: client.id,
              name: client.name,
              razaoSocial: client.razaoSocial ?? null,
              industry: client.industry,
              website: client.website,
              notes: client.notes,
              email: client.email ?? null,
              phone: client.phone ?? null,
              document: client.document ?? null,
              contractValue: client.contractValue != null ? Number(client.contractValue) : null,
              contractStart: client.contractStart ?? null,
              source: client.source ?? null,
              businessType: client.businessType,
              investimentoMeta: client.investimentoMeta != null ? Number(client.investimentoMeta) : null,
              investimentoGoogle: client.investimentoGoogle != null ? Number(client.investimentoGoogle) : null,
              investimentoTiktok: client.investimentoTiktok != null ? Number(client.investimentoTiktok) : null,
              produtos: client.produtos,
            }}
          />
          <SyncButton clientId={client.id} />
          <GoalFormModal clientId={client.id} businessType={client.businessType} />
        </div>
      </div>

      {/* Sub-header sticky — navegação interna por seção */}
      <ClientSectionNav anchors={sectionAnchors} />

      {/* ══ VISÃO GERAL ══ */}
      <section id="sec-visao-geral" className="scroll-mt-24 space-y-6">
      {/* Resultado da semana (automação ROAS/GA4) */}
      {resultadoInfo?.resultado && (
        <ResultadoStrip
          resultado={resultadoInfo.resultado}
          etapa={resultadoInfo.etapa}
          roas={resultadoInfo.resultadoRoas != null ? Number(resultadoInfo.resultadoRoas) : null}
          atualizadoEm={resultadoInfo.resultadoUpdatedAt ? resultadoInfo.resultadoUpdatedAt.toISOString() : null}
        />
      )}

      {/* Ficha de CS — NPS, Relacionamento, Curva, Feedback negativo */}
      <FichaCsPanel
        clientId={client.id}
        canEdit={canEditFicha}
        initial={{
          nps: resultadoInfo?.nps ?? null,
          relacionamento: resultadoInfo?.relacionamento ?? null,
          curva: resultadoInfo?.curva ?? null,
          feedbackNegativo: resultadoInfo?.feedbackNegativo ?? 0,
          salaDeGuerra: resultadoInfo?.salaDeGuerra ?? false,
          atualizadoEm: resultadoInfo?.fichaCsUpdatedAt ? resultadoInfo.fichaCsUpdatedAt.toISOString() : null,
        }}
      />

      {/* Check-in & Relatório do cliente (IA) */}
      <CheckinReportPanel
        clientId={client.id}
        clientSlug={slug}
        canEdit={canGerarRelatorio}
        businessType={client.businessType}
        initial={{
          problema:        checkinInfo?.problema ?? '',
          oQueFoiFeito:    checkinInfo?.oQueFoiFeito ?? '',
          resultadoSemana: checkinInfo?.resultadoSemana ?? '',
          proximosPassos:  checkinInfo?.proximosPassos ?? '',
          pedidosCliente:  checkinInfo?.pedidosCliente ?? '',
          novosSeguidores: checkinInfo?.novosSeguidores ?? null,
          atualizadoEm:    checkinInfo?.submittedAt ? checkinInfo.submittedAt.toISOString() : null,
        }}
      />

      {/* Info cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardTitle>Gestores</CardTitle>
          <div className="mt-2 space-y-1">
            {client.assignments.length === 0 ? (
              <p className="text-sm text-[#87919E]">Nenhum gestor atribuído</p>
            ) : (
              client.assignments.map((a) => (
                <div key={a.id} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#38435C] flex items-center justify-center text-[#95BBE2] text-[10px] font-bold">
                    {a.user.name.charAt(0)}
                  </div>
                  <span className="text-sm text-[#EBEBEB]">{a.user.name}</span>
                  {a.isPrimary && (
                    <span className="text-[10px] text-[#95BBE2] bg-[#95BBE2]/10 px-1.5 rounded">principal</span>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Plataformas</CardTitle>
            <div className="flex items-center gap-3">
              <LinkAccountModal clientId={client.id} clientSlug={slug} />
              <LinkGA4Modal clientId={client.id} />
              <LinkGoogleAdsModal clientId={client.id} />
            </div>
          </div>
          <div className="mt-2 space-y-2">
            {client.platformAccounts.length === 0 ? (
              <p className="text-sm text-[#87919E]">Nenhuma conta vinculada</p>
            ) : (
              client.platformAccounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between gap-2 group">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center text-white flex-shrink-0"
                      style={{ backgroundColor: platformColors[acc.platform] ?? '#38435C' }}
                    >
                      {acc.platform[0]}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-[#EBEBEB] truncate">{acc.name ?? platformNames[acc.platform] ?? acc.platform}</p>
                      <p className="text-[10px] text-[#87919E] font-mono truncate">{acc.externalId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {acc.platform === 'META_ADS'   && <MetaSyncButton platformAccountId={acc.id} />}
                    {acc.platform === 'GA4'        && <GA4SyncButton platformAccountId={acc.id} />}
                    {acc.platform === 'GOOGLE_ADS' && <GoogleAdsSyncButton platformAccountId={acc.id} clientId={client.id} />}
                    <RemovePlatformButton
                      platformAccountId={acc.id}
                      platformName={platformNames[acc.platform] ?? acc.platform}
                      accountName={acc.name ?? acc.externalId}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>Alertas não lidos</CardTitle>
          <CardValue className={client.alerts.length > 0 ? 'text-[#EF4444]' : 'text-[#22C55E]'}>
            {client.alerts.length}
          </CardValue>
          {client.alerts.length > 0 && (
            <p className="text-xs text-[#87919E] mt-1 truncate">{client.alerts[0].title}</p>
          )}
        </Card>

        <ClientContractCard contract={contractData} clientId={client.id} />
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      {isLocal ? (
        <LocalBusinessKPISection
          kpis={{
            investimento:    kpis.investimento,
            alcance:         kpis.adAlcance,
            impressoes:      kpis.adImpressions,
            frequencia:      kpis.adFrequencia,
            cpm:             kpis.cpm,
            cliques:         kpis.adCliques,
            cpc:             kpis.cpc,
            ctr:             kpis.ctr,
            leads:           kpis.adLeads,
            cpl:             kpis.cpl,
            mensagens:       kpis.mensagens,
            custoMensagem:   kpis.custoMensagem,
            landingPageViews: kpis.landingPageViews,
            taxaConexao:     kpis.taxaConexao,
            thruplays:       kpis.thruplays,
            videoViews3s:    kpis.videoViews3s,
            adVendas:        kpis.adVendas,
            adRevenueMeta:   kpis.adRevenueMeta,
            custoVenda:      kpis.custoVenda,
            ticketMedioMeta: kpis.ticketMedioMeta,
          }}
        />
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-[#EBEBEB]">
                KPIs
                <span className="text-[#87919E] font-normal ml-2 text-xs capitalize">{kpis.periodLabel}</span>
              </h2>
              <p className="text-[10px] text-[#87919E] mt-0.5">
                {kpis.daysElapsed} dias · vs. período anterior equivalente
              </p>
            </div>
            <DateRangePicker from={activeFrom} to={activeTo} clientId={client.id} />
          </div>

          {!hasData ? (
            <div className="bg-[#0A1E2C] border border-[#38435C] rounded-xl p-6 text-center">
              <p className="text-[#87919E] text-sm">Sem dados de métricas este mês. Sincronize as plataformas para ver os KPIs.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Row 1 — Financeiro */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
                <KpiCard
                  label="Receita (GA4)"
                  value={kpis.faturamento > 0 ? formatCurrency(kpis.faturamento) : '—'}
                  trend={kpis.faturamentoTrend}
                  sub="fonte: GA4"
                />
                <KpiCard
                  label="Investimento Total"
                  value={kpis.investimento > 0 ? formatCurrency(kpis.investimento) : '—'}
                  trend={kpis.investimentoTrend}
                  lowerIsBetter
                  sub="Meta + Google + TikTok"
                />
                <KpiCard
                  label="ROAS Total"
                  value={kpis.roas !== null ? `${kpis.roas.toFixed(2)}x` : '—'}
                  trend={kpis.roasTrend}
                  sub="GA4 receita / invest. total"
                />
                <KpiCard
                  label="Compras (GA4)"
                  value={kpis.compras > 0 ? kpis.compras.toLocaleString('pt-BR') : '—'}
                  trend={kpis.comprasTrend}
                  sub="fonte: GA4"
                />
                <KpiCard
                  label="Projeção do Mês"
                  value={kpis.projecaoMes !== null ? formatCurrency(kpis.projecaoMes) : '—'}
                  sub={kpis.projecaoMes !== null ? `${kpis.daysElapsed}d de dados` : undefined}
                />
              </div>

              {/* Row 2 — Investimento e ROAS por plataforma */}
              {(kpis.investimentoMeta > 0 || kpis.investimentoGoogle > 0 || kpis.investimentoTiktok > 0) && (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                  {kpis.investimentoMeta > 0 && (
                    <KpiCard label="Invest. Meta" value={formatCurrency(kpis.investimentoMeta)} lowerIsBetter sub="Meta Ads" />
                  )}
                  {kpis.investimentoGoogle > 0 && (
                    <KpiCard label="Invest. Google" value={formatCurrency(kpis.investimentoGoogle)} lowerIsBetter sub="Google Ads" />
                  )}
                  {kpis.investimentoTiktok > 0 && (
                    <KpiCard label="Invest. TikTok" value={formatCurrency(kpis.investimentoTiktok)} lowerIsBetter sub="TikTok Ads" />
                  )}
                  {kpis.roasMeta !== null && (
                    <KpiCard label="ROAS Meta" value={`${kpis.roasMeta.toFixed(2)}x`} sub="GA4 / Meta spend" />
                  )}
                  {kpis.roasGoogle !== null && (
                    <KpiCard label="ROAS Google" value={`${kpis.roasGoogle.toFixed(2)}x`} sub="GA4 / Google spend" />
                  )}
                  {kpis.roasTiktok !== null && (
                    <KpiCard label="ROAS TikTok" value={`${kpis.roasTiktok.toFixed(2)}x`} sub="GA4 / TikTok spend" />
                  )}
                </div>
              )}

              {/* Row 3 — Eficiência */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
                <KpiCard
                  label="Sessões"
                  value={kpis.sessoes > 0 ? kpis.sessoes.toLocaleString('pt-BR') : '—'}
                  trend={kpis.sessoesTrend}
                />
                <KpiCard
                  label="Taxa de Conversão"
                  value={kpis.taxaConversao !== null ? `${kpis.taxaConversao.toFixed(2)}%` : '—'}
                  trend={kpis.taxaConversaoTrend}
                />
                <KpiCard
                  label="Ticket Médio"
                  value={kpis.ticketMedio !== null ? formatCurrency(kpis.ticketMedio) : '—'}
                  trend={kpis.ticketMedioTrend}
                />
                <KpiCard
                  label="CPA (Custo por Venda)"
                  value={kpis.cpa !== null ? formatCurrency(kpis.cpa) : '—'}
                  trend={kpis.cpaTrend}
                  lowerIsBetter
                />
                <KpiCard
                  label="CAC (Custo p/ Novo Cliente)"
                  value={kpis.cac !== null ? formatCurrency(kpis.cac) : '—'}
                  trend={kpis.cacTrend}
                  lowerIsBetter
                  sub={kpis.cac !== null ? 'invest / novos compradores' : 'requer sync GA4'}
                />
              </div>
            </div>
          )}
        </div>
      )}

      </section>

      {/* ══ METAS & RESULTADO ══ */}
      <section id="sec-metas" className="scroll-mt-24 space-y-6">
      {/* ── Revenue Pace + Monthly Comparison (E-commerce only) ────────────── */}
      {!isLocal && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <RevenuePaceChart
            data={dailyRevenue}
            goal={monthlyGoals.find((g) => g.metric === 'FATURAMENTO') ? Number(monthlyGoals.find((g) => g.metric === 'FATURAMENTO')!.targetValue) : null}
          />
          <MonthlyComparisonChart data={monthlyComparison} />
        </div>
      )}

      {/* ── Sales Funnel (E-commerce only) ─────────────────────────────────── */}
      {!isLocal && <SalesFunnelSection data={salesFunnel} />}

      {/* ── Metas do Mês ────────────────────────────────────────────────────── */}
      {monthlyGoals.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[#EBEBEB] mb-3">
            Metas do Mês <span className="text-[10px] font-normal text-[#87919E]">· realizado no mês</span>
          </h2>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {monthlyGoals.map((goal) => {
              const hs = goal.healthScores[0]
              const status = hs?.status ?? null
              const pct = hs ? Math.round(Number(hs.achievementPct)) : null
              // Realizado da FONTE ÚNICA (MTD), não de HealthScore.actualValue.
              const actual = monthlyRealizadoByMetric.get(goal.metric) ?? null

              return (
                <Card key={goal.id}>
                  <CardHeader>
                    <CardTitle>{metricLabels[goal.metric] ?? goal.metric}</CardTitle>
                    {status ? (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${healthBgClasses[status]}`}>
                        {healthLabels[status]}
                      </span>
                    ) : (
                      <Badge variant="outline">Sem dados</Badge>
                    )}
                  </CardHeader>
                  <div className="space-y-2">
                    {actual !== null ? (
                      <div className="flex items-end gap-2">
                        <span className="text-2xl font-bold text-[#EBEBEB]">
                          {goalValueFormat(goal.metric, actual)}
                        </span>
                        <span className="text-xs text-[#87919E] mb-1">
                          / meta: {goalValueFormat(goal.metric, Number(goal.targetValue))}
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm text-[#87919E]">Aguardando sync</p>
                    )}
                    {pct !== null && <Progress value={Math.min(pct, 100)} />}
                    {/* Rótulo honesto: achievementPct é PRORATEADO (ritmo até o
                        dia N do mês), não % da meta cheia. */}
                    {pct !== null && <p className="text-xs text-[#87919E]">{pct}% do ritmo (dia {kpis.daysElapsed})</p>}
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Metas da Semana ──────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#EBEBEB]">Metas da Semana</h2>
          {weeklyGoals.length === 0 && (
            <GoalFormModal clientId={client.id} businessType={client.businessType} label="Adicionar primeira meta" />
          )}
        </div>

        {weeklyGoals.length === 0 ? (
          <Card className="flex flex-col items-center py-12 text-center">
            <Target size={32} className="text-[#38435C] mb-3" />
            <p className="text-[#EBEBEB] font-medium">Nenhuma meta semanal cadastrada</p>
            <p className="text-[#87919E] text-sm mt-1 max-w-xs">
              Adicione metas semanais para acompanhar a saúde deste cliente automaticamente.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
            {weeklyGoals.map((goal) => {
              const hs = goal.healthScores[0]
              const status = hs?.status ?? null
              const pct = hs ? Math.round(Number(hs.achievementPct)) : null
              // Realizado da FONTE ÚNICA (SEMANA_FECHADA), não de HealthScore.actualValue.
              const actual = weeklyRealizadoByMetric.get(goal.metric)?.valor ?? null

              return (
                <Card key={goal.id}>
                  <CardHeader>
                    <CardTitle>{metricLabels[goal.metric] ?? goal.metric}</CardTitle>
                    {status ? (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${healthBgClasses[status]}`}>
                        {healthLabels[status]}
                      </span>
                    ) : (
                      <Badge variant="outline">Sem dados</Badge>
                    )}
                  </CardHeader>
                  <div className="space-y-2">
                    {actual !== null ? (
                      <div className="flex items-end gap-2">
                        <span className="text-2xl font-bold text-[#EBEBEB]">
                          {goalValueFormat(goal.metric, actual)}
                        </span>
                        <span className="text-xs text-[#87919E] mb-1">
                          / meta: {goalValueFormat(goal.metric, Number(goal.targetValue))}
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm text-[#87919E]">Aguardando sync de dados</p>
                    )}
                    {pct !== null && <Progress value={Math.min(pct, 100)} />}
                    {pct !== null && <p className="text-xs text-[#87919E]">{pct}% da meta atingido</p>}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      </section>

      {/* ══ HISTÓRICO & DIAGNÓSTICO ══ */}
      <section id="sec-diagnostico" className="scroll-mt-24 space-y-6">
      {/* ── Comparativo semana vs semana anterior ────────────────────────── */}
      {weekComparison.length > 0 && (
        <WeekComparisonTable rows={weekComparison} />
      )}

      {/* ── Histórico de Saúde (8 semanas) ──────────────────────────────── */}
      {healthHistory.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#EBEBEB]">Histórico de Saúde</h2>
            <div className="flex items-center gap-3 text-[10px] text-[#87919E]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#22C55E] inline-block" /> ≥90% Saudável</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#EAB308] inline-block" /> ≥70% Atenção</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#EF4444] inline-block" /> &lt;70% Crítico</span>
            </div>
          </div>
          <div className="card p-4">
            <HealthScoreHistoryChart data={healthHistory} />
          </div>
        </div>
      )}

      {/* ── Benchmarks de mercado por pilar (E-commerce only) ─────────── */}
      {!isLocal && (
        <PillarBenchmarkPanel
          roas={kpis.roas}
          ctr={kpis.ctr}
          cpc={kpis.cpc}
          taxaConversao={kpis.taxaConversao}
          ticketMedio={kpis.ticketMedio}
          cpa={kpis.cpa}
        />
      )}

      {/* ── Diagnóstico de KPIs (E-commerce only) ───────────────────────── */}
      {!isLocal && (
        <KPIDiagnosticCard
          cps={kpis.cps}
          taxaConversao={kpis.taxaConversao}
          ticketMedio={kpis.ticketMedio}
          cpsPct={kpis.cpsTrend}
          taxaPct={kpis.taxaConversaoTrend}
          ticketPct={kpis.ticketMedioTrend}
        />
      )}

      {/* ── Ritmo das Metas Mensais ───────────────────────────────────────── */}
      {paceGoals.length > 0 && (
        <GoalPaceCard
          goals={paceGoals}
          daysElapsed={kpis.daysElapsed}
          daysInMonth={kpis.daysInMonth}
        />
      )}

      {/* Metric charts */}
      <div>
        <h2 className="text-sm font-semibold text-[#EBEBEB] mb-3">Histórico — últimos 14 dias</h2>
        <MetricsChartsGrid data={metricHistory} />
      </div>

      </section>

      {/* ══ CAMPANHAS & RELATÓRIOS ══ */}
      <section id="sec-campanhas" className="scroll-mt-24 space-y-6">
      {/* ── Campanhas de Anúncio (E-commerce only) ──────────────────────── */}
      {!isLocal && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#EBEBEB]">Campanhas de Anúncio</h2>
              <p className="text-[10px] text-[#87919E] mt-0.5">
                Performance por campanha/conjunto — Meta Ads · últimos 7 dias
              </p>
            </div>
          </div>
          <CampaignBreakdownTable campaigns={campaigns} periodDays={7} />
          <CampaignInsightCard
            clientId={client.id}
            clientSlug={slug}
            existingInsight={campaignInsight
              ? { content: campaignInsight.content, createdAt: campaignInsight.createdAt }
              : null
            }
          />
        </div>
      )}

      {/* ── Relatórios ───────────────────────────────────────────────────── */}
      <div className="print:hidden space-y-4">
        <WeeklyReportCard
          clientId={client.id}
          clientSlug={slug}
          existingReport={weeklyReport ? { content: weeklyReport.content, generatedAt: weeklyReport.generatedAt } : null}
        />
        <WeeklyReportFunnel
          clientId={client.id}
          clientSlug={slug}
          fonteRespostaAusente={reportFunnel.fonteRespostaAusente}
          canEdit={canGerarRelatorio}
          rows={reportFunnel.rows.map((r) => ({
            id: r.id,
            weekStart: r.weekStart.toISOString().slice(0, 10), // 'YYYY-MM-DD' canônico (UTC) — evita recuo de dia no fuso BR
            generatedAt: r.generatedAt.toISOString(),
            sentAt: r.sentAt ? r.sentAt.toISOString() : null,
            sentByName: r.sentByName,
            deliveredAt: r.deliveredAt ? r.deliveredAt.toISOString() : null,
            firstReplyAt: r.firstReplyAt ? r.firstReplyAt.toISOString() : null,
          }))}
        />
        <MonthlyReportCard
          clientId={client.id}
          clientSlug={slug}
          existingReport={monthlyReport ? { content: monthlyReport.content, generatedAt: monthlyReport.generatedAt, monthStart: monthlyReport.monthStart } : null}
        />
      </div>

      </section>

      {/* ══ CONVERSAS & OPERAÇÕES ══ */}
      <section id="sec-conversas" className="scroll-mt-24 space-y-6">
      {/* ── Chat do Cliente ───────────────────────────────────────────────── */}
      {/* id="chat" fica SEMPRE presente (âncora #chat da Central de Comunicação
          nunca quebra). Sem canal ainda, mostramos estado vazio explicando o porquê. */}
      <div id="chat" className="print:hidden scroll-mt-20">
        <h2 className="text-sm font-semibold text-[#EBEBEB] mb-3">Canal interno do cliente</h2>
        {chat ? (
          <ClientChatPanel
            chatId={chat.id}
            clientSlug={slug}
            messages={chat.messages}
            currentUserId={session.userId}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-[#38435C]/60 px-4 py-6 text-center">
            <p className="text-sm text-[#EBEBEB] font-medium">Canal ainda não conectado</p>
            <p className="text-xs text-[#87919E] mt-1">
              Assim que o canal interno deste cliente for criado, o histórico de mensagens aparece aqui.
            </p>
          </div>
        )}
      </div>

      {/* Recent operations */}
      {client.operations.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#EBEBEB]">Últimas Operações</h2>
            <Link href={`/operations?client=${client.id}`} className="text-xs text-[#95BBE2] hover:underline">
              Ver todas →
            </Link>
          </div>
          <div className="space-y-2">
            {client.operations.map((op) => (
              <Card key={op.id} className="p-3">
                <div className="flex items-start gap-2">
                  <BookOpen size={14} className="text-[#95BBE2] mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-xs font-semibold text-[#EBEBEB] truncate">{op.subject}</p>
                      <span className="text-[10px] text-[#87919E] flex-shrink-0">
                        {op.user.name} · {timeAgo(new Date(op.createdAt))}
                      </span>
                    </div>
                    <p className="text-xs text-[#87919E] line-clamp-1">{op.done}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      </section>

      {/* ══ TAREFAS & PLANO DE AÇÃO ══ */}
      <section id="sec-tarefas" className="scroll-mt-24 space-y-6">
      {/* ── Plano de ação por IA ──────────────────────────────────────────── */}
      <PlanoAcaoPanel clientId={client.id} destaque={streakStatus === 'RUIM'} />

      {/* ── Tarefas operacionais do cliente ───────────────────────────────── */}
      <ClientTasksCard tarefas={clienteTarefas} />

      </section>

      {/* ══ INTERAÇÕES CRM ══ */}
      <section id="sec-crm" className="scroll-mt-24 space-y-6">
      {/* ── Histórico de Interações CRM ───────────────────────────────────── */}
      <div className="card p-5">
        <InteractionTimeline clientId={client.id} interactions={interactions} />
      </div>
      </section>
    </div>
  )
}

const RESULTADO_COLORS: Record<string, string> = {
  OTIMO: '#16a34a', BOM: '#34c97a', REGULAR: '#e3ad45', RUIM: '#ff5e6a', PESSIMO: '#ff3b4e',
}
const RESULTADO_TXT: Record<string, string> = {
  OTIMO: 'Ótimo', BOM: 'Bom', REGULAR: 'Regular', RUIM: 'Ruim', PESSIMO: 'Péssimo',
}
const ETAPA_TXT: Record<string, string> = {
  ESCALA: 'Escala', MONITORAMENTO: 'Monitoramento', OTIMIZACAO: 'Otimização',
}

function ResultadoStrip({ resultado, etapa, roas, atualizadoEm }: { resultado: string; etapa: string | null; roas: number | null; atualizadoEm: string | null }) {
  const cor = RESULTADO_COLORS[resultado] ?? '#647488'
  return (
    <div className="card p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-[#87919E] mb-1">Resultado da semana</p>
        <span className="text-sm font-semibold px-2.5 py-1 rounded-full" style={{ color: cor, background: `${cor}1f` }}>
          {RESULTADO_TXT[resultado] ?? resultado}
        </span>
      </div>
      {etapa && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[#87919E] mb-1">Etapa</p>
          <span className="text-sm text-[#EBEBEB]">{ETAPA_TXT[etapa] ?? etapa}</span>
        </div>
      )}
      {roas != null && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[#87919E] mb-1">ROAS · semana passada</p>
          <span className="text-sm font-mono text-[#EBEBEB] tabular">{roas.toFixed(2)}x</span>
        </div>
      )}
      {atualizadoEm && (
        <p className="text-[10px] text-[#576070] ml-auto">
          Atualizado em {new Date(atualizadoEm).toLocaleString('pt-BR')} · automático
        </p>
      )}
    </div>
  )
}

function ClientTasksCard({ tarefas }: { tarefas: ClienteTarefas }) {
  const { abertas, concluidasRecentes, atrasadasCount } = tarefas
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ListTodo size={16} className="text-[#95BBE2]" />
          <h3 className="text-sm font-semibold text-[#EBEBEB]">Tarefas operacionais</h3>
          <span className="text-[11px] text-[#87919E]">· {abertas.length} abertas</span>
          {atrasadasCount > 0 && (
            <span className="text-[11px] text-[#EF4444]">· {atrasadasCount} atrasada{atrasadasCount > 1 ? 's' : ''}</span>
          )}
        </div>
        <Link href="/operacional" className="text-[11px] text-[#95BBE2] hover:underline">Abrir Central →</Link>
      </div>

      {abertas.length === 0 ? (
        <p className="text-[#87919E] text-sm">Nenhuma tarefa aberta para este cliente.</p>
      ) : (
        <div className="space-y-1.5">
          {abertas.map((t) => <ClientTaskRow key={t.id} t={t} />)}
        </div>
      )}

      {concluidasRecentes.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-wider text-[#576070] mb-1.5">Concluídas recentemente</p>
          <div className="space-y-1">
            {concluidasRecentes.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-[12px] text-[#87919E]">
                <span className="text-[#22C55E]">✓</span>
                <span className="truncate">{t.title}</span>
                {t.popCode && <span className="text-[10px] text-[#576070] shrink-0">{t.popCode}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ClientTaskRow({ t }: { t: ClienteTarefaRow }) {
  const atrasada = t.dueDate != null && new Date(t.dueDate).getTime() < Date.now()
  return (
    <Link
      href={`/operacional?task=${t.id}`}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg border bg-[#0F1623] hover:bg-[#141C2B] transition-colors ${atrasada ? 'border-[#EF4444]/30' : 'border-[#1F2937]'}`}
    >
      <span className={`text-[11px] shrink-0 ${PRIORITY_COLORS[t.priority] ?? 'text-[#87919E]'}`}>
        {opLabel(PRIORITY_LABELS, t.priority)}
      </span>
      <span className="flex-1 min-w-0 truncate text-[#EBEBEB] text-sm">{t.title}</span>
      <span className="text-[11px] text-[#87919E] shrink-0 hidden sm:inline">{t.assigneeName}</span>
      {t.popCode && <span className="text-[10px] text-[#576070] shrink-0 hidden md:inline">{t.popCode}</span>}
      <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${STATUS_COLORS[t.status] ?? 'text-[#87919E] border-[#38435C]'}`}>
        {opLabel(STATUS_LABELS, t.status)}
      </span>
      <span className={`text-[11px] shrink-0 w-14 text-right ${atrasada ? 'text-[#EF4444]' : 'text-[#87919E]'}`}>
        {t.dueDate ? new Date(t.dueDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'}
      </span>
    </Link>
  )
}
