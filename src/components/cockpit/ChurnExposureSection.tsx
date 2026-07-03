import Link from 'next/link'
import { HelpCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { ChurnExposure } from '@/lib/dal'

const BRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

// Faixas PROVISÓRIAS (score-v2-config): SAUDAVEL<40 · ATENCAO 40-64 · ALTO 65-79 · CRITICO>=80.
const FAIXA_STYLE: Record<string, { label: string; cls: string }> = {
  SAUDAVEL: { label: 'Saudável', cls: 'bg-[#22C55E]/15 text-[#22C55E]' },
  ATENCAO: { label: 'Atenção', cls: 'bg-[#EAB308]/15 text-[#EAB308]' },
  ALTO: { label: 'Alto', cls: 'bg-[#F59E0B]/15 text-[#F59E0B]' },
  CRITICO: { label: 'Crítico', cls: 'bg-[#EF4444]/15 text-[#EF4444]' },
}
const FAIXA_FALLBACK = { label: '—', cls: 'bg-white/5 text-[#87919E]' }

const CURVA_STYLE: Record<string, string> = {
  A: 'bg-[#95BBE2]/15 text-[#95BBE2]',
  B: 'bg-white/5 text-[#EBEBEB]',
  C: 'bg-white/5 text-[#87919E]',
}

/**
 * Seção INFORMATIVA "Exposição a churn (provisório)". O score v2 não dispara
 * nenhuma automação — só ordena/exibe. O "Índice de Exposição" (feeAmount ×
 * score/100) é por cliente e NUNCA somado — não é previsão de receita perdida.
 */
export function ChurnExposureSection({ data }: { data: ChurnExposure }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4 border-b border-white/5 pb-1.5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#EBEBEB]">
          Exposição a churn (provisório)
        </h2>
        <span className="text-[11px] text-[#87919E]">Leitura informativa — não dispara ação</span>
      </div>

      {/* Selo de provisoriedade — obrigatório e explícito. */}
      <div className="flex items-start gap-2 rounded-md border border-[#EAB308]/25 bg-[#EAB308]/[0.06] px-3 py-2">
        <HelpCircle size={14} className="mt-0.5 flex-shrink-0 text-[#EAB308]" />
        <p className="text-[11px] leading-relaxed text-[#C9CDD3]">
          <span className="font-semibold text-[#EAB308]">Provisório — pesos não calibrados.</span>{' '}
          Backtest de 2026-07-03 rodou com coorte insuficiente (poucos churns para validar). Este
          índice <span className="font-semibold">não dispara nenhuma automação</span> (nem alerta,
          nem War Room, nem cobrança). Recalibração prevista para outubro/2026.
        </p>
      </div>

      {data.aguardandoPrimeiroCalculo ? (
        <Card className="flex flex-col items-center py-8 text-center">
          <p className="text-xs text-[#87919E]">Aguardando primeiro cálculo semanal</p>
          <p className="mt-1 text-[11px] text-[#87919E]/70">
            O índice aparece após a próxima rotina automática semanal rodar.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/5 text-[10px] uppercase tracking-wide text-[#87919E]">
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Curva</th>
                  <th className="px-3 py-2 font-medium">Score v2</th>
                  <th className="px-3 py-2 text-right font-medium">Fee mensal</th>
                  <th className="px-3 py-2 text-right font-medium">
                    <span
                      className="inline-flex cursor-help items-center gap-1 border-b border-dotted border-[#576070]"
                      title="Índice de Exposição = fee mensal × score/100. Serve só para priorizar a atenção — NÃO é previsão de receita perdida e não deve ser somado."
                    >
                      Índice de Exposição
                      <HelpCircle size={11} className="text-[#576070]" />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const faixa = FAIXA_STYLE[r.faixa] ?? FAIXA_FALLBACK
                  const curvaCls = r.curva ? CURVA_STYLE[r.curva] ?? CURVA_STYLE.B : CURVA_STYLE.B
                  return (
                    <tr key={r.clientId} className="border-b border-white/[0.03] last:border-0">
                      <td className="px-3 py-2">
                        {r.clientSlug ? (
                          <Link
                            href={`/clients/${r.clientSlug}`}
                            className="font-medium text-[#EBEBEB] hover:text-[#95BBE2] hover:underline"
                          >
                            {r.clientName}
                          </Link>
                        ) : (
                          <span className="font-medium text-[#EBEBEB]">{r.clientName}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${curvaCls}`}
                        >
                          {r.curva ? `Curva ${r.curva}` : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${faixa.cls}`}
                        >
                          {r.scoreV2}
                          <span className="opacity-80">{faixa.label}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-[#C9CDD3]">
                        {r.feeAmount > 0 ? BRL(r.feeAmount) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-[#EBEBEB]">
                        {BRL(r.indiceExposicao)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </section>
  )
}
