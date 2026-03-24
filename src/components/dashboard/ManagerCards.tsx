'use client'

import { ManagerStat } from '@/lib/dal'
import { formatCurrency, formatNumber } from '@/lib/utils'

interface Props {
  managers: ManagerStat[]
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

function TrendIndicator({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[#87919E] text-xs">—</span>
  const isUp = value >= 0
  return (
    <span className={`text-xs font-medium flex items-center gap-0.5 ${isUp ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
      {isUp ? '↑' : '↓'} {Math.abs(value).toFixed(1)}%
      <span className="text-[#87919E] font-normal ml-0.5">vs sem. ant.</span>
    </span>
  )
}

function HealthMiniBar({ healthy, warning, critical }: { healthy: number; warning: number; critical: number }) {
  const total = healthy + warning + critical
  if (total === 0) return <div className="h-1.5 bg-[#38435C] rounded-full" />

  const healthyPct = (healthy / total) * 100
  const warningPct = (warning / total) * 100
  const criticalPct = (critical / total) * 100

  return (
    <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
      {healthy > 0 && (
        <div
          className="bg-[#22C55E]"
          style={{ width: `${healthyPct}%` }}
          title={`Saudável: ${healthy}`}
        />
      )}
      {warning > 0 && (
        <div
          className="bg-[#EAB308]"
          style={{ width: `${warningPct}%` }}
          title={`Atenção: ${warning}`}
        />
      )}
      {critical > 0 && (
        <div
          className="bg-[#EF4444]"
          style={{ width: `${criticalPct}%` }}
          title={`Crítico: ${critical}`}
        />
      )}
    </div>
  )
}

function ManagerCard({ manager }: { manager: ManagerStat }) {
  const total = manager.clientsHealthy + manager.clientsWarning + manager.clientsCritical

  return (
    <div className="bg-[#0A1E2C] border border-[#38435C] rounded-xl p-4 space-y-4">
      {/* Header: avatar + name + trend */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#38435C] flex items-center justify-center flex-shrink-0">
            <span className="text-[#EBEBEB] font-bold text-sm">{getInitials(manager.name)}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#EBEBEB]">{manager.name}</p>
            <p className="text-xs text-[#87919E]">{manager.role === 'ADMIN' ? 'Admin' : 'Gestor'}</p>
          </div>
        </div>
        <TrendIndicator value={manager.vsLastWeek} />
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-[#87919E]">Clientes</p>
          <p className="text-lg font-bold text-[#EBEBEB]">{manager.totalClients}</p>
        </div>
        <div>
          <p className="text-xs text-[#87919E]">Gasto total</p>
          <p className="text-lg font-bold text-[#EBEBEB]">
            {manager.totalSpend > 0 ? formatCurrency(manager.totalSpend) : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-[#87919E]">ROAS médio</p>
          <p className={`text-lg font-bold ${
            manager.avgRoas === null
              ? 'text-[#87919E]'
              : manager.avgRoas >= 3
              ? 'text-[#22C55E]'
              : manager.avgRoas >= 1.5
              ? 'text-[#EAB308]'
              : 'text-[#EF4444]'
          }`}>
            {manager.avgRoas !== null ? `${formatNumber(manager.avgRoas, 2)}x` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-[#87919E]">Vendas totais</p>
          <p className="text-lg font-bold text-[#EBEBEB]">
            {manager.totalSales > 0 ? formatNumber(manager.totalSales, 0) : '—'}
          </p>
        </div>
      </div>

      {/* Health mini-bar */}
      {total > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[#87919E]">
            <span>Saúde dos clientes</span>
            <div className="flex gap-2">
              {manager.clientsHealthy > 0 && (
                <span className="text-[#22C55E]">{manager.clientsHealthy} ✓</span>
              )}
              {manager.clientsWarning > 0 && (
                <span className="text-[#EAB308]">{manager.clientsWarning} !</span>
              )}
              {manager.clientsCritical > 0 && (
                <span className="text-[#EF4444]">{manager.clientsCritical} ✕</span>
              )}
            </div>
          </div>
          <HealthMiniBar
            healthy={manager.clientsHealthy}
            warning={manager.clientsWarning}
            critical={manager.clientsCritical}
          />
        </div>
      )}
    </div>
  )
}

export function ManagerCards({ managers }: Props) {
  if (managers.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#EBEBEB]">Por Gestor</h2>
        <span className="text-xs text-[#87919E]">{managers.length} gestor{managers.length !== 1 ? 'es' : ''}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {managers.map((m) => (
          <ManagerCard key={m.userId} manager={m} />
        ))}
      </div>
    </div>
  )
}
