import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { metricLabels } from '@/lib/dal'
import type { GoalPaceMetrics } from '@/lib/dal'

function formatValue(metric: string, value: number | null) {
  if (value === null) return '—'
  const currency = ['INVESTMENT', 'SPEND', 'CPL', 'CPA', 'CAC', 'CPC', 'FATURAMENTO', 'TICKET_MEDIO', 'CPS', 'CPM']
  const pct = ['CTR', 'TAXA_CONVERSAO']
  if (currency.includes(metric)) return formatCurrency(value)
  if (pct.includes(metric)) return `${value.toFixed(2)}%`
  if (metric === 'ROAS') return `${value.toFixed(2)}x`
  return formatNumber(value, 0)
}

type Props = {
  goals: GoalPaceMetrics[]
  daysElapsed: number
  daysInMonth: number
}

export function GoalPaceCard({ goals, daysElapsed, daysInMonth }: Props) {
  if (goals.length === 0) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-[#EBEBEB]">Ritmo das Metas Mensais</h2>
          <p className="text-[10px] text-[#87919E] mt-0.5">
            Dia {daysElapsed} de {daysInMonth} — realizado no mês (fonte única: mesma base de /agency/metas)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {goals.map((goal) => {
          const paceOk = goal.paceAchievement !== null && goal.paceAchievement >= 90
          const paceLow = goal.paceAchievement !== null && goal.paceAchievement < 70
          const paceColor = paceOk ? '#22C55E' : paceLow ? '#EF4444' : '#EAB308'

          return (
            <div key={goal.goalId} className="bg-[#0A1E2C] border border-[#38435C] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-semibold text-[#87919E] uppercase tracking-wide">
                  {metricLabels[goal.metric] ?? goal.metric}
                </p>
                {goal.paceAchievement !== null && (
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `${paceColor}15`,
                      color: paceColor,
                    }}
                  >
                    {Math.round(goal.paceAchievement)}% do ritmo
                  </span>
                )}
              </div>

              {/* Monthly target */}
              <div className="mb-2">
                <p className="text-[10px] text-[#87919E]">Meta do mês</p>
                <p className="text-lg font-bold text-[#EBEBEB]">
                  {formatValue(goal.metric, goal.targetValue)}
                </p>
              </div>

              {/* Daily / Weekly targets — só para métricas ACUMULATIVAS.
                  Métricas de razão/média (ROAS, CTR, CPL...) não têm "meta
                  diária/semanal": dailyTarget/weeklyTarget vêm null (S2-015). */}
              {goal.dailyTarget !== null && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-[#38435C]/30 rounded-lg p-2">
                    <p className="text-[9px] text-[#87919E] uppercase tracking-wide">Meta diária</p>
                    <p className="text-sm font-semibold text-[#EBEBEB]">
                      {formatValue(goal.metric, goal.dailyTarget)}
                    </p>
                  </div>
                  <div className="bg-[#38435C]/30 rounded-lg p-2">
                    <p className="text-[9px] text-[#87919E] uppercase tracking-wide">Meta semanal</p>
                    <p className="text-sm font-semibold text-[#EBEBEB]">
                      {formatValue(goal.metric, goal.weeklyTarget)}
                    </p>
                  </div>
                </div>
              )}

              {/* Current vs expected */}
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#87919E]">Realizado no mês</span>
                  <span className="font-semibold text-[#EBEBEB]">
                    {formatValue(goal.metric, goal.actualValue)}
                  </span>
                </div>
                {goal.dailyTarget !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#87919E]">Esperado pro dia {daysElapsed}</span>
                    <span className="text-[#87919E]">
                      {formatValue(goal.metric, goal.paceExpected)}
                    </span>
                  </div>
                )}
                {goal.dailyTarget !== null && (
                  <div className="flex items-center justify-between border-t border-[#38435C]/50 pt-1.5">
                    <span className="text-[#87919E]">Projeção p/ fechar mês</span>
                    <span className="font-semibold" style={{ color: paceColor }}>
                      {formatValue(goal.metric, goal.projectedMonth)}
                    </span>
                  </div>
                )}
              </div>

              {/* Pace bar */}
              {goal.paceAchievement !== null && (
                <div className="mt-2">
                  <div className="w-full bg-[#38435C] rounded-full h-1">
                    <div
                      className="h-1 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, Math.round(goal.paceAchievement))}%`,
                        backgroundColor: paceColor,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
