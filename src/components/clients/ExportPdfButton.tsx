'use client'

import { Download } from 'lucide-react'

export function ExportPdfButton() {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#38435C]/50 text-[#87919E] hover:text-[#EBEBEB] hover:bg-[#38435C] text-xs font-medium transition-colors border border-[#38435C] print:hidden"
    >
      <Download size={13} />
      Exportar PDF
    </button>
  )
}
