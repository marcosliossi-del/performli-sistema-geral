import { Sparkles } from 'lucide-react'

/**
 * Nota honesta sobre análises que AINDA não têm dado no schema (quebras por
 * idade, canal, categoria, região, top produtos — pendências registradas em
 * kpi-registry.ts). NÃO renderiza gráfico falso nem número inventado: apenas
 * comunica que virão em breve.
 */
const BREAKDOWNS = ['Faixa etária', 'Canais', 'Categorias', 'Região', 'Produtos mais vendidos']

export function ComingSoonNote() {
  return (
    <section
      aria-labelledby="soon-title"
      className="rounded-2xl border border-dashed border-[#38435C] bg-[#0A1E2C]/50 p-5"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#95BBE2]/25 bg-[#95BBE2]/10 text-[#95BBE2]">
          <Sparkles size={16} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="soon-title" className="text-sm font-semibold text-[#EBEBEB]">
            Novas análises a caminho
          </h2>
          <p className="mt-1 text-xs text-[#87919E]">
            Em breve você verá suas vendas detalhadas por:
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {BREAKDOWNS.map((label) => (
              <li
                key={label}
                className="rounded-full border border-[#38435C] px-2.5 py-1 text-[11px] text-[#647488]"
              >
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
