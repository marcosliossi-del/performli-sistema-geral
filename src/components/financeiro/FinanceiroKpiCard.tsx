'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { formatCurrency, formatNumber } from '@/lib/utils'

interface Props {
  label: string
  value: number | null
  format?: 'currency' | 'number' | 'percent' | 'months'
  delta?: number | null      // % change vs previous period
  icon?: React.ReactNode
  colorScheme?: 'green' | 'red' | 'neutral'
}

export function FinanceiroKpiCard({ label, value, format = 'currency', delta, icon, colorScheme = 'neutral' }: Props) {
  function fmt(v: number | null) {
    if (v === null) return '—'
    switch (format) {
      case 'currency': return formatCurrency(v)
      case 'number':   return formatNumber(v, 0)
      case 'percent':  return `${formatNumber(v, 2)}%`
      case 'months':   return formatNumber(v, 2)
    }
  }

  const iconBg =
    colorScheme === 'green'  ? 'bg-[#22C55E]/10 text-[#22C55E]' :
    colorScheme === 'red'    ? 'bg-[#EF4444]/10 text-[#EF4444]' :
                               'bg-[#95BBE2]/10 text-[#95BBE2]'

  const deltaColor =
    delta == null   ? ''
    : delta > 0     ? 'text-[#22C55E]'
    : delta < 0     ? 'text-[#EF4444]'
    : 'text-[#87919E]'

  const DeltaIcon =
    delta == null ? null
    : delta > 0   ? TrendingUp
    : delta < 0   ? TrendingDown
    : Minus

  return (
    <div className="bg-[#38435C]/20 border border-[#38435C] rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#87919E] font-medium uppercase tracking-wider leading-tight">
          {label}
        </span>
        {icon && (
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconBg}`}>
            {icon}
          </div>
        )}
      </div>

      <span className="text-xl font-bold text-[#EBEBEB] leading-none">
        {fmt(value)}
      </span>

      {delta != null && (
        <div className={`flex items-center gap-1 text-xs ${deltaColor}`}>
          {DeltaIcon && <DeltaIcon size={11} />}
          <span>
            {delta > 0 ? '+' : ''}{formatNumber(delta, 2)}% vs. último período
          </span>
        </div>
      )}
    </div>
  )
}
