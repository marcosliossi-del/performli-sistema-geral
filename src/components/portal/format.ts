import type { KpiFormat } from '@/lib/portal/kpi-registry'

/**
 * Formatação pt-BR dos valores de KPI do portal do lojista.
 * currency → 'R$ 12.345,67' · number → '1.234' · percent → '2,34%' · ratio → '4,2x'
 */
export function formatKpiValue(value: number | null, format: KpiFormat): string {
  if (value === null || Number.isNaN(value)) return '—'

  switch (format) {
    case 'currency':
      return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    case 'number':
      return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
    case 'percent':
      return `${value.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}%`
    case 'ratio':
      return `${value.toLocaleString('pt-BR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}x`
  }
}

/** deltaPct (ex.: 12.3) → '+12,3%' / '−4,0%' */
export function formatDeltaPct(deltaPct: number | null): string | null {
  if (deltaPct === null || Number.isNaN(deltaPct)) return null
  const sign = deltaPct > 0 ? '+' : deltaPct < 0 ? '−' : ''
  const abs = Math.abs(deltaPct).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  return `${sign}${abs}%`
}

/** 'YYYY-MM-DD' → 'dd/mm' (sem criar Date com fuso — parse manual). */
export function shortDateBR(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}
