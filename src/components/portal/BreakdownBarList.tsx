import { formatKpiValue } from './format'

/** Uma linha genérica de quebra: rótulo, receita, contagem e participação (%). */
export interface BreakdownBarRow {
  /** Chave estável para React. */
  id: string
  /** Rótulo visível (canal, categoria ou região). */
  label: string
  /** Receita do item no período. */
  revenue: number
  /** Participação na receita (0–100) ou null quando indeterminada. */
  sharePct: number | null
  /** Contagem secundária já formatada (ex.: "12 pedidos", "48 un."). */
  countLabel: string
}

interface BreakdownBarListProps {
  /** id único p/ aria-labelledby. */
  id: string
  title: string
  subtitle: string
  /** Linhas JÁ ordenadas desc por receita (o adapter garante isso). */
  rows: BreakdownBarRow[]
}

/** percentual pt-BR com 1 casa (2,3%). */
function fmtPct(n: number): string {
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

/**
 * Seção genérica de quebra em LISTA com barra proporcional à receita — usada por
 * Canais, Categorias e Regiões. A barra é proporcional à MAIOR receita da lista
 * (não à participação), para que a leitura visual funcione mesmo quando o
 * `sharePct` vem null. Quando `sharePct` é null, o % simplesmente não aparece —
 * nunca é inventado. Barras em CSS (sem lib), legível em 390px.
 */
export function BreakdownBarList({ id, title, subtitle, rows }: BreakdownBarListProps) {
  const max = Math.max(...rows.map((r) => r.revenue), 1)

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="rounded-2xl border border-[#38435C] bg-[#0A1E2C] p-5"
    >
      <div className="mb-4">
        <h2 id={`${id}-title`} className="text-sm font-semibold text-[#EBEBEB]">
          {title}
        </h2>
        <p className="mt-0.5 text-xs text-[#87919E]">{subtitle}</p>
      </div>

      <ol className="space-y-3">
        {rows.map((row) => {
          const widthPct = Math.max(4, Math.round((row.revenue / max) * 100))
          return (
            <li key={row.id}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="min-w-0 truncate font-medium text-[#EBEBEB]" title={row.label}>
                  {row.label}
                </span>
                <span className="shrink-0 tabular-nums font-semibold text-[#EBEBEB]">
                  {formatKpiValue(row.revenue, 'currency')}
                </span>
              </div>
              <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-[#38435C]/25">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#95BBE2] to-[#54e0ee]"
                  style={{ width: `${widthPct}%` }}
                  aria-hidden
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-[#647488]">
                <span>{row.countLabel}</span>
                {row.sharePct !== null && (
                  <span className="tabular-nums">{fmtPct(row.sharePct)} da receita</span>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
