import Link from 'next/link'
import type { AceiteSignal } from '@/lib/dal'
import { Card } from '@/components/ui/card'
import { ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react'

/**
 * RADAR OPERACIONAL — o Aceite Operacional passa a viver DENTRO do Cockpit
 * (decisão Marcos 2026-07-18). Só grupos crítico/atenção viram cards de ação;
 * "Sob controle" vira UMA linha discreta expansível ("✓ N verificações em dia").
 * /aceite continua como drill-down ("ver tudo →"). Reusa getAceiteOperacional —
 * nenhum recálculo aqui.
 */
export function RadarOperacional({
  signals,
  geradoEm,
}: {
  signals: AceiteSignal[]
  geradoEm: Date | string
}) {
  const criticos = signals.filter((s) => s.severity === 'critico')
  const atencao = signals.filter((s) => s.severity === 'atencao')
  const ok = signals.filter((s) => s.severity === 'ok')
  const tudoOk = criticos.length === 0 && atencao.length === 0

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4 border-b border-white/5 pb-1.5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#EBEBEB]">
          Radar operacional
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[#87919E]">O que pode quebrar em silêncio</span>
          <Link href="/aceite" className="text-[11px] text-[#95BBE2] hover:underline">
            ver tudo →
          </Link>
        </div>
      </div>

      {tudoOk ? (
        <Card className="p-5 flex items-center gap-3">
          <ShieldCheck size={22} className="text-[#22C55E] shrink-0" />
          <div>
            <p className="text-[#EBEBEB] font-medium text-sm">Operação saudável</p>
            <p className="text-[#87919E] text-xs mt-0.5">Nenhum processo crítico quebrando agora.</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {criticos.map((s) => <SignalCard key={s.key} s={s} />)}
          {atencao.map((s) => <SignalCard key={s.key} s={s} />)}
        </div>
      )}

      {/* "Sob controle" = uma linha discreta expansível (regra: explicar o que
          está em dia sem poluir o radar de ação). */}
      {ok.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[#87919E] list-none">
            <CheckCircle2 size={12} className="text-[#22C55E]" />
            {ok.length} verificaç{ok.length !== 1 ? 'ões' : 'ão'} em dia
            <span className="text-[#576070] group-open:hidden"> · mostrar</span>
            <span className="text-[#576070] hidden group-open:inline"> · ocultar</span>
          </summary>
          <div className="flex flex-wrap gap-2 mt-2">
            {ok.map((s) => (
              <span
                key={s.key}
                className="inline-flex items-center gap-1.5 text-[11px] text-[#87919E] bg-[#0A1E2C]/40 border border-[#38435C]/50 rounded-full px-2.5 py-1"
              >
                <CheckCircle2 size={12} className="text-[#22C55E]" /> {s.label}
              </span>
            ))}
          </div>
        </details>
      )}

      {/* Regra UX #10 — carimbo de atualização. */}
      <p className="text-[10px] text-[#576070] tabular">
        Atualizado em {new Date(geradoEm).toLocaleString('pt-BR')}
      </p>
    </section>
  )
}

function SignalCard({ s }: { s: AceiteSignal }) {
  const border = s.severity === 'critico' ? 'border-[#EF4444]/30' : 'border-[#EAB308]/30'
  const numColor = s.severity === 'critico' ? 'text-[#EF4444]' : 'text-[#EAB308]'
  return (
    <Link
      href={s.href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-[#0F1623] hover:bg-[#141C2B] transition-colors ${border}`}
    >
      <span className={`text-xl font-bold tabular w-9 text-center shrink-0 ${numColor}`}>{s.count}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[#EBEBEB] text-xs font-medium truncate">{s.label}</p>
        <p className="text-[10px] text-[#87919E] line-clamp-1">{s.problema}</p>
        <p className="text-[10px] text-[#95BBE2] mt-0.5">{s.acao}</p>
      </div>
      <ArrowRight size={14} className="text-[#576070] shrink-0" />
    </Link>
  )
}
