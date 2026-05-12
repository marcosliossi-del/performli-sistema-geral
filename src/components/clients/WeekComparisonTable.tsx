import type { WeekScoreRow } from '@/lib/dal'
import { healthBgClasses, healthLabels } from '@/lib/health'
import { HealthStatus } from '@prisma/client'

interface Props {
  rows: WeekScoreRow[]
}

function StatusBadge({ status }: { status: HealthStatus | null }) {
  if (!status) return <span className="text-[10px] text-[#87919E]">—</span>
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${healthBgClasses[status]}`}>
      {healthLabels[status]}
    </span>
  )
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-[#87919E]">—</span>
  const isUp = value > 0
  const isFlat = value === 0
  const color = isFlat ? 'text-[#87919E]' : isUp ? 'text-[#22C55E]' : 'text-[#EF4444]'
  const arrow = isFlat ? '' : isUp ? '↑' : '↓'
  return (
    <span className={`text-xs font-medium ${color}`}>
      {arrow}{Math.abs(value)}pp
    </span>
  )
}

export function WeekComparisonTable({ rows }: Props) {
  if (rows.length === 0) return null

  return (
    <div>
      <h2 className="text-sm font-semibold text-[#EBEBEB] mb-3">Semana Atual vs Semana Anterior</h2>
      <div className="card overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#38435C]">
              <th className="text-left px-4 py-2.5 text-[#87919E] font-medium">Métrica</th>
              <th className="text-center px-3 py-2.5 text-[#87919E] font-medium">Semana Ant.</th>
              <th className="text-center px-3 py-2.5 text-[#87919E] font-medium">Esta Semana</th>
              <th className="text-center px-3 py-2.5 text-[#87919E] font-medium">Variação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.metric}
                className={`border-b border-[#38435C]/50 ${i % 2 === 0 ? '' : 'bg-[#38435C]/10'}`}
              >
                <td className="px-4 py-2.5 text-[#EBEBEB] font-medium">{row.label}</td>
                <td className="px-3 py-2.5 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <StatusBadge status={row.prevWeekStatus} />
                    {row.prevWeekPct !== null && (
                      <span className="text-[10px] text-[#87919E]">{row.prevWeekPct}%</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <StatusBadge status={row.thisWeekStatus} />
                    {row.thisWeekPct !== null && (
                      <span className="text-[10px] text-[#87919E]">{row.thisWeekPct}%</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <Delta value={row.delta} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
