import { HealthStatus } from '@prisma/client'

/**
 * Core business rule: classify health based on % of goal achieved.
 * ≥ 90% → OTIMO
 * 70–89% → REGULAR
 * < 70% → RUIM
 */
export function classifyHealth(actual: number, target: number): HealthStatus {
  if (target === 0) return 'RUIM'
  const pct = (actual / target) * 100
  if (pct >= 90) return 'OTIMO'
  if (pct >= 70) return 'REGULAR'
  return 'RUIM'
}

export function achievementPercent(actual: number, target: number): number {
  if (target === 0) return 0
  return Math.min((actual / target) * 100, 999)
}

export const healthLabels: Record<HealthStatus, string> = {
  OTIMO: 'Ótimo',
  REGULAR: 'Regular',
  RUIM: 'Ruim',
}

export const healthColors: Record<HealthStatus, string> = {
  OTIMO: '#22C55E',
  REGULAR: '#EAB308',
  RUIM: '#EF4444',
}

export const healthBgClasses: Record<HealthStatus, string> = {
  OTIMO: 'badge-otimo',
  REGULAR: 'badge-regular',
  RUIM: 'badge-ruim',
}
