import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  requireSession, getClientDetail, getClientMetricHistory,
  getClientKPIs, getGoalPaceMetrics, getClientChat, getClientWeeklyReport,
  getClientCampaigns, getLatestCampaignInsight, metricLabels,
  getClientDailyRevenue, getClientMonthlyComparison, getClientInteractions,
} from '@/lib/dal'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardValue } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { healthLabels, healthBgClasses } from '@/lib/health'
import { HealthStatus } from '@prisma/client'
import { formatCurrency, formatNumber, timeAgo } from '@/lib/utils'
import { ArrowLeft, Target, BookOpen, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { GoalFormModal } from '@/components/clients/GoalFormModal'
import { SyncButton } from '@/components/clients/SyncButton'
import { LinkAccountModal } from '@/components/clients/LinkAccountModal'
import { LinkGA4Modal } from '@/components/clients/LinkGA4Modal'
import { MetaSyncButton } from '@/components/clients/MetaSyncButton'
import { GA4SyncButton } from '@/components/clients/GA4SyncButton'
import { MetricsChartsGrid } from '@/components/clients/MetricsChartsGrid'
import { DateRangePicker } from '@/components/clients/DateRangePicker'
import { ClientChatPanel } from '@/components/clients/ClientChatPanel'
import { WeeklyReportCard } from '@/components/clients/WeeklyReportCard'
import { GoalPaceCard } from '@/components/clients/GoalPaceCard'
import { CampaignBreakdownTable } from '@/components/clients/CampaignBreakdownTable'
import { CampaignInsightCard } from '@/components/clients/CampaignInsightCard'
import { RevenuePaceChart } from '@/components/clients/RevenuePaceChart'
import { MonthlyComparisonChart } from '@/components/clients/MonthlyComparisonChart'
import { InteractionTimeline } from '@/components/clients/InteractionTimeline'

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
  const client = await getClientDetail(slug)
  if (!client) notFound()

  // Default: 1st of current month → yesterday
  const today = new Date()
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  const defaultTo = new Date(today.setDate(today.getDate() - 1)).toISOString().split('T')[0]
  const activeFrom = from ?? defaultFrom
  const activeTo = to ?? defaultTo

  const [metricHistory, kpis, paceGoals, chat, weeklyReport, campaigns, campaignInsight, dailyRevenue, monthlyComparison, interactions] = await Promise.all([
    getClientMetricHistory(client.id, 14),
    getClientKPIs(client.id, activeFrom, activeTo),
    getGoalPaceMetrics(client.id),
    getClientChat(client.id),
    getClientWeeklyReport(client.id),
    getClientCampaigns(client.id, 7),
    getLatestCampaignInsight(client.id),
    getClientDailyRevenue(client.id, activeFrom, activeTo),
    getClientMonthlyComparison(client.id),
    getClientInteractions(client.id),
  ])

  const weeklyGoals = client.goals.filter((g) => g.period === 'WEEKLY')
  const monthlyGoals = client.goals.filter((g) => g.period === 'MONTHLY')

  const overallStatus: HealthStatus | null =
    weeklyGoals.length === 0
      ? null
      : weeklyGoals.some((g) => g.healthScores[0]?.status === 'RUIM')
      ? 'RUIM'
      : weeklyGoals.some((g) => g.healthScores[0]?.status === 'REGULAR')
      ? 'REGULAR'
      : 'OTIMO'

  const hasData = kpis.faturamento > 0 || kpis.investimento > 0 || kpis.sessoes > 0

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
                <h1 className="text-xl font-bold text-[#EBEBEB]">{client.name}</h1>
                {overallStatus && (
                  <Badge variant={overallStatus.toLowerCase() as 'otimo' | 'regular' | 'ruim'}>
                    {healthLabels[overallStatus]}
                  </Badge>
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
          <SyncButton clientId={client.id} />
          <GoalFormModal clientId={client.id} />
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-3 gap-4">
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
            </div>
          </div>
          <div className="mt-2 space-y-2">
            {client.platformAccounts.length === 0 ? (
              <p className="text-sm text-[#87919E]">Nenhuma conta vinculada</p>
            ) : (
              client.platformAccounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between gap-2">
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
                  {acc.platform === 'META_ADS' && <MetaSyncButton platformAccountId={acc.id} />}
                  {acc.platform === 'GA4' && <GA4SyncButton platformAccountId={acc.id} />}
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
      </div>

      {/* ── KPIs do Mês ─────────────────────────────────────────────────────── */}
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

      {/* ── Revenue Pace + Monthly Comparison ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <RevenuePaceChart
          data={dailyRevenue}
          goal={monthlyGoals.find((g) => g.metric === 'FATURAMENTO') ? Number(monthlyGoals.find((g) => g.metric === 'FATURAMENTO')!.targetValue) : null}
        />
        <MonthlyComparisonChart data={monthlyComparison} />
      </div>

      {/* ── Metas do Mês ────────────────────────────────────────────────────── */}
      {monthlyGoals.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[#EBEBEB] mb-3">Metas do Mês</h2>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {monthlyGoals.map((goal) => {
              const hs = goal.healthScores[0]
              const status = hs?.status ?? null
              const pct = hs ? Math.round(Number(hs.achievementPct)) : null
              const actual = hs ? Number(hs.actualValue) : null

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
                    {pct !== null && <p className="text-xs text-[#87919E]">{pct}% da meta atingido</p>}
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
            <GoalFormModal clientId={client.id} label="Adicionar primeira meta" />
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
              const actual = hs ? Number(hs.actualValue) : null

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

      {/* ── Campanhas de Anúncio ─────────────────────────────────────────── */}
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

      {/* ── Relatório Semanal ─────────────────────────────────────────────── */}
      <WeeklyReportCard
        clientId={client.id}
        clientSlug={slug}
        existingReport={weeklyReport ? { content: weeklyReport.content, generatedAt: weeklyReport.generatedAt } : null}
      />

      {/* ── Chat do Cliente ───────────────────────────────────────────────── */}
      {chat && (
        <div>
          <h2 className="text-sm font-semibold text-[#EBEBEB] mb-3">Chat Interno</h2>
          <ClientChatPanel
            chatId={chat.id}
            clientSlug={slug}
            messages={chat.messages}
            currentUserId={session.userId}
          />
        </div>
      )}

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

      {/* ── Histórico de Interações CRM ───────────────────────────────────── */}
      <div className="card p-5">
        <InteractionTimeline clientId={client.id} interactions={interactions} />
      </div>
    </div>
  )
}
