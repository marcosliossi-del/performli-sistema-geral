import { requireSession } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { markAlertRead, markAllAlertsRead } from '@/app/actions/alerts'
import { timeAgo } from '@/lib/utils'
import { AlertTriangle, CheckCircle2, TrendingDown, Bell, BellOff, ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { AlertType } from '@prisma/client'

const alertConfig: Record<AlertType, { icon: typeof AlertTriangle; color: string; label: string }> = {
  STATUS_DROPPED_TO_RUIM:    { icon: AlertTriangle,  color: 'text-[#EF4444]', label: 'Performance Ruim' },
  STATUS_DROPPED_TO_REGULAR: { icon: TrendingDown,   color: 'text-[#EAB308]', label: 'Performance Regular' },
  STATUS_IMPROVED_TO_OTIMO:  { icon: CheckCircle2,   color: 'text-[#22C55E]', label: 'Melhora para Ótimo' },
  SYNC_FAILED:               { icon: AlertTriangle,  color: 'text-[#EAB308]', label: 'Falha de Sync' },
  BUDGET_EXHAUSTED:          { icon: AlertTriangle,  color: 'text-[#EF4444]', label: 'Orçamento Esgotado' },
  KPI_DROP_24H:              { icon: ArrowDownRight, color: 'text-[#EF4444]', label: 'Queda 24h' },
  KPI_SPIKE_24H:             { icon: ArrowUpRight,   color: 'text-[#22C55E]', label: 'Alta 24h' },
}

export default async function AlertsPage() {
  const session = await requireSession()

  const where =
    session.role === 'ADMIN'
      ? {}
      : { client: { assignments: { some: { userId: session.userId } } } }

  const alerts = await prisma.alert.findMany({
    where,
    include: { client: { select: { name: true, slug: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const unread = alerts.filter((a) => !a.read).length

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

      {/* Filters */}
      <div className="flex gap-2">
        {(['Todos', 'Não lidos', 'Performance', 'Melhoras'] as const).map((f) => (
          <span
            key={f}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[#38435C] text-[#87919E] cursor-pointer hover:bg-[#38435C]/40 transition-colors"
          >
            {f}
          </span>
        ))}
      </div>

      {/* Alerts list */}
      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#38435C]/50 flex items-center justify-center mb-4">
            <Bell size={28} className="text-[#87919E]" />
          </div>
          <p className="text-[#EBEBEB] font-medium">Nenhum alerta</p>
          <p className="text-[#87919E] text-sm mt-1">
            Os alertas aparecem aqui quando a saúde de um cliente muda.
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
                    </div>
                  </div>

                  {!alert.read && (
                    <form action={markAlertRead.bind(null, alert.id)}>
                      <button
                        type="submit"
                        className="text-[10px] text-[#87919E] hover:text-[#EBEBEB] whitespace-nowrap border border-[#38435C] rounded px-2 py-1 transition-colors hover:bg-[#38435C]/40 flex-shrink-0"
                      >
                        Marcar lido
                      </button>
                    </form>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
