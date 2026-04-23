'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface DataPoint {
  month: string
  entradas: number
  saidas: number
}

interface Props {
  data: DataPoint[]
}

function fmt(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `R$ ${(v / 1_000).toFixed(0)}k`
  return formatCurrency(v)
}

export function EntradaSaidaChart({ data }: Props) {
  return (
    <div className="bg-[#38435C]/20 border border-[#38435C] rounded-xl p-4">
      <h3 className="text-sm font-semibold text-[#EBEBEB] mb-4">Entrada x Saída</h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorEntradas" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#22C55E" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorSaidas" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#EF4444" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#38435C" />
          <XAxis dataKey="month" tick={{ fill: '#87919E', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={fmt} tick={{ fill: '#87919E', fontSize: 10 }} axisLine={false} tickLine={false} width={60} />
          <Tooltip
            contentStyle={{ background: '#0A1E2C', border: '1px solid #38435C', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#EBEBEB' }}
            formatter={(v) => [formatCurrency(Number(v))]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: '#87919E', paddingTop: 8 }}
            formatter={(v) => v === 'entradas' ? 'Entrada' : 'Saída'}
          />
          <Area type="monotone" dataKey="entradas" stroke="#22C55E" strokeWidth={2} fill="url(#colorEntradas)" />
          <Area type="monotone" dataKey="saidas"   stroke="#EF4444" strokeWidth={2} fill="url(#colorSaidas)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
