'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  Tooltip,
} from 'recharts'
import type { KpiPoint } from '@/lib/portal/kpis'
import type { KpiFormat } from '@/lib/portal/kpi-registry'
import { formatKpiValue, shortDateBR } from './format'

interface KpiChartProps {
  series: KpiPoint[]
  chartType: 'line' | 'bar'
  format: KpiFormat
  color?: string
}

type Row = { date: string; label: string; value: number | null }

function TooltipContent({
  active,
  payload,
  format,
}: {
  active?: boolean
  payload?: Array<{ payload: Row }>
  format: KpiFormat
}) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0].payload
  return (
    <div className="rounded-lg border border-[#38435C] bg-[#0A1E2C] px-2.5 py-1.5 text-xs shadow-lg">
      <p className="text-[#87919E]">{row.label}</p>
      <p className="font-semibold text-[#EBEBEB]">{formatKpiValue(row.value, format)}</p>
    </div>
  )
}

export function KpiChart({ series, chartType, format, color = '#54e0ee' }: KpiChartProps) {
  const data: Row[] = series.map((p) => ({
    date: p.date,
    label: shortDateBR(p.date),
    value: p.value,
  }))

  const hasValue = data.some((d) => d.value !== null)
  if (!hasValue) {
    return <div className="h-[120px]" aria-hidden />
  }

  return (
    <ResponsiveContainer width="100%" height={120}>
      {chartType === 'bar' ? (
        <BarChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: '#647488', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <Tooltip
            cursor={{ fill: 'rgba(149,187,226,0.08)' }}
            content={<TooltipContent format={format} />}
          />
          <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} />
        </BarChart>
      ) : (
        <LineChart data={data} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: '#647488', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <Tooltip
            cursor={{ stroke: '#38435C', strokeWidth: 1 }}
            content={<TooltipContent format={format} />}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            connectNulls
            activeDot={{ r: 3, fill: color }}
          />
        </LineChart>
      )}
    </ResponsiveContainer>
  )
}
