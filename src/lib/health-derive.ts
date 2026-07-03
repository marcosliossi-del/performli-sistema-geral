import 'server-only'
import type { HealthStatus, GoalPeriod } from '@prisma/client'

/**
 * Janela de saúde unificada — fonte única de verdade da régua A (health).
 *
 * Regra canônica (mesma de getDashboardData): prefere os HealthScore da SEMANA
 * corrente (period=WEEKLY, periodStart >= weekStart); se não houver nenhum,
 * cai para os do MÊS corrente (period=MONTHLY, periodStart >= monthStart).
 * Sobre a janela escolhida aplica pior-vence (RUIM > REGULAR > OTIMO).
 *
 * Retorna null quando não há score na janela canônica → "sem dados de saúde"
 * (o call-site distingue "aguardando dados" de "sem meta" via hasActiveGoal).
 *
 * IMPORTANTE: todos os call-sites (grid, tabela operacional, gestores, agência,
 * Client 360) devem usar ESTE helper para que o mesmo cliente nunca apareça
 * Saudável numa tela e Crítico noutra.
 */

export type HealthScoreLike = {
  status: HealthStatus
  period: GoalPeriod
  periodStart: Date
}

/** Seleciona a janela canônica: WEEKLY da semana corrente, senão MONTHLY do mês. */
export function selectCanonicalScores<T extends HealthScoreLike>(
  scores: T[],
  weekStart: Date,
  monthStart: Date,
): T[] {
  const weekly = scores.filter((s) => s.period === 'WEEKLY' && s.periodStart >= weekStart)
  if (weekly.length > 0) return weekly
  return scores.filter((s) => s.period === 'MONTHLY' && s.periodStart >= monthStart)
}

/** Pior-vence sobre um conjunto já filtrado. null quando vazio. */
export function worstStatus(scores: { status: HealthStatus }[]): HealthStatus | null {
  if (scores.length === 0) return null
  if (scores.some((s) => s.status === 'RUIM')) return 'RUIM'
  if (scores.some((s) => s.status === 'REGULAR')) return 'REGULAR'
  return 'OTIMO'
}

/**
 * Status geral de saúde de um cliente sobre a janela canônica.
 * Combina selectCanonicalScores + worstStatus.
 */
export function deriveOverallStatus(
  scores: HealthScoreLike[],
  weekStart: Date,
  monthStart: Date,
): HealthStatus | null {
  return worstStatus(selectCanonicalScores(scores, weekStart, monthStart))
}
