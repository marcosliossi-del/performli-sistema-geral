import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireSession, getClientDetail, getClientMetricHistory, metricLabels } from '@/lib/dal'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardValue } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { healthLabels, healthBgClasses } from '@/lib/health'
import { HealthStatus } from '@prisma/client'
import { formatCurrency, timeAgo } from '@/lib/utils'
import { ArrowLeft, Target, BookOpen, RefreshCw } from 'lucide-react'
import { GoalFormModal } from '@/components/clients/GoalFormModal'
import { SyncButton } from '@/components/clients/SyncButton'
import { LinkAccountModal } from '@/components/clients/LinkAccountModal'
import { MetaSyncButton } from '@/components/clients/MetaSyncButton'
import { MetricsChartsGrid } from '@/components/clients/MetricsChartsGrid'

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

export default async function ClientDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  await requireSession()
  const client = await getClientDetail(slug)
  if (!client) notFound()
  const metricHistory = await getClientMetricHistory(client.id, 14)

  const overallStatus: HealthStatus | null =
    client.goals.length === 0
      ? null
      : client.goals.some((g) => g.healthScores[0]?.status === 'RUIM')
      ? 'RUIM'
      : client.goals.some((g) => g.healthScores[0]?.status === 'REGULAR')
      ? 'REGULAR'
      : 'OTIMO'

  const totalSpend = client.goals
    .flatMap((g) => g.healthScores)
    .reduce((sum, s) => sum + Number(s?.actualValue ?? 0), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/clients"
            className="flex items-center gap-1 text-[#87919E] hover:text-[#EBEBEB] text-sm transition-colors"
          >
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
                {client.website && (
                  <span className="text-[#95BBE2]">· {client.website}</span>
                )}
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <SyncButton clientId={client.id} />
          <GoalFormModal clientId={client.id} />
        </div>
      </div>

      {/* Top KPI row */}
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
                    <span className="text-[10px] text-[#95BBE2] bg-[#95BBE2]/10 px-1.5 rounded">
                      principal
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Plataformas</CardTitle>
            <LinkAccountModal clientId={client.id} clientSlug={slug} />
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
                      <p className="text-xs text-[#EBEBEB] truncate">
                        {acc.name ?? platformNames[acc.platform] ?? acc.platform}
                      </p>
                      <p className="text-[10px] text-[#87919E] font-mono truncate">{acc.externalId}</p>
                    </div>
                  </div>
                  {acc.platform === 'META_ADS' && (
                    <MetaSyncButton platformAccountId={acc.id} />
                  )}
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

      {/* Metas e HealthScores */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#EBEBEB]">Metas da Semana</h2>
          {client.goals.length === 0 && (
            <GoalFormModal clientId={client.id} label="Adicionar primeira meta" />
          )}
        </div>

        {client.goals.length === 0 ? (
          <Card className="flex flex-col items-center py-12 text-center">
            <Target size={32} className="text-[#38435C] mb-3" />
            <p className="text-[#EBEBEB] font-medium">Nenhuma meta cadastrada</p>
            <p className="text-[#87919E] text-sm mt-1 max-w-xs">
              Adicione metas semanais para acompanhar a saúde deste cliente automaticamente.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
            {client.goals.map((goal) => {
              const hs = goal.healthScores[0]
              const status = hs?.status ?? null
              const pct = hs ? Math.round(Number(hs.achievementPct)) : null
              const actual = hs ? Number(hs.actualValue) : null

              return (
                <Card key={goal.id}>
                  <CardHeader>
                    <CardTitle>{metricLabels[goal.metric] ?? goal.metric}</CardTitle>
                    {status ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${healthBgClasses[status]}`}
                      >
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
                          {goal.metric === 'INVESTMENT' || goal.metric === 'SPEND'
                            ? formatCurrency(actual)
                            : goal.metric === 'ROAS'
                            ? `${actual.toFixed(2)}x`
                            : goal.metric === 'CTR'
                            ? `${actual.toFixed(2)}%`
                            : goal.metric === 'CPL' || goal.metric === 'CPA' || goal.metric === 'CPC'
                            ? formatCurrency(actual)
                            : actual.toLocaleString('pt-BR')}
                        </span>
                        <span className="text-xs text-[#87919E] mb-1">
                          / meta:{' '}
                          {goal.metric === 'INVESTMENT' || goal.metric === 'SPEND'
                            ? formatCurrency(Number(goal.targetValue))
                            : goal.metric === 'ROAS'
                            ? `${Number(goal.targetValue).toFixed(1)}x`
                            : goal.metric === 'CTR'
                            ? `${Number(goal.targetValue).toFixed(1)}%`
                            : goal.metric === 'CPL' || goal.metric === 'CPA' || goal.metric === 'CPC'
                            ? formatCurrency(Number(goal.targetValue))
                            : Number(goal.targetValue).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm text-[#87919E]">Aguardando sync de dados</p>
                    )}

                    {pct !== null && <Progress value={Math.min(pct, 100)} />}

                    {pct !== null && (
                      <p className="text-xs text-[#87919E]">{pct}% da meta atingido</p>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Metric charts */}
      <div>
        <h2 className="text-sm font-semibold text-[#EBEBEB] mb-3">Histórico — últimos 14 dias</h2>
        <MetricsChartsGrid data={metricHistory} />
      </div>

      {/* Recent operations */}
      {client.operations.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#EBEBEB]">Últimas Operações</h2>
            <Link
              href={`/operations?client=${client.id}`}
              className="text-xs text-[#95BBE2] hover:underline"
            >
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
    </div>
  )
}
