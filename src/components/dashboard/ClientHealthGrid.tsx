'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { healthLabels, healthBgClasses } from '@/lib/health'
import { HealthStatus } from '@prisma/client'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface ClientHealth {
  id: string
  name: string
  slug: string
  logoUrl?: string | null
  primaryManager?: string | null
  overallStatus: HealthStatus | null
  achievementPct: number
  metrics: {
    name: string
    status: HealthStatus
    pct: number
  }[]
  trend: 'up' | 'down' | 'stable'
}

interface ClientHealthGridProps {
  clients: ClientHealth[]
}

export function ClientHealthGrid({ clients }: ClientHealthGridProps) {
  if (clients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-[#38435C] flex items-center justify-center mb-4">
          <span className="text-2xl">📊</span>
        </div>
        <p className="text-[#87919E] text-sm">Nenhum cliente cadastrado ainda.</p>
        <Link
          href="/clients/new"
          className="mt-3 text-[#95BBE2] text-sm hover:underline"
        >
          Cadastrar primeiro cliente →
        </Link>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {clients.map((client) => (
        <ClientCard key={client.id} client={client} />
      ))}
    </div>
  )
}

function ClientCard({ client }: { client: ClientHealth }) {
  const TrendIcon =
    client.trend === 'up'
      ? TrendingUp
      : client.trend === 'down'
      ? TrendingDown
      : Minus

  const trendColor =
    client.trend === 'up'
      ? 'text-[#22C55E]'
      : client.trend === 'down'
      ? 'text-[#EF4444]'
      : 'text-[#87919E]'

  return (
    <Link href={`/clients/${client.slug}`}>
      <div className="card p-4 hover:bg-[#2D3A4D] transition-all duration-150 cursor-pointer group">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            {client.logoUrl ? (
              <img
                src={client.logoUrl}
                alt={client.name}
                className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-[#0A1E2C] flex items-center justify-center flex-shrink-0">
                <span className="text-[#95BBE2] font-bold text-sm">
                  {client.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[#EBEBEB] font-semibold text-sm truncate group-hover:text-[#95BBE2] transition-colors">
                {client.name}
              </p>
              {client.primaryManager && (
                <p className="text-[#87919E] text-xs truncate">{client.primaryManager}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <TrendIcon size={14} className={trendColor} />
            {client.overallStatus ? (
              <Badge variant={client.overallStatus.toLowerCase() as 'otimo' | 'regular' | 'ruim'}>
                {healthLabels[client.overallStatus]}
              </Badge>
            ) : (
              <span className="text-[10px] text-[#87919E] px-2 py-0.5 rounded-full bg-[#38435C]/50">Sem metas</span>
            )}
          </div>
        </div>

        {/* Overall progress */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-[#87919E]">Atingimento geral</span>
            <span className="text-xs font-semibold text-[#EBEBEB]">
              {Math.round(client.achievementPct)}%
            </span>
          </div>
          <Progress value={client.achievementPct} />
        </div>

        {/* Metric badges */}
        {client.metrics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {client.metrics.slice(0, 4).map((m) => (
              <div
                key={m.name}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${healthBgClasses[m.status]}`}
              >
                <span>{m.name}</span>
                <span>{Math.round(m.pct)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}
