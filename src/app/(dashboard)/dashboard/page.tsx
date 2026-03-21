import { requireSession } from '@/lib/dal'
import { getDashboardData } from '@/lib/dal'
import { HealthSummaryCards } from '@/components/dashboard/HealthSummaryCards'
import { ClientHealthGrid } from '@/components/dashboard/ClientHealthGrid'
import { Card } from '@/components/ui/card'
import { AlertTriangle, RefreshCw, CheckCircle2, TrendingDown } from 'lucide-react'
import { timeAgo } from '@/lib/utils'

const alertIcons = {
  STATUS_DROPPED_TO_RUIM: { icon: AlertTriangle, color: 'text-[#EF4444]' },
  STATUS_DROPPED_TO_REGULAR: { icon: TrendingDown, color: 'text-[#EAB308]' },
  STATUS_IMPROVED_TO_OTIMO: { icon: CheckCircle2, color: 'text-[#22C55E]' },
  SYNC_FAILED: { icon: AlertTriangle, color: 'text-[#EAB308]' },
  BUDGET_EXHAUSTED: { icon: AlertTriangle, color: 'text-[#EF4444]' },
}

export default async function DashboardPage() {
  const session = await requireSession()
  const { clients, totals, alerts } = await getDashboardData(session.userId, session.role)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#EBEBEB]">Dashboard</h1>
          <p className="text-[#87919E] text-sm mt-0.5">
            {session.role === 'ADMIN'
              ? 'Visão geral de todos os clientes'
              : `Seus clientes — ${session.name.split(' ')[0]}`}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#87919E]">
          <RefreshCw size={12} />
          <span>Semana atual</span>
        </div>
      </div>

      {/* Health summary */}
      <HealthSummaryCards
        total={totals.total}
        otimo={totals.otimo}
        regular={totals.regular}
        ruim={totals.ruim}
        viewMode={session.role === 'ADMIN' ? 'ADMIN' : 'GESTOR'}
        managerName={session.name}
      />

      {/* Main grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Client health grid */}
        <div className="col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#EBEBEB]">Saúde dos Clientes</h2>
            <a href="/clients" className="text-xs text-[#95BBE2] hover:underline">
              Ver todos →
            </a>
          </div>
          <ClientHealthGrid clients={clients} />
        </div>

        {/* Alerts feed */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#EBEBEB]">Alertas Recentes</h2>
            <a href="/alerts" className="text-xs text-[#95BBE2] hover:underline">
              Ver todos →
            </a>
          </div>

          {alerts.length === 0 ? (
            <Card className="p-4 flex flex-col items-center text-center py-8">
              <CheckCircle2 size={24} className="text-[#22C55E] mb-2" />
              <p className="text-xs text-[#87919E]">Nenhum alerta não lido</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => {
                const config = alertIcons[alert.type] ?? alertIcons.SYNC_FAILED
                const Icon = config.icon
                return (
                  <Card key={alert.id} className="p-3">
                    <div className="flex items-start gap-2">
                      <Icon size={14} className={`${config.color} mt-0.5 flex-shrink-0`} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#EBEBEB] truncate">
                          {alert.client.name}
                        </p>
                        <p className="text-xs text-[#87919E] mt-0.5 line-clamp-2">{alert.body}</p>
                        <p className="text-[10px] text-[#87919E]/60 mt-1">
                          {timeAgo(new Date(alert.createdAt))}
                        </p>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
