'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import type { HealthWeekPoint } from '@/lib/dal'

interface Props {
  data: HealthWeekPoint[]
}

function dot(cx: number, cy: number, status: string | null) {
  const color =
    status === 'OTIMO' ? '#22C55E'
    : status === 'REGULAR' ? '#EAB308'
    : status === 'RUIM' ? '#EF4444'
    : '#38435C'
  return <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={5} fill={color} stroke="#0A1E2C" strokeWidth={2} />
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomDot(props: any) {
  const { cx, cy, payload } = props
  return dot(cx, cy, payload.status)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as HealthWeekPoint
  const color =
    d.status === 'OTIMO' ? '#22C55E'
    : d.status === 'REGULAR' ? '#EAB308'
    : d.status === 'RUIM' ? '#EF4444'
    : '#87919E'
  return (
    <div className="bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-[#87919E] mb-1">Semana de {d.weekLabel}</p>
      <p style={{ color }} className="font-semibold">{d.avgPct}% atingimento</p>
    </div>
  )
}

export function HealthScoreHistoryChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-28 text-xs text-[#87919E]">
        Sem histórico semanal disponível
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#38435C" vertical={false} />
        <XAxis
          dataKey="weekLabel"
          tick={{ fill: '#87919E', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[0, 120]}
          tick={{ fill: '#87919E', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#38435C' }} />
        <ReferenceLine y={90} stroke="#22C55E" strokeDasharray="4 4" strokeOpacity={0.5} />
        <ReferenceLine y={70} stroke="#EAB308" strokeDasharray="4 4" strokeOpacity={0.5} />
        <Line
          type="monotone"
          dataKey="avgPct"
          stroke="#95BBE2"
          strokeWidth={2}
          dot={<CustomDot />}
          activeDot={{ r: 6, fill: '#95BBE2' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
