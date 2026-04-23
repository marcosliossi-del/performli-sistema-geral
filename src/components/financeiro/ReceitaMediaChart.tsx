'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface Props {
  data: Array<{ month: string; value: number }>
}

function fmt(v: number) {
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`
  return formatCurrency(v)
}

export function ReceitaMediaChart({ data }: Props) {
  return (
    <div className="bg-[#38435C]/20 border border-[#38435C] rounded-xl p-4">
      <h3 className="text-sm font-semibold text-[#EBEBEB] mb-4">Receita média por cliente</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#38435C" />
          <XAxis dataKey="month" tick={{ fill: '#87919E', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={fmt} tick={{ fill: '#87919E', fontSize: 10 }} axisLine={false} tickLine={false} width={60} />
          <Tooltip
            contentStyle={{ background: '#0A1E2C', border: '1px solid #38435C', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#EBEBEB' }}
            formatter={(v) => [formatCurrency(Number(v)), 'Receita média']}
          />
          <Line
            type="monotone" dataKey="value" stroke="#22C55E"
            strokeWidth={2} dot={{ fill: '#22C55E', r: 3 }} activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
