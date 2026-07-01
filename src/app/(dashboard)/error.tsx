'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

/**
 * Error boundary do grupo (dashboard). Em vez de derrubar a tela com um erro
 * cru, mostra uma mensagem operacional e um botão para tentar de novo. A
 * sidebar/topbar permanecem (o boundary cobre só a área de conteúdo).
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[dashboard error boundary]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[#ff5e6a]/12 flex items-center justify-center mb-4">
        <AlertTriangle size={22} className="text-[#ff5e6a]" />
      </div>
      <h1 className="text-lg font-semibold text-[#EBEBEB]">Esta tela não carregou</h1>
      <p className="text-sm text-[#87919E] mt-1 max-w-md">
        Algo falhou ao montar esta página. O resto do sistema continua funcionando.
        Tente de novo; se persistir, avise o time técnico.
      </p>
      {error.digest && (
        <p className="text-[10px] text-[#576070] mt-2 font-mono">ref: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#021015] bg-gradient-to-b from-[#54e0ee] to-[#22c2d6] rounded-lg px-4 py-2"
      >
        <RotateCcw size={13} /> Tentar de novo
      </button>
    </div>
  )
}
