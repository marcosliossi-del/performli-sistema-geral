import type { MetricType } from '@prisma/client'
import { saoPauloDateString } from '@/lib/utils'
import {
  LOWER_IS_BETTER,
  PRORATE_METRICS,
  computeAchievementPct,
} from '@/services/health-scorer'

/**
 * FONTE ÚNICA de pró-rata / projeção / fuso do mês (Lote 2 da Auditoria
 * Sistêmica — A-007/A-008/A-002). Tudo ancorado no DIA-PAREDE de São Paulo
 * (`saoPauloDateString`) e com bounds em UTC-midnight (00:00Z) — a MESMA
 * convenção das colunas `@db.Date` (que voltam 00:00Z) e do health-scorer.
 *
 * Antes desta fonte, quatro fórmulas independentes calculavam `daysElapsed`
 * (getDate() em fuso do servidor, daysInRange do período, etc.), fazendo a
 * projeção/pace da UI divergir do achievementPct congelado no cron entre
 * 21:00–23:59 SP. Aqui há UMA definição.
 */

export type SpDayInfo = {
  /** Instante UTC do início do dia-parede SP (00:00Z do dia SP). Casa com `@db.Date`. */
  spDayStartUtc: Date
  /** Dia do mês (1-based, inclui hoje) no fuso SP. */
  daysElapsedInMonth: number
  /** Total de dias do mês corrente (fuso SP). */
  totalDaysInMonth: number
  /** Dias restantes até o fim do mês (SP). */
  daysRemaining: number
}

/** Informações do dia-parede SP para o mês corrente (ou de `ref`). */
export function spDayInfo(ref: Date = new Date()): SpDayInfo {
  const spDay = saoPauloDateString(ref) // 'YYYY-MM-DD' (dia-parede SP)
  const year = Number(spDay.slice(0, 4))
  const month = Number(spDay.slice(5, 7)) // 1-based
  const day = Number(spDay.slice(8, 10))
  const spDayStartUtc = new Date(`${spDay}T00:00:00.000Z`)
  // Date.UTC(year, month, 0): dia 0 do mês seguinte = último dia do mês corrente.
  const totalDaysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    spDayStartUtc,
    daysElapsedInMonth: day,
    totalDaysInMonth,
    daysRemaining: totalDaysInMonth - day,
  }
}

/**
 * Projeção run-rate do mês: acumulado ÷ dias decorridos × dias do mês.
 * Retorna null quando não há base (actual nulo ou divisão por zero).
 * Arredonda a 2 casas (valores monetários/contagens).
 */
export function projectMonth(
  actual: number | null,
  daysElapsed: number,
  totalDays: number,
): number | null {
  if (actual == null || daysElapsed <= 0 || totalDays <= 0) return null
  return Math.round((actual / daysElapsed) * totalDays * 100) / 100
}

/**
 * Elapsed de um período arbitrário (semana/mês), ancorado no dia-parede SP.
 * Espelha EXATAMENTE a matemática do health-scorer (startDay/endDay em
 * UTC-midnight, `today` = 00:00Z do dia SP, elapsed capado ao total) para que
 * o "esperado até hoje" da UI bata com o achievementPct congelado no cron.
 */
export function periodElapsed(
  periodStart: Date,
  periodEnd: Date,
  ref: Date = new Date(),
): { totalDays: number; daysElapsed: number; inProgress: boolean } {
  const startDay = new Date(periodStart); startDay.setUTCHours(0, 0, 0, 0)
  const endDay = new Date(periodEnd); endDay.setUTCHours(0, 0, 0, 0)
  const today = new Date(`${saoPauloDateString(ref)}T00:00:00.000Z`)
  const totalDays = Math.round((endDay.getTime() - startDay.getTime()) / 86_400_000) + 1
  const daysElapsed = Math.min(
    Math.floor((today.getTime() - startDay.getTime()) / 86_400_000) + 1,
    totalDays,
  )
  return {
    totalDays: Math.max(totalDays, 1),
    daysElapsed: Math.max(daysElapsed, 1),
    inProgress: today.getTime() < endDay.getTime(),
  }
}

/**
 * Alvo PRÓ-RATA ("esperado até hoje"): meta cheia × (dias decorridos ÷ total),
 * apenas para métricas acumulativas (`PRORATE_METRICS`). Métricas de razão/média
 * (ROAS, CTR, CPL…) NÃO se prorateiam — o esperado é a própria meta. Fonte da
 * lista = health-scorer (mesma do cron).
 */
export function proRataExpected(
  metric: MetricType,
  rawTarget: number,
  daysElapsed: number,
  totalDays: number,
): number {
  const inProgress = daysElapsed < totalDays
  if (inProgress && totalDays > 0 && PRORATE_METRICS.has(metric)) {
    return rawTarget * (Math.max(daysElapsed, 1) / totalDays)
  }
  return rawTarget
}

/**
 * % de atingimento AO VIVO contra o alvo pró-rata (decisão P2=A). Recalcula com
 * o realizado ao vivo (não usa o achievementPct congelado). Respeita
 * lowerIsBetter (custo: esperado ÷ realizado). Fonte da fórmula = health-scorer.
 */
export function liveAchievementPct(
  metric: MetricType,
  actual: number,
  rawTarget: number,
  daysElapsed: number,
  totalDays: number,
): number | null {
  const expected = proRataExpected(metric, rawTarget, daysElapsed, totalDays)
  return computeAchievementPct(actual, expected, LOWER_IS_BETTER.has(metric))
}
