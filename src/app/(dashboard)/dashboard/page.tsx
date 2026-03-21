import { HealthSummaryCards } from '@/components/dashboard/HealthSummaryCards'
import { ClientHealthGrid } from '@/components/dashboard/ClientHealthGrid'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, RefreshCw } from 'lucide-react'

// Mock data — will be replaced by API calls after DB setup
const mockClients = [
  {
    id: '1',
    name: 'Loja Alpha',
    slug: 'loja-alpha',
    primaryManager: 'Ana Lima',
    overallStatus: 'OTIMO' as const,
    achievementPct: 95,
    trend: 'up' as const,
    metrics: [
      { name: 'ROAS', status: 'OTIMO' as const, pct: 110 },
      { name: 'CPL', status: 'REGULAR' as const, pct: 78 },
      { name: 'Invest.', status: 'OTIMO' as const, pct: 98 },
    ],
  },
  {
    id: '2',
    name: 'E-commerce Beta',
    slug: 'ecommerce-beta',
    primaryManager: 'Carlos Souza',
    overallStatus: 'REGULAR' as const,
    achievementPct: 74,
    trend: 'stable' as const,
    metrics: [
      { name: 'ROAS', status: 'REGULAR' as const, pct: 75 },
      { name: 'CPL', status: 'REGULAR' as const, pct: 72 },
      { name: 'Invest.', status: 'OTIMO' as const, pct: 100 },
    ],
  },
  {
    id: '3',
    name: 'Marca Gamma',
    slug: 'marca-gamma',
    primaryManager: 'Ana Lima',
    overallStatus: 'RUIM' as const,
    achievementPct: 52,
    trend: 'down' as const,
    metrics: [
      { name: 'ROAS', status: 'RUIM' as const, pct: 45 },
      { name: 'CPL', status: 'RUIM' as const, pct: 60 },
      { name: 'Invest.', status: 'REGULAR' as const, pct: 80 },
    ],
  },
  {
    id: '4',
    name: 'Tech Delta',
    slug: 'tech-delta',
    primaryManager: 'Carlos Souza',
    overallStatus: 'OTIMO' as const,
    achievementPct: 102,
    trend: 'up' as const,
    metrics: [
      { name: 'ROAS', status: 'OTIMO' as const, pct: 105 },
      { name: 'CPL', status: 'OTIMO' as const, pct: 98 },
    ],
  },
]

const mockAlerts = [
  {
    id: '1',
    client: 'Marca Gamma',
    type: 'STATUS_DROPPED_TO_RUIM',
    message: 'ROAS caiu para 45% da meta esta semana',
    time: '2h atrás',
  },
  {
    id: '2',
    client: 'E-commerce Beta',
    type: 'STATUS_DROPPED_TO_REGULAR',
    message: 'CPL subiu acima do limite esperado',
    time: '5h atrás',
  },
  {
    id: '3',
    client: 'Loja Alpha',
    type: 'STATUS_IMPROVED_TO_OTIMO',
    message: 'Meta de ROAS atingida! 110% do esperado',
    time: '1d atrás',
  },
]

const otimo = mockClients.filter((c) => c.overallStatus === 'OTIMO').length
const regular = mockClients.filter((c) => c.overallStatus === 'REGULAR').length
const ruim = mockClients.filter((c) => c.overallStatus === 'RUIM').length

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#EBEBEB]">Dashboard</h1>
          <p className="text-[#87919E] text-sm mt-0.5">
            Métricas de performance e acompanhamento
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#87919E]">
          <RefreshCw size={12} />
          <span>Última atualização: hoje 06:00</span>
        </div>
      </div>

      {/* Health summary */}
      <HealthSummaryCards
        total={mockClients.length}
        otimo={otimo}
        regular={regular}
        ruim={ruim}
        viewMode="ADMIN"
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
          <ClientHealthGrid clients={mockClients} />
        </div>

        {/* Alerts feed */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#EBEBEB]">Alertas Recentes</h2>
            <a href="/alerts" className="text-xs text-[#95BBE2] hover:underline">
              Ver todos →
            </a>
          </div>
          <div className="space-y-2">
            {mockAlerts.map((alert) => (
              <Card key={alert.id} className="p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    size={14}
                    className={
                      alert.type === 'STATUS_IMPROVED_TO_OTIMO'
                        ? 'text-[#22C55E] mt-0.5 flex-shrink-0'
                        : alert.type === 'STATUS_DROPPED_TO_RUIM'
                        ? 'text-[#EF4444] mt-0.5 flex-shrink-0'
                        : 'text-[#EAB308] mt-0.5 flex-shrink-0'
                    }
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#EBEBEB] truncate">
                      {alert.client}
                    </p>
                    <p className="text-xs text-[#87919E] mt-0.5 line-clamp-2">
                      {alert.message}
                    </p>
                    <p className="text-[10px] text-[#87919E]/60 mt-1">{alert.time}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
