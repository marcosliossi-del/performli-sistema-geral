'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { healthLabels } from '@/lib/health'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { HealthStatus } from '@prisma/client'

export type OperationalRow = {
  id: string
  name: string
  slug: string
  primaryManager: string | null
  vendas: number | null
  cpa: number | null
  roas: number | null
  gasto: number | null
  cps: number | null
  taxaConversao: number | null
  overallStatus: HealthStatus | null
  budgetConsumed?: number | null
  budgetPlanned?: number | null
}

interface Props {
  rows: OperationalRow[]
}

function fmt(value: number | null, type: 'currency' | 'number' | 'roas' | 'percent'): string {
  if (value === null) return '—'
  switch (type) {
    case 'currency': return formatCurrency(value)
    case 'number':   return formatNumber(value, 0)
    case 'roas':     return `${formatNumber(value, 2)}x`
    case 'percent':  return `${formatNumber(value, 2)}%`
  }
}

function BudgetCell({ consumed, planned }: { consumed: number; planned: number }) {
  const pct = planned > 0 ? Math.min((consumed / planned) * 100, 100) : 0
  const barColor =
    pct >= 100 ? 'bg-[#EF4444]' : pct >= 80 ? 'bg-[#EAB308]' : 'bg-[#22C55E]'

  return (
    <div className="min-w-[110px]">
      <div className="flex items-center justify-between mb-1 gap-1">
        <span className="text-xs text-[#EBEBEB] whitespace-nowrap">
          {formatCurrency(consumed)}
        </span>
        <span className="text-xs text-[#87919E] whitespace-nowrap">
          / {formatCurrency(planned)}
        </span>
      </div>
      <div className="h-1 bg-[#38435C] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function OperationalClientTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-[#87919E] text-sm">
        Nenhum cliente ativo encontrado.
      </div>
    )
  }

  return (
    <div className="bg-[#38435C]/20 border border-[#38435C] rounded-xl overflow-x-auto">
      <table className="w-full min-w-[800px]">
        <thead>
          <tr className="border-b border-[#38435C]">
            <th className="text-left text-xs font-semibold text-[#87919E] uppercase tracking-wider px-5 py-3">
              Conta
            </th>
            <th className="text-left text-xs font-semibold text-[#87919E] uppercase tracking-wider px-4 py-3">
              Gestor
            </th>
            <th className="text-right text-xs font-semibold text-[#87919E] uppercase tracking-wider px-4 py-3">
              Vendas
            </th>
            <th className="text-right text-xs font-semibold text-[#87919E] uppercase tracking-wider px-4 py-3">
              CPA
            </th>
            <th className="text-right text-xs font-semibold text-[#87919E] uppercase tracking-wider px-4 py-3">
              ROAS
            </th>
            <th className="text-right text-xs font-semibold text-[#87919E] uppercase tracking-wider px-4 py-3">
              Gasto
            </th>
            <th className="text-left text-xs font-semibold text-[#87919E] uppercase tracking-wider px-4 py-3">
              Budget
            </th>
            <th className="text-right text-xs font-semibold text-[#87919E] uppercase tracking-wider px-4 py-3">
              CPS
            </th>
            <th className="text-right text-xs font-semibold text-[#87919E] uppercase tracking-wider px-4 py-3">
              Taxa de Conversão
            </th>
            <th className="text-left text-xs font-semibold text-[#87919E] uppercase tracking-wider px-4 py-3">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#38435C]/50">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-[#38435C]/20 transition-colors">
              {/* Conta */}
              <td className="px-5 py-3.5">
                <Link
                  href={`/clients/${row.slug}`}
                  className="flex items-center gap-2.5 group"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#0A1E2C] flex items-center justify-center flex-shrink-0">
                    <span className="text-[#95BBE2] font-bold text-xs">
                      {row.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-[#EBEBEB] group-hover:text-[#95BBE2] transition-colors">
                    {row.name}
                  </span>
                </Link>
              </td>

              {/* Gestor */}
              <td className="px-4 py-3.5">
                <span className="text-sm text-[#87919E]">
                  {row.primaryManager ?? '—'}
                </span>
              </td>

              {/* Vendas */}
              <td className="px-4 py-3.5 text-right">
                <span className="text-sm font-medium text-[#EBEBEB]">
                  {fmt(row.vendas, 'number')}
                </span>
              </td>

              {/* CPA */}
              <td className="px-4 py-3.5 text-right">
                <span className="text-sm text-[#EBEBEB]">
                  {fmt(row.cpa, 'currency')}
                </span>
              </td>

              {/* ROAS */}
              <td className="px-4 py-3.5 text-right">
                <span
                  className={
                    row.roas === null
                      ? 'text-sm text-[#87919E]'
                      : row.roas >= 3
                      ? 'text-sm font-semibold text-[#22C55E]'
                      : row.roas >= 1.5
                      ? 'text-sm text-[#EAB308]'
                      : 'text-sm text-[#EF4444]'
                  }
                >
                  {fmt(row.roas, 'roas')}
                </span>
              </td>

              {/* Gasto */}
              <td className="px-4 py-3.5 text-right">
                <span className="text-sm text-[#EBEBEB]">
                  {fmt(row.gasto, 'currency')}
                </span>
              </td>

              {/* Budget */}
              <td className="px-4 py-3.5">
                {row.budgetPlanned ? (
                  <BudgetCell consumed={row.budgetConsumed ?? 0} planned={row.budgetPlanned} />
                ) : (
                  <span className="text-sm text-[#87919E]">—</span>
                )}
              </td>

              {/* CPS */}
              <td className="px-4 py-3.5 text-right">
                <span className="text-sm text-[#EBEBEB]">
                  {fmt(row.cps, 'currency')}
                </span>
              </td>

              {/* Taxa de Conversão */}
              <td className="px-4 py-3.5 text-right">
                <span className="text-sm text-[#EBEBEB]">
                  {fmt(row.taxaConversao, 'percent')}
                </span>
              </td>

              {/* Status */}
              <td className="px-4 py-3.5">
                {row.overallStatus ? (
                  <Badge
                    variant={row.overallStatus.toLowerCase() as 'otimo' | 'regular' | 'ruim'}
                  >
                    {healthLabels[row.overallStatus]}
                  </Badge>
                ) : (
                  <Badge variant="outline">Sem dados</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
