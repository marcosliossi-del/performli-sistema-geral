'use client'

import { useState } from 'react'
import { FileText, Loader2, ChevronDown } from 'lucide-react'
import { toast } from '@/lib/toast'
import { DEFAULTS, fmt, type Vals } from '@/lib/comercial/proposta'

export function PropostaGenerator() {
  const [loja, setLoja] = useState('')
  const [vals, setVals] = useState<Vals>(DEFAULTS)
  const [showVals, setShowVals] = useState(false)
  const [loading, setLoading] = useState(false)

  function setVal(key: keyof Vals, raw: string) {
    const n = Number(raw.replace(/\D/g, ''))
    setVals((v) => ({ ...v, [key]: Number.isFinite(n) ? n : 0 }))
  }

  async function gerar() {
    const nome = loja.trim()
    if (!nome) {
      toast('Informe o nome da loja do cliente.', 'err')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/comercial/proposta/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loja: nome, vals }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Falha ao gerar o PDF.')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Proposta ARKZA - ${nome}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast('Proposta gerada e baixada em PDF.', 'ok')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível gerar a proposta.', 'err')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="rounded-2xl border border-[#38435C] bg-[#0F1420]/60 p-6">
        <div className="flex items-center gap-2 mb-1">
          <FileText size={18} className="text-[#95BBE2]" />
          <h1 className="text-[17px] font-bold text-[#EBEBEB]">Gerador de Proposta</h1>
        </div>
        <p className="text-xs text-[#87919E] mb-5">
          Preencha o nome da loja e baixe a proposta em PDF, idêntica ao modelo da Arkza
          (com cores e design originais), já personalizada. Os valores seguem o padrão do
          template — só mude se precisar.
        </p>

        <label className="block text-xs font-semibold text-[#EBEBEB] mb-1.5">
          Nome da loja do cliente <span className="text-[#EF4444]">*</span>
        </label>
        <input
          type="text"
          value={loja}
          onChange={(e) => setLoja(e.target.value)}
          placeholder="Ex.: Lamô Oficial"
          className="w-full text-sm text-[#EBEBEB] bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-2.5 outline-none focus:border-[#95BBE2] mb-4"
        />

        <button
          type="button"
          onClick={() => setShowVals((s) => !s)}
          className="flex items-center gap-1.5 text-xs text-[#95BBE2] mb-3"
        >
          <ChevronDown size={14} className={`transition-transform ${showVals ? '' : '-rotate-90'}`} />
          Valores dos planos (opcional)
        </button>

        {showVals && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-5 border-t border-[#38435C]/60 pt-4">
            {([
              ['Start · 6 meses', 'start6'], ['Start · 3 meses', 'start3'],
              ['Pro · 6 meses', 'pro6'], ['Pro · 3 meses', 'pro3'],
              ['Growth · 6 meses', 'growth6'], ['Growth · 3 meses', 'growth3'],
            ] as [string, keyof Vals][]).map(([label, key]) => (
              <div key={key}>
                <label className="block text-[11px] text-[#87919E] mb-1">{label}</label>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[#87919E]">R$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={fmt(vals[key])}
                    onChange={(e) => setVal(key, e.target.value)}
                    className="w-full text-sm text-[#EBEBEB] bg-[#0A1E2C] border border-[#38435C] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#95BBE2]"
                  />
                </div>
              </div>
            ))}
            <p className="col-span-2 text-[11px] text-[#576070]">
              Economia no contrato, promo de 24h e validade (hoje + 7 dias) são calculadas automaticamente.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={gerar}
          disabled={loading || !loja.trim()}
          className="flex items-center gap-2 text-sm font-semibold text-[#0A1E2C] bg-[#95BBE2] rounded-lg px-4 py-2.5 transition-colors hover:bg-[#95BBE2]/90 disabled:opacity-40"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
          {loading ? 'Gerando PDF…' : 'Baixar proposta em PDF'}
        </button>
        <p className="text-[11px] text-[#576070] mt-2">
          O PDF é gerado no servidor (colorido, A4, fiel ao template) e baixado direto no seu computador.
        </p>
      </div>
    </div>
  )
}
