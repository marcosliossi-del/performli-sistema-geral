'use client'

import type { SalesFunnelData } from '@/lib/dal'
import { formatNumber } from '@/lib/utils'

type Props = { data: SalesFunnelData }

type Step = {
  label:  string
  sub:    string
  value:  number
  rate:   number | null      // conversion from previous step (%)
  bench:  { min: number; max: number } | null
}

function rateColor(rate: number | null, bench: { min: number; max: number } | null): string {
  if (rate === null || bench === null) return 'text-[#87919E]'
  if (rate >= bench.min) return 'text-[#22C55E]'
  if (rate >= bench.min * 0.75) return 'text-[#EAB308]'
  return 'text-[#EF4444]'
}

function rateIcon(rate: number | null, bench: { min: number; max: number } | null): string {
  if (rate === null || bench === null) return ''
  if (rate >= bench.min) return '✓'
  if (rate >= bench.min * 0.75) return '~'
  return '↓'
}

export function SalesFunnelSection({ data }: Props) {
  if (!data.hasData) {
    return (
      <div className="bg-[#0A1E2C] border border-[#38435C] rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-[#EBEBEB] mb-1">Funil de Vendas</h2>
        <p className="text-sm text-[#87919E]">Aguardando dados do GA4 — sincronize a conta para visualizar o funil.</p>
      </div>
    )
  }

  const maxValue = Math.max(data.sessions, 1)

  const steps: Step[] = [
    {
      label: 'Sessões',
      sub:   'visitantes no site',
      value: data.sessions,
      rate:  null,
      bench: null,
    },
    {
      label: 'Carrinho',
      sub:   'add to cart',
      value: data.addToCarts,
      rate:  data.visitToCart,
      bench: data.benchmarks.visitToCart,
    },
    {
      label: 'Checkout',
      sub:   'início de checkout',
      value: data.checkoutsStarted,
      rate:  data.cartToCheckout,
      bench: data.benchmarks.cartToCheckout,
    },
    {
      label: 'Compras',
      sub:   'pedidos finalizados',
      value: data.purchases,
      rate:  data.checkoutToPurchase,
      bench: data.benchmarks.checkoutToPurchase,
    },
  ]

  return (
    <div className="bg-[#0A1E2C] border border-[#38435C] rounded-2xl p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-[#EBEBEB]">Funil de Vendas</h2>
          <p className="text-[10px] text-[#87919E] mt-0.5">Jornada do cliente no site — fonte GA4</p>
        </div>
        {data.overallConversion !== null && (
          <div className="text-right">
            <p className="text-[10px] text-[#87919E] uppercase tracking-wide">Conversão geral</p>
            <p className={`text-lg font-bold ${rateColor(data.overallConversion, data.benchmarks.overallConversion)}`}>
              {data.overallConversion.toFixed(2)}%
            </p>
            <p className="text-[10px] text-[#87919E]">
              ref: {data.benchmarks.overallConversion.min}–{data.benchmarks.overallConversion.max}%
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {steps.map((step, i) => {
          const barWidth = maxValue > 0 ? Math.round((step.value / maxValue) * 100) : 0
          const color = step.rate !== null
            ? rateColor(step.rate, step.bench)
            : 'text-[#95BBE2]'

          return (
            <div key={step.label}>
              {/* Conversion rate badge between steps */}
              {step.rate !== null && (
                <div className={`flex items-center gap-1.5 text-xs font-semibold ml-2 mb-1 ${rateColor(step.rate, step.bench)}`}>
                  <span>{rateIcon(step.rate, step.bench)}</span>
                  <span>{step.rate.toFixed(1)}%</span>
                  {step.bench && (
                    <span className="text-[#87919E] font-normal">
                      (ref: {step.bench.min}–{step.bench.max}%)
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3">
                {/* Bar */}
                <div className="flex-1 relative h-9 bg-[#131E2E] rounded-lg overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-[#95BBE2]/30 rounded-lg transition-all"
                    style={{ width: `${barWidth}%` }}
                  />
                  <div className="absolute inset-0 flex items-center px-3">
                    <span className="text-xs font-semibold text-[#EBEBEB] z-10">
                      {step.label}
                    </span>
                    <span className="ml-1.5 text-[10px] text-[#87919E] z-10">{step.sub}</span>
                  </div>
                </div>

                {/* Value */}
                <div className="w-20 text-right">
                  <span className={`text-sm font-bold ${color}`}>
                    {formatNumber(step.value, 0)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Reference benchmarks legend */}
      <div className="mt-5 pt-4 border-t border-[#38435C]">
        <p className="text-[10px] font-semibold text-[#EAB308] uppercase tracking-wide mb-2">Referências do setor (e-commerce)</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          {[
            { label: 'Visita → Carrinho',    bench: data.benchmarks.visitToCart },
            { label: 'Carrinho → Checkout',  bench: data.benchmarks.cartToCheckout },
            { label: 'Checkout → Compra',    bench: data.benchmarks.checkoutToPurchase },
            { label: 'Taxa de Conversão',    bench: data.benchmarks.overallConversion },
          ].map(({ label, bench }) => (
            <div key={label} className="flex items-center justify-between text-[10px]">
              <span className="text-[#87919E]">{label}:</span>
              <span className="text-[#EAB308] font-semibold ml-2">{bench.min}% a {bench.max}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
