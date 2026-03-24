import { requireSession } from '@/lib/dal'
import { getDashboardData, getClientsOperationalTable, getManagerStats } from '@/lib/dal'
import { HealthSummaryCards } from '@/components/dashboard/HealthSummaryCards'
import { ClientHealthGrid } from '@/components/dashboard/ClientHealthGrid'
import { OperationalTableWithFilter } from '@/components/dashboard/OperationalTableWithFilter'
import { ManagerCards } from '@/components/dashboard/ManagerCards'
import { DashboardAIChat } from '@/components/dashboard/DashboardAIChat'
import { Card } from '@/components/ui/card'
import {
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
} from 'lucide-react'
import { timeAgo } from '@/lib/utils'

const alertIcons = {
  STATUS_DROPPED_TO_RUIM: { icon: AlertTriangle, color: 'text-[#EF4444]' },
  STATUS_DROPPED_TO_REGULAR: { icon: TrendingDown, color: 'text-[#EAB308]' },
  STATUS_IMPROVED_TO_OTIMO: { icon: CheckCircle2, color: 'text-[#22C55E]' },
  SYNC_FAILED: { icon: AlertTriangle, color: 'text-[#EAB308]' },
  BUDGET_EXHAUSTED: { icon: AlertTriangle, color: 'text-[#EF4444]' },
  KPI_DROP_24H: { icon: ArrowDownRight, color: 'text-[#EF4444]' },
  KPI_SPIKE_24H: { icon: ArrowUpRight, color: 'text-[#22C55E]' },
}

export default async function DashboardPage() {
  const session = await requireSession()
  const [{ clients, totals, alerts, oscillationAlerts, lastSyncAt }, operationalRows, managerStats] =
    await Promise.all([
      getDashboardData(session.userId, session.role),
      getClientsOperationalTable(session.userId, session.role),
      session.role === 'ADMIN' ? getManagerStats() : Promise.resolve([]),
    ])

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
        <div className="flex items-center gap-4 text-xs text-[#87919E]">
          {lastSyncAt && (
            <div className="flex items-center gap-1.5">
              <Clock size={12} />
              <span>Último sync {timeAgo(new Date(lastSyncAt))}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <RefreshCw size={12} />
            <span>Semana atual</span>
          </div>
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

      {/* Oscillation alerts for today */}
      {oscillationAlerts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#EBEBEB]">Oscilações de Hoje</h2>
            <span className="text-xs text-[#87919E]">{oscillationAlerts.length} variação{oscillationAlerts.length !== 1 ? 'ões' : ''} detectada{oscillationAlerts.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {oscillationAlerts.map((alert) => {
              const isDrop = alert.type === 'KPI_DROP_24H'
              return (
                <Card key={alert.id} className={`p-3 border-l-4 ${isDrop ? 'border-l-[#EF4444]' : 'border-l-[#22C55E]'}`}>
                  <div className="flex items-start gap-2">
                    {isDrop ? (
                      <ArrowDownRight size={14} className="text-[#EF4444] mt-0.5 flex-shrink-0" />
                    ) : (
                      <ArrowUpRight size={14} className="text-[#22C55E] mt-0.5 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#EBEBEB] truncate">
                        {alert.client.name}
                      </p>
                      <p className="text-xs text-[#87919E] mt-0.5 line-clamp-2">{alert.title}</p>
                      <p className="text-[10px] text-[#87919E]/60 mt-1">
                        {timeAgo(new Date(alert.createdAt))}
                      </p>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Manager cards (admin only) */}
      {managerStats.length > 0 && (
        <ManagerCards managers={managerStats} />
      )}

      {/* Operational metrics table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#EBEBEB]">Métricas Operacionais</h2>
            <p className="text-[#87919E] text-xs mt-0.5">Resultados do mês atual por cliente</p>
          </div>
        </div>
        <OperationalTableWithFilter rows={operationalRows} />
      </div>

      {/* AI Chat */}
      <DashboardAIChat
        context={{
          totalClients: totals.total,
          healthyClients: totals.otimo,
          warningClients: totals.regular,
          criticalClients: totals.ruim,
        }}
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
                const config = alertIcons[alert.type as keyof typeof alertIcons] ?? alertIcons.SYNC_FAILED
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
