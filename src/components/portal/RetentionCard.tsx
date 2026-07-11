import { Users, Repeat } from 'lucide-react'
import type { PortalRetention } from '@/lib/portal/ga4sync'
import { formatKpiValue } from './format'

interface RetentionCardProps {
  data: PortalRetention
}

/** número inteiro pt-BR (1.234). */
function fmtInt(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

/** "1,8x" (pedidos por cliente). */
function fmtRatio(n: number): string {
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`
}

/**
 * Retenção e valor do cliente (LTV). Mostra quantos clientes voltaram a comprar
 * em 30/60/90 dias, o valor médio que cada cliente já gerou (LTV) e quantos
 * pedidos faz em média. Linguagem de lojista — nada de jargão técnico. Nenhum
 * número inventado: tudo vem do adapter (que já retorna null se não houver base).
 */
export function RetentionCard({ data }: RetentionCardProps) {
  const windows = [
    { label: 'em 30 dias', value: data.customers30d },
    { label: 'em 60 dias', value: data.customers60d },
    { label: 'em 90 dias', value: data.customers90d },
  ]

  return (
    <section
      aria-labelledby="retention-title"
      className="rounded-2xl border border-[#38435C] bg-[#0A1E2C] p-5"
    >
      <div className="mb-4">
        <h2 id="retention-title" className="text-sm font-semibold text-[#EBEBEB]">
          Clientes que voltam a comprar
        </h2>
        <p className="mt-0.5 text-xs text-[#87919E]">
          De {fmtInt(data.totalCustomers)} clientes, quantos retornaram — e quanto valem.
        </p>
      </div>

      {/* Janelas de retorno 30/60/90d */}
      <div className="grid grid-cols-3 gap-2.5">
        {windows.map((w) => (
          <div
            key={w.label}
            className="rounded-xl border border-[#38435C]/50 bg-[#05141C]/40 p-3 text-center"
          >
            <p className="text-xl font-bold tabular-nums text-[#EBEBEB]">{fmtInt(w.value)}</p>
            <p className="mt-0.5 text-[11px] text-[#647488]">voltaram {w.label}</p>
          </div>
        ))}
      </div>

      {/* LTV médio + pedidos por cliente */}
      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-xl border border-[#95BBE2]/20 bg-[#95BBE2]/5 p-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#95BBE2]/10 text-[#95BBE2]">
            <Users size={16} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-bold tabular-nums text-[#EBEBEB]">
              {formatKpiValue(data.avgLTV, 'currency')}
            </p>
            <p className="text-[11px] text-[#647488]">valor médio por cliente</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-[#95BBE2]/20 bg-[#95BBE2]/5 p-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#95BBE2]/10 text-[#95BBE2]">
            <Repeat size={16} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-bold tabular-nums text-[#EBEBEB]">
              {fmtRatio(data.avgOrdersPerCustomer)}
            </p>
            <p className="text-[11px] text-[#647488]">pedidos por cliente</p>
          </div>
        </div>
      </div>
    </section>
  )
}
