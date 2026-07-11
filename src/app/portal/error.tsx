'use client'

import { AlertTriangle } from 'lucide-react'

/**
 * Erro genérico do portal. Linguagem para o lojista, SEM stack trace nem termo
 * técnico — apenas o que aconteceu e como seguir.
 */
export default function PortalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#38435C] bg-[#0A1E2C] p-6 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#EF4444]/10">
          <AlertTriangle size={20} className="text-[#EF4444]" />
        </div>
        <h2 className="text-base font-semibold text-[#EBEBEB]">
          Não conseguimos carregar seus resultados agora
        </h2>
        <p className="mt-2 text-sm text-[#87919E]">
          Foi só um instante. Tente novamente — se continuar, avise seu gestor na Arkza.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 h-10 w-full rounded-xl bg-gradient-to-b from-[#54e0ee] to-[#22c2d6] text-sm font-semibold text-[#021015] shadow-[0_6px_18px_-6px_rgba(34,194,214,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] transition-all hover:brightness-[1.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#95BBE2]/50 active:scale-[0.98]"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  )
}
