import { ArrowUpRight, ArrowDownRight } from 'lucide-react'
import type { KpiDef } from '@/lib/portal/kpi-registry'
import type { KpiData } from '@/lib/portal/kpis'
import { KpiChart } from './KpiChart'
import { formatKpiValue, formatDeltaPct } from './format'

interface KpiCardProps {
  def: KpiDef
  data: KpiData | undefined
  /**
   * Semântica de cor invertida: para métricas onde MENOR é melhor (ex.: custo
   * por visita/CPS). Sobe = ruim (vermelho), cai = bom (verde).
   */
  lowerIsBetter?: boolean
  /**
   * Delta sem juízo de valor: mostra a variação e a seta, mas SEMPRE em cinza
   * neutro. Para métricas onde subir/cair não é intrinsecamente bom nem ruim
   * (ex.: Investimento — gastar mais ou menos depende da estratégia). Tem
   * precedência sobre `lowerIsBetter`.
   */
  neutralDelta?: boolean
}

export function KpiCard({ def, data, lowerIsBetter = false, neutralDelta = false }: KpiCardProps) {
  const hasData = data && data.value !== null
  const deltaPct = data?.deltaPct ?? null
  const deltaLabel = formatDeltaPct(deltaPct)

  // direção real do resultado (bom/ruim) considerando menor=melhor
  const isUp = deltaPct !== null && deltaPct > 0
  const isDown = deltaPct !== null && deltaPct < 0
  const isGood =
    neutralDelta || deltaPct === null || deltaPct === 0
      ? null
      : lowerIsBetter
        ? deltaPct < 0
        : deltaPct > 0

  const deltaColor =
    isGood === null ? 'text-[#87919E]' : isGood ? 'text-[#22C55E]' : 'text-[#EF4444]'

  return (
    <div className="flex flex-col rounded-2xl border border-[#38435C] bg-[#0A1E2C] p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            className="truncate text-sm font-medium text-[#87919E]"
            title={def.helpText}
          >
            {def.label}
          </h3>
          {def.provisional && (
            <span className="mt-1 inline-block rounded-full border border-[#38435C] px-1.5 py-0.5 text-[10px] text-[#647488]">
              prévia
            </span>
          )}
        </div>
      </div>

      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-[#EBEBEB]">
          {formatKpiValue(data?.value ?? null, def.format)}
        </span>
        {hasData && deltaLabel && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${deltaColor}`}>
            {isUp && <ArrowUpRight size={13} />}
            {isDown && <ArrowDownRight size={13} />}
            {deltaLabel}
          </span>
        )}
      </div>

      {hasData ? (
        <>
          <p className="mb-3 text-xs text-[#647488]">vs. período anterior</p>
          <KpiChart series={data.series} chartType={def.chartType} format={def.format} />
        </>
      ) : (
        <div className="flex h-[120px] flex-col items-center justify-center rounded-xl border border-dashed border-[#38435C]/70 text-center">
          <p className="text-xs font-medium text-[#87919E]">Sem dados no período</p>
          <p className="mt-0.5 text-[11px] text-[#647488]">
            Dados sendo sincronizados
          </p>
        </div>
      )}
    </div>
  )
}
