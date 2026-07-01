'use client'

import { useState, useTransition } from 'react'
import { Sparkles, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react'
import { generatePlanoAcao, type PlanoAcaoResult } from '@/app/actions/planoAcao'

const RISCO = {
  alto: { label: 'Risco alto', cls: 'text-[#EF4444] bg-[#EF4444]/10' },
  medio: { label: 'Risco médio', cls: 'text-[#EAB308] bg-[#EAB308]/10' },
  baixo: { label: 'Risco baixo', cls: 'text-[#22C55E] bg-[#22C55E]/10' },
} as const

export function PlanoAcaoPanel({ clientId, destaque }: { clientId: string; destaque?: boolean }) {
  const [plano, setPlano] = useState<PlanoAcaoResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function gerar() {
    setError(null)
    startTransition(async () => {
      const r = await generatePlanoAcao(clientId)
      if ('error' in r) { setError(r.error); return }
      setPlano(r)
    })
  }

  return (
    <div className={`card p-5 ${destaque ? 'border-[#95BBE2]/30' : ''}`}>
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[#95BBE2]" />
          <h3 className="text-sm font-semibold text-[#EBEBEB]">Plano de ação (IA)</h3>
        </div>
        <button
          onClick={gerar}
          disabled={isPending}
          className="text-xs font-semibold text-[#021015] bg-gradient-to-b from-[#54e0ee] to-[#22c2d6] rounded-lg px-3 py-1.5 disabled:opacity-60 flex items-center gap-1.5"
        >
          {isPending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {plano ? 'Gerar de novo' : 'Sugerir plano de ação'}
        </button>
      </div>
      <p className="text-[11px] text-[#87919E]">
        Diagnóstico e próximos passos com base nos dados reais do cliente (GA4, Meta, saúde, alertas).
      </p>

      {error && (
        <div className="mt-3 flex items-center gap-2 text-[12px] text-[#EF4444]">
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      {plano && (
        <div className="mt-4 space-y-3">
          <div className="flex items-start gap-2">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${RISCO[plano.risco]?.cls ?? RISCO.medio.cls}`}>
              {RISCO[plano.risco]?.label ?? 'Risco médio'}
            </span>
            <div>
              <p className="text-[13px] text-[#EBEBEB]">{plano.diagnostico}</p>
              <p className="text-[11px] text-[#87919E] mt-1"><span className="text-[#576070]">Causa provável:</span> {plano.causaProvavel}</p>
            </div>
          </div>
          <div className="space-y-2">
            {plano.acoes.map((a, i) => (
              <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-[#0F1623] border border-[#38435C]/50">
                <ArrowRight size={14} className="text-[#95BBE2] mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[12.5px] font-medium text-[#EBEBEB]">{a.titulo}</p>
                    <span className="text-[10px] text-[#95BBE2] bg-[#95BBE2]/10 px-1.5 py-0.5 rounded shrink-0">{a.prazo}</span>
                  </div>
                  <p className="text-[11.5px] text-[#87919E] mt-0.5">{a.detalhe}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[#576070]">Sugestão gerada por IA — valide antes de executar.</p>
        </div>
      )}
    </div>
  )
}
