'use client'

import { RefreshCw } from 'lucide-react'
import { fmtDateTime } from '@/lib/conversas/format'

/**
 * Indicador de "última atualização" (regra 10 do CLAUDE.md — toda tela com dado
 * crítico mostra data/hora). Os dados atualizam sozinhos a cada 30s (polling).
 */
export function LastUpdated({ at }: { at: Date | string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[#647488]">
      <RefreshCw size={11} className="text-[#647488]" />
      Atualizado {fmtDateTime(at)} • a cada 30s
    </span>
  )
}
