import Link from 'next/link'
import { requireSession } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { markAlertRead, markAllAlertsRead, acknowledgeAlert } from '@/app/actions/alerts'
import { getAlertGovernanceHealth } from '@/lib/dal'
import { timeAgo } from '@/lib/utils'
import { AlertTriangle, AlertCircle, CheckCircle2, TrendingDown, Bell, BellOff, ArrowDownRight, ArrowUpRight, ShieldAlert, Scale, ShieldCheck } from 'lucide-react'
import { AlertType } from '@prisma/client'
import { normalizeRole } from '@/lib/rbac'

const alertConfig: Record<AlertType, { icon: typeof AlertTriangle; color: string; label: string }> = {
  STATUS_DROPPED_TO_RUIM:         { icon: AlertTriangle,  color: 'text-[#EF4444]', label: 'Saúde Crítica' },
  STATUS_DROPPED_TO_REGULAR:      { icon: TrendingDown,   color: 'text-[#EAB308]', label: 'Saúde em Atenção' },
  STATUS_IMPROVED_TO_OTIMO:       { icon: CheckCircle2,   color: 'text-[#22C55E]', label: 'Melhora para Saudável' },
  SYNC_FAILED:                    { icon: AlertTriangle,  color: 'text-[#EAB308]', label: 'Integração parou de atualizar' },
  BUDGET_EXHAUSTED:               { icon: AlertTriangle,  color: 'text-[#EF4444]', label: 'Orçamento Esgotado' },
  BUDGET_WARNING:                 { icon: AlertTriangle,  color: 'text-[#EAB308]', label: 'Budget Quase Esgotado' },
  KPI_DROP_24H:                   { icon: ArrowDownRight, color: 'text-[#EF4444]', label: 'Queda 24h' },
  KPI_SPIKE_24H:                  { icon: ArrowUpRight,   color: 'text-[#22C55E]', label: 'Alta 24h' },
  ROAS_BELOW_TARGET_2W:           { icon: ShieldAlert,    color: 'text-[#EF4444]', label: '🚨 Conta Crítica — ROAS' },
  FATURAMENTO_BELOW_70PCT_WEEK2:  { icon: ShieldAlert,    color: 'text-[#EF4444]', label: '🚨 Conta Crítica — Faturamento' },
  CONTRACT_EXPIRING_SOON:         { icon: Scale,          color: 'text-[#F59E0B]', label: 'Contrato Vencendo' },
  WARROOM_NO_REVIEW:              { icon: ShieldAlert,    color: 'text-[#EAB308]', label: 'War Room sem revisão' },
  WARROOM_EXIT_CRITERIA_MET:      { icon: CheckCircle2,   color: 'text-[#22C55E]', label: 'Critério de saída atingido' },
  WARROOM_REGRESSION:             { icon: TrendingDown,   color: 'text-[#EF4444]', label: 'War Room em regressão' },
  INVOICE_OVERDUE:                { icon: AlertCircle,    color: 'text-[#EF4444]', label: 'Fatura vencida' },
  CLIENT_WITHOUT_BILLING:         { icon: AlertTriangle,  color: 'text-[#EAB308]', label: 'Cliente sem cobrança' },
  ANTICHURN_ACTION_NEEDED:        { icon: ShieldAlert,    color: 'text-[#EF4444]', label: 'Cliente em risco sem ação' },
  CHECKIN_MISSING:                { icon: AlertTriangle,  color: 'text-[#EAB308]', label: 'Cliente sem check-in' },
  CHECKIN_REJECTED_STALE:         { icon: AlertCircle,    color: 'text-[#EF4444]', label: 'Check-in reprovado sem correção' },
  TASK_AUTOMATION:                { icon: Bell,           color: 'text-[#95BBE2]', label: 'Automação de tarefa' },
}

// Grupos operacionais para os filtros da barra superior.
const FILTROS = [
  { key: 'todos',      label: 'Todos'      },
  { key: 'nao-lidos',  label: 'Não lidos'  },
  { key: 'performance', label: 'Performance' },
  { key: 'melhoras',   label: 'Melhoras'   },
] as const

type FiltroKey = (typeof FILTROS)[number]['key']

