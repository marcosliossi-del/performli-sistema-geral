import type { KpiDef } from '@/lib/portal/kpi-registry'
import type { PortalProjection } from '@/lib/portal/kpis'
import { formatKpiValue } from './format'

interface ProjectionCardProps {
  def: KpiDef
  data: PortalProjection | undefined
}

const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** 'YYYY-MM' → 'julho' (parse manual, sem fuso). */
function monthLabel(month: string): string {
  const idx = Number(month.slice(5, 7)) - 1
  return MONTH_NAMES[idx] ?? month
}

/**
 * Card da "Projeção do mês". É STANDALONE: independe do seletor de período
 * (sempre o mês corrente) e NÃO tem série diária — por isso não usa KpiChart.
 * No lugar do gráfico, mostra o quanto do mês já passou (barra de progresso) e
 * o faturamento acumulado até hoje, para o lojista entender de onde vem a
 * estimativa. Nenhum número é inventado: tudo vem de getPortalProjection.
 */
export function ProjectionCard({ def, data }: ProjectionCardProps) {
  const hasData = data != null && data.value !== null
  const progressPct =
    data && data.daysInMonth > 0
      ? Math.min(100, Math.round((data.daysElapsed / data.daysInMonth) * 100))
      : 0

  return (
    <div className="flex flex-col rounded-2xl border border-[#95BBE2]/25 bg-gradient-to-b from-[#0D2333] to-[#0A1E2C] p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-[#95BBE2]" title={def.helpText}>
            {def.label}
          </h3>
          <span className="mt-1 inline-block rounded-full border border-[#95BBE2]/30 px-1.5 py-0.5 text-[10px] text-[#95BBE2]/80">
            {data ? `em ${monthLabel(data.month)}` : 'mês atual'}
          </span>
        </div>
      </div>

      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-[#EBEBEB]">
          {formatKpiValue(data?.value ?? null, def.format)}
        </span>
        <span className="text-xs text-[#647488]">estimado</span>
      </div>

      {hasData && data ? (
        <div className="mt-3 space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px] text-[#647488]">
              <span>
                Dia {data.daysElapsed} de {data.daysInMonth}
              </span>
              <span>{progressPct}% do mês</span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-[#38435C]/40"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Percentual do mês decorrido"
            >
              <div
                className="h-full rounded-full bg-[#95BBE2]"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          <p className="text-xs text-[#87919E]">
            Já vendeu{' '}
            <span className="font-semibold text-[#EBEBEB]">
              {formatKpiValue(data.accumulated, def.format)}
            </span>{' '}
            até agora, no ritmo atual.
          </p>
        </div>
      ) : (
        <div className="mt-3 flex h-[96px] flex-col items-center justify-center rounded-xl border border-dashed border-[#38435C]/70 text-center">
          <p className="text-xs font-medium text-[#87919E]">Ainda não há vendas neste mês</p>
          <p className="mt-0.5 text-[11px] text-[#647488]">A projeção aparece após o primeiro dia com vendas</p>
        </div>
      )}
    </div>
  )
}
