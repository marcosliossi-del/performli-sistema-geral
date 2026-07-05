'use client'

import { useState } from 'react'
import { FileText, Loader2, ChevronDown } from 'lucide-react'
import { toast } from '@/lib/toast'

// Valores-base (idênticos ao template). Só mudam em caso específico.
const DEFAULTS = {
  start6: 2500, start3: 3000,
  pro6: 3500, pro3: 4000,
  growth6: 5000, growth3: 5500,
}

type Vals = typeof DEFAULTS

const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR')

/** Economia no contrato = (mensal 3m − mensal 6m) × 6 meses. */
const econ = (v6: number, v3: number) => (v3 - v6) * 6

function validadeMais7(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toLocaleDateString('pt-BR') // dd/mm/aaaa
}

export function PropostaGenerator() {
  const [loja, setLoja] = useState('')
  const [vals, setVals] = useState<Vals>(DEFAULTS)
  const [showVals, setShowVals] = useState(false)
  const [loading, setLoading] = useState(false)

  function setVal(key: keyof Vals, raw: string) {
    const n = Number(raw.replace(/\D/g, ''))
    setVals((v) => ({ ...v, [key]: Number.isFinite(n) ? n : 0 }))
  }

  function buildTokens(): Record<string, string> {
    const promo1 = Math.round(vals.pro6 * 0.8) // 20% off no 1º mês (plano Pro)
    return {
      LOJA: loja.trim(),
      V_START_6M: fmt(vals.start6),
      V_START_3M: fmt(vals.start3),
      V_PRO_6M: fmt(vals.pro6),
      V_PRO_3M: fmt(vals.pro3),
      V_GROWTH_6M: fmt(vals.growth6),
      V_GROWTH_3M: fmt(vals.growth3),
      ECON_START: fmt(econ(vals.start6, vals.start3)),
      ECON_PRO: fmt(econ(vals.pro6, vals.pro3)),
      ECON_GROWTH: fmt(econ(vals.growth6, vals.growth3)),
      PROMO_1M: fmt(promo1),
      PROMO_ECON: fmt(vals.pro6 - promo1),
      VALIDADE: validadeMais7(),
    }
  }

  async function gerar() {
    if (!loja.trim()) {
      toast('Informe o nome da loja do cliente.', 'err')
      return
    }
    setLoading(true)
    // Abre a janela JÁ no clique (gesto do usuário) p/ não ser bloqueada por popup blocker.
    const win = window.open('', '_blank')
    if (!win) {
      setLoading(false)
      toast('Permita pop-ups para gerar a proposta.', 'err')
      return
    }
    win.document.write('<!doctype html><meta charset="utf-8"><title>Gerando proposta…</title><body style="background:#05060D;color:#AAB3C6;font-family:sans-serif;padding:40px">Gerando proposta…</body>')
    try {
      const res = await fetch('/comercial/proposta-template.html', { cache: 'force-cache' })
      if (!res.ok) throw new Error('template')
      let html = await res.text()
      const tokens = buildTokens()
      for (const [k, v] of Object.entries(tokens)) {
        html = html.replaceAll(`{{${k}}}`, v)
      }
      // Sugere o nome do arquivo no "Salvar como PDF".
      const titulo = `Proposta ARKZA — ${loja.trim()}`
      html = html.replace('</head>', `<title>${titulo}</title></head>`)
      win.document.open()
      win.document.write(html)
      win.document.close()
      win.focus()
      // Dá um tempo p/ fontes/efeitos renderizarem e dispara o diálogo de impressão.
      setTimeout(() => { try { win.print() } catch { /* usuário pode imprimir manualmente */ } }, 500)
      toast('Proposta gerada — use "Salvar como PDF" na janela aberta.', 'ok')
    } catch {
      win.close()
      toast('Não foi possível gerar a proposta. Tente novamente.', 'err')
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
          Preencha o nome da loja e baixe a proposta em PDF, idêntica ao modelo da Arkza,
          já personalizada. Os valores seguem o padrão do template — só mude se precisar.
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
          Baixar proposta em PDF
        </button>
        <p className="text-[11px] text-[#576070] mt-2">
          Abre a proposta pronta numa nova aba e o diálogo de impressão — escolha <b>Salvar como PDF</b> (A4).
        </p>
      </div>
    </div>
  )
}