// Alertas de piora/risco (o que pode quebrar) vs. melhoras (o que evoluiu bem).
const PERFORMANCE_TYPES: AlertType[] = [
  'STATUS_DROPPED_TO_RUIM', 'STATUS_DROPPED_TO_REGULAR', 'KPI_DROP_24H',
  'ROAS_BELOW_TARGET_2W', 'FATURAMENTO_BELOW_70PCT_WEEK2', 'WARROOM_REGRESSION',
  'BUDGET_EXHAUSTED', 'BUDGET_WARNING',
]
const MELHORA_TYPES: AlertType[] = [
  'STATUS_IMPROVED_TO_OTIMO', 'KPI_SPIKE_24H', 'WARROOM_EXIT_CRITERIA_MET',
]

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>
}) {
  const session = await requireSession()
  const { filtro: filtroRaw } = await searchParams
  const filtro: FiltroKey = FILTROS.some((f) => f.key === filtroRaw)
    ? (filtroRaw as FiltroKey)
    : 'todos'

  const isViewAll = normalizeRole(session.role) !== 'GESTOR_TRAFEGO'
  const where =
    isViewAll
      ? {}
      : { client: { assignments: { some: { userId: session.userId } } } }

  const allAlerts = await prisma.alert.findMany({
    where,
    include: { client: { select: { name: true, slug: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  // Nomes de quem reconheceu (acknowledgedBy é userId) — resolvidos em lote.
  const ackUserIds = [...new Set(allAlerts.map((a) => a.acknowledgedBy).filter((v): v is string => !!v))]
  const ackUsers = ackUserIds.length
    ? await prisma.user.findMany({ where: { id: { in: ackUserIds } }, select: { id: true, name: true } })
    : []
  const ackNameById = new Map(ackUsers.map((u) => [u.id, u.name]))

  // Dashboard de saúde da governança (ADMIN only; demais recebem lista vazia).
  const governanceHealth = await getAlertGovernanceHealth(session.role)

  const unread = allAlerts.filter((a) => !a.read).length

  const alerts = allAlerts.filter((a) => {
    if (filtro === 'nao-lidos') return !a.read
    if (filtro === 'performance') return PERFORMANCE_TYPES.includes(a.type)
    if (filtro === 'melhoras') return MELHORA_TYPES.includes(a.type)
    return true
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#EBEBEB]">Alertas</h1>
          <p className="text-[#87919E] text-sm mt-0.5">
            {unread > 0 ? `${unread} não lido${unread > 1 ? 's' : ''}` : 'Todos os alertas lidos'}
          </p>
        </div>
        {unread > 0 && (
          <form action={markAllAlertsRead}>
            <button
              type="submit"
              className="flex items-center gap-2 text-xs text-[#87919E] hover:text-[#EBEBEB] border border-[#38435C] rounded-lg px-3 py-2 transition-colors hover:bg-[#38435C]/40"
            >
              <BellOff size={13} />
              Marcar todos como lidos
            </button>
          </form>
        )}
      </div>

      {/* Dashboard de saúde da governança (ADMIN only) */}
      {governanceHealth.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={15} className="text-[#95BBE2]" />
            <h2 className="text-sm font-semibold text-[#EBEBEB]">Saúde dos alertas — últimos 14 dias</h2>
          </div>
          <p className="text-xs text-[#87919E] mb-3">
            Quando um tipo é reconhecido por menos da metade do time, ele vira ruído: aparece marcado
            como <span className="text-[#EF4444] font-medium">MAL DESENHADO</span> — hora de recalibrar o gatilho.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#87919E] text-left border-b border-[#38435C]">
                  <th className="py-2 pr-3 font-medium">Tipo</th>
                  <th className="py-2 px-3 font-medium">Dono</th>
                  <th className="py-2 px-3 font-medium text-right">Criados</th>
                  <th className="py-2 px-3 font-medium text-right">Reconhecidos</th>
                  <th className="py-2 px-3 font-medium text-right">Taxa</th>
                  <th className="py-2 px-3 font-medium text-right">Tempo médio</th>
                  <th className="py-2 pl-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {governanceHealth.map((row) => (
                  <tr key={row.type} className="border-b border-[#38435C]/40">
                    <td className="py-2 pr-3 text-[#EBEBEB]">{row.label}</td>
                    <td className="py-2 px-3 text-[#87919E]">{row.ownerLabel}</td>
                    <td className="py-2 px-3 text-right text-[#EBEBEB]">{row.criados}</td>
                    <td className="py-2 px-3 text-right text-[#EBEBEB]">{row.reconhecidos}</td>
                    <td className={`py-2 px-3 text-right font-medium ${
                      row.taxaReconhecimento === null ? 'text-[#87919E]'
                        : row.taxaReconhecimento < 50 ? 'text-[#EF4444]'
                        : row.taxaReconhecimento < 80 ? 'text-[#EAB308]'
                        : 'text-[#22C55E]'
                    }`}>
                      {row.taxaReconhecimento === null ? '—' : `${row.taxaReconhecimento}%`}
                    </td>
                    <td className="py-2 px-3 text-right text-[#87919E]">
                      {row.tempoMedioHoras === null ? '—' : `${row.tempoMedioHoras}h`}
                    </td>
                    <td className="py-2 pl-3">
                      {row.malDesenhado && (
                        <Badge variant="outline" className="text-[10px] py-0 border-[#EF4444] text-[#EF4444]">
                          MAL DESENHADO
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        {FILTROS.map((f) => {
          const active = filtro === f.key
          return (
            <Link
              key={f.key}
              href={f.key === 'todos' ? '/alerts' : `/alerts?filtro=${f.key}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                active
                  ? 'border-[#95BBE2] bg-[#95BBE2]/10 text-[#95BBE2]'
                  : 'border-[#38435C] text-[#87919E] hover:bg-[#38435C]/40'
              }`}
            >
              {f.label}
            </Link>
          )
        })}
      </div>

      {/* Alerts list */}
      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#38435C]/50 flex items-center justify-center mb-4">
            <Bell size={28} className="text-[#87919E]" />
          </div>
          <p className="text-[#EBEBEB] font-medium">
            {filtro === 'todos' ? 'Nenhum alerta' : 'Nenhum alerta neste filtro'}
          </p>
          <p className="text-[#87919E] text-sm mt-1">
            {filtro === 'todos'
              ? 'Os alertas aparecem aqui quando a saúde de um cliente muda.'
              : 'Troque o filtro acima para ver os demais alertas.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => {
            const config = alertConfig[alert.type] ?? alertConfig.SYNC_FAILED
            const Icon = config.icon
            return (
              <Card
                key={alert.id}
                className={`p-4 transition-all ${alert.read ? 'opacity-50' : 'border-l-4'} ${
                  !alert.read && alert.type === 'STATUS_DROPPED_TO_RUIM'
                    ? 'border-l-[#EF4444]'
                    : !alert.read && alert.type === 'STATUS_IMPROVED_TO_OTIMO'
                    ? 'border-l-[#22C55E]'
                    : !alert.read
                    ? 'border-l-[#EAB308]'
                    : ''
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        alert.type === 'STATUS_DROPPED_TO_RUIM'
                          ? 'bg-[#EF4444]/10'
                          : alert.type === 'STATUS_IMPROVED_TO_OTIMO'
                          ? 'bg-[#22C55E]/10'
                          : 'bg-[#EAB308]/10'
                      }`}
                    >
                      <Icon size={16} className={config.color} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <a
                          href={`/clients/${alert.client.slug}`}
                          className="text-sm font-semibold text-[#95BBE2] hover:underline"
                        >
                          {alert.client.name}
                        </a>
                        <Badge variant="outline" className="text-[10px] py-0">
                          {config.label}
                        </Badge>
                        {!alert.read && (
                          <span className="w-2 h-2 rounded-full bg-[#95BBE2] flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs font-medium text-[#EBEBEB]">{alert.title}</p>
                      <p className="text-xs text-[#87919E] mt-0.5">{alert.body}</p>
                      <p className="text-[10px] text-[#87919E]/60 mt-1">
                        {timeAgo(new Date(alert.createdAt))}
                      </p>
                      {alert.acknowledgedAt && (
                        <p className="text-[10px] text-[#22C55E] mt-1 flex items-center gap-1">
                          <ShieldCheck size={11} />
                          Reconhecido por {ackNameById.get(alert.acknowledgedBy ?? '') ?? 'responsável'}
                          {' · '}
                          {timeAgo(new Date(alert.acknowledgedAt))}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {!alert.acknowledgedAt && (
                      <form action={acknowledgeAlert.bind(null, alert.id)}>
                        <button
                          type="submit"
                          className="w-full text-[10px] font-medium text-[#0B1120] bg-[#22C55E] hover:bg-[#16A34A] whitespace-nowrap rounded px-2 py-1 transition-colors flex items-center gap-1 justify-center"
                          title="Assumir o SLA deste alerta"
                        >
                          <ShieldCheck size={11} />
                          Reconhecer
                        </button>
                      </form>
                    )}
                    {!alert.read && (
                      <form action={markAlertRead.bind(null, alert.id)}>
                        <button
                          type="submit"
                          className="w-full text-[10px] text-[#87919E] hover:text-[#EBEBEB] whitespace-nowrap border border-[#38435C] rounded px-2 py-1 transition-colors hover:bg-[#38435C]/40"
                        >
                          Marcar lido
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
