'use client'

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface Slice {
  name: string
  value: number
  color?: string
}

interface Props {
  title: string
  data: Slice[]
}

const DEFAULT_COLORS = [
  '#22C55E', '#EF4444', '#3B82F6', '#F59E0B', '#8B5CF6',
  '#06B6D4', '#EC4899', '#6B7280',
]

export function DistribuicaoDonut({ title, data }: Props) {
  const total = data.reduce((s, d) => s + d.value, 0)

  if (data.length === 0 || total === 0) {
    return (
      <div className="bg-[#38435C]/20 border border-[#38435C] rounded-xl p-4">
        <h3 className="text-sm font-semibold text-[#EBEBEB] mb-4">{title}</h3>
        <div className="flex items-center justify-center h-[180px] text-[#87919E] text-sm">
          Sem dados no período
        </div>
      </div>
    )
  }

  const colored = data.map((d, i) => ({
    ...d,
    color: d.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  }))

  return (
    <div className="bg-[#38435C]/20 border border-[#38435C] rounded-xl p-4">
      <h3 className="text-sm font-semibold text-[#EBEBEB] mb-2">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={colored}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {colored.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#0A1E2C', border: '1px solid #38435C', borderRadius: 8, fontSize: 12 }}
            formatter={(v, name) => [
              `${formatCurrency(Number(v))} (${((Number(v) / total) * 100).toFixed(1)}%)`,
              name as string,
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value) => <span style={{ color: '#87919E' }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
