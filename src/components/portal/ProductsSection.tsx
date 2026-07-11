import type { PortalProductRow } from '@/lib/portal/ga4sync'
import { formatKpiValue } from './format'

interface ProductsSectionProps {
  /** Produtos JÁ ordenados desc por receita (top vindos do adapter). */
  rows: PortalProductRow[]
}

/** número inteiro pt-BR (1.234). */
function fmtInt(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

/**
 * Produtos mais vendidos: Produto | Unidades | Receita. Em desktop é uma tabela
 * enxuta com cabeçalho; em 390px vira lista empilhada (cada produto num card com
 * unidades e receita lado a lado). Nenhum número inventado — tudo do adapter.
 */
export function ProductsSection({ rows }: ProductsSectionProps) {
  return (
    <section
      aria-labelledby="products-title"
      className="rounded-2xl border border-[#38435C] bg-[#0A1E2C] p-5"
    >
      <div className="mb-4">
        <h2 id="products-title" className="text-sm font-semibold text-[#EBEBEB]">
          Produtos mais vendidos
        </h2>
        <p className="mt-0.5 text-xs text-[#87919E]">Os campeões de receita no período.</p>
      </div>

      {/* Desktop: tabela. Escondida em mobile (< sm). */}
      <table className="hidden w-full text-left sm:table">
        <thead>
          <tr className="border-b border-[#38435C] text-[11px] uppercase tracking-wide text-[#647488]">
            <th scope="col" className="pb-2 font-medium">
              Produto
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Unidades
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Receita
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.productId} className="border-b border-[#38435C]/40 last:border-0">
              <td className="py-2.5 pr-3 text-sm text-[#EBEBEB]">{row.name}</td>
              <td className="py-2.5 text-right text-sm tabular-nums text-[#87919E]">
                {fmtInt(row.unitsSold)}
              </td>
              <td className="py-2.5 text-right text-sm font-semibold tabular-nums text-[#EBEBEB]">
                {formatKpiValue(row.revenue, 'currency')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile: lista empilhada. */}
      <ul className="space-y-2.5 sm:hidden">
        {rows.map((row) => (
          <li
            key={row.productId}
            className="rounded-xl border border-[#38435C]/50 bg-[#05141C]/40 p-3"
          >
            <p className="text-sm font-medium text-[#EBEBEB]">{row.name}</p>
            <div className="mt-1.5 flex items-center justify-between text-xs">
              <span className="text-[#647488]">
                <span className="tabular-nums text-[#87919E]">{fmtInt(row.unitsSold)}</span> un.
                vendidas
              </span>
              <span className="font-semibold tabular-nums text-[#EBEBEB]">
                {formatKpiValue(row.revenue, 'currency')}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
