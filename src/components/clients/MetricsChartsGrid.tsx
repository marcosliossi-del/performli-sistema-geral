'use client'

import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { MetricHistoryPoint } from '@/lib/dal'

// ─── Types ────────────────────────────────────────────────────────────────────

type MetricKey = keyof Omit<MetricHistoryPoint, 'date'>

interface ChartConfig {
  key: MetricKey
  label: string
  type: 'area' | 'line'
  color: string
  format: (v: number) => string
  lowerIsBetter?: boolean
}

const CHARTS: ChartConfig[] = [
  { key: 'spend',       label: 'Investimento (R$)', type: 'area',  color: '#95BBE2', format: (v) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  { key: 'roas',        label: 'ROAS',              type: 'line',  color: '#22C55E', format: (v) => `${v.toFixed(2)}x` },
  { key: 'conversions', label: 'Conversões',        type: 'area',  color: '#A78BFA', format: (v) => v.toLocaleString('pt-BR') },
  { key: 'cpl',         label: 'CPL (R$)',          type: 'line',  color: '#F59E0B', format: (v) => `R$ ${v.toFixed(2)}`, lowerIsBetter: true },
  { key: 'clicks',      label: 'Cliques',           type: 'area',  color: '#95BBE2', format: (v) => v.toLocaleString('pt-BR') },
  { key: 'impressions', label: 'Impressões',        type: 'area',  color: '#87919E', format: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v) },
]

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label, format }: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
  format: (v: number) => string
}) {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  return (
    <div className="bg-[#0A1E2C] border border-[#38435C] rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="text-[#87919E] mb-0.5">{label}</p>
      <p className="text-[#EBEBEB] font-semibold">{format(val)}</p>
    </div>
  )
}

// ─── Single chart card ────────────────────────────────────────────────────────

function MetricChartCard({ config, data }: { config: ChartConfig; data: MetricHistoryPoint[] }) {
  const chartData = data.map((p) => ({
    date: p.date.slice(5), // 'MM-DD'
    value: p[config.key] as number | null,
  }))

  const hasData = chartData.some((p) => p.value !== null)
  if (!hasData) return null

  const nonNull = chartData.filter((p) => p.value !== null).map((p) => p.value as number)
  const min = Math.min(...nonNull)
  const max = Math.max(...nonNull)
  const range = max - min
  const domainMin = config.lowerIsBetter
    ? Math.max(0, min - range * 0.3)
    : Math.max(0, min - range * 0.1)
  const domainMax = max + range * 0.2

  return (
    <div className="bg-[#0A1E2C] border border-[#38435C] rounded-2xl p-4">
      <p className="text-xs font-semibold text-[#87919E] mb-3">{config.label}</p>
      <ResponsiveContainer width="100%" height={120}>
        {config.type === 'area' ? (
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`grad-${config.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={config.color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={config.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1C2E3E" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#87919E', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis domain={[domainMin, domainMax]} hide />
            <Tooltip content={<CustomTooltip format={config.format} />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={config.color}
              strokeWidth={2}
              fill={`url(#grad-${config.key})`}
              dot={false}
              activeDot={{ r: 3, fill: config.color }}
              connectNulls={false}
            />
          </AreaChart>
        ) : (
          <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1C2E3E" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#87919E', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis domain={[domainMin, domainMax]} hide />
            <Tooltip content={<CustomTooltip format={config.format} />} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={config.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: config.color }}
              connectNulls={false}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

// ─── Main export: grid of charts ─────────────────────────────────────────────

export function MetricsChartsGrid({ data }: { data: MetricHistoryPoint[] }) {
  const visibleCharts = CHARTS.filter((c) => data.some((p) => p[c.key] !== null))

  if (visibleCharts.length === 0) {
    return (
      <div className="text-center py-10 text-[#87919E] text-sm">
        Nenhum dado histórico disponível ainda. Sincronize a conta Meta para ver os gráficos.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
      {visibleCharts.map((cfg) => (
        <MetricChartCard key={cfg.key} config={cfg} data={data} />
      ))}
    </div>
  )
}
