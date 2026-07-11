import { ArrowDown } from 'lucide-react'
import type { PortalFunnel } from '@/lib/portal/kpis'

interface FunnelSectionProps {
  funnel: PortalFunnel
}

/** número inteiro pt-BR (1.234). */
function fmtInt(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

/** percentual pt-BR com 1 casa (2,3%). */
function fmtPct(n: number): string {
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

/**
 * Funil de vendas: 4 etapas (Visitas → Carrinho → Checkout → Compras) com
 * barras proporcionais à MAIOR etapa (topo do funil) e a taxa de conversão de
 * cada etapa para a seguinte. Barras em CSS (sem Recharts) — mais legível em
 * 390px e fiel ao design system. Nenhum número inventado: tudo de getPortalFunnel.
 */
export function FunnelSection({ funnel }: FunnelSectionProps) {
  const { stages, cartRate, checkoutRate, purchaseRate, overallRate } = funnel
  const max = Math.max(...stages.map((s) => s.value), 1)
  const stepRates = [cartRate, checkoutRate, purchaseRate]
  const hasData = stages.some((s) => s.value > 0)

  return (
    <section
      aria-labelledby="funnel-title"
      className="rounded-2xl border border-[#38435C] bg-[#0A1E2C] p-5"
    >
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="funnel-title" className="text-sm font-semibold text-[#EBEBEB]">
            Funil de vendas
          </h2>
          <p className="mt-0.5 text-xs text-[#87919E]">
            O caminho da visita até a compra no período.
          </p>
        </div>
        {hasData && (
          <div className="text-left sm:text-right">
            <p className="text-lg font-bold text-[#95BBE2]">{fmtPct(overallRate)}</p>
            <p className="text-[11px] text-[#647488]">das visitas viraram compra</p>
          </div>
        )}
      </div>

      {hasData ? (
        <ol className="space-y-2">
          {stages.map((stage, i) => {
            const widthPct = Math.max(4, Math.round((stage.value / max) * 100))
            return (
              <li key={stage.key}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#EBEBEB]">{stage.label}</span>
                  <span className="tabular-nums text-[#87919E]">{fmtInt(stage.value)}</span>
                </div>
                <div className="mt-1 h-7 w-full overflow-hidden rounded-lg bg-[#38435C]/25">
                  <div
                    className="flex h-full items-center rounded-lg bg-gradient-to-r from-[#95BBE2] to-[#54e0ee]"
                    style={{ width: `${widthPct}%` }}
                    aria-hidden
                  />
                </div>
                {i < stepRates.length && (
                  <div className="flex items-center gap-1 py-1 pl-1 text-[11px] text-[#647488]">
                    <ArrowDown size={11} aria-hidden />
                    <span>
                      <span className="font-semibold text-[#87919E]">
                        {fmtPct(stepRates[i])}
                      </span>{' '}
                      seguiram para a próxima etapa
                    </span>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      ) : (
        <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-[#38435C]/70 text-center">
          <p className="text-sm font-medium text-[#87919E]">Ainda não há dados de funil neste período</p>
          <p className="mt-0.5 text-xs text-[#647488]">
            As etapas aparecem quando houver visitas registradas.
          </p>
        </div>
      )}
    </section>
  )
}
