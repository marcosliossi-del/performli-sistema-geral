'use client'

import { useState, useTransition } from 'react'
import { FileText, Copy, Check, Sparkles } from 'lucide-react'
import { saveCheckinAndGenerate, type CheckinInput } from '@/app/actions/weeklyReports'
import { toast } from '@/lib/toast'

type Initial = {
  problema: string
  oQueFoiFeito: string
  resultadoSemana: string
  proximosPassos: string
  pedidosCliente: string
  novosSeguidores: number | null
  atualizadoEm: string | null
}

const QUESTIONS: { key: keyof Omit<CheckinInput, 'novosSeguidores'>; label: string; hint: string }[] = [
  { key: 'problema',        label: '1. Principal problema da semana/mês + hipótese', hint: 'Ex: ROAS caiu de 8 pra 3. Hipótese: criativo saturado, frequência acima de 3.' },
  { key: 'oQueFoiFeito',    label: '2. O que você fez para resolver (com timing)',   hint: 'Ex: terça pausei 3 criativos com CTR baixo; quinta subi 2 novos da pré-venda.' },
  { key: 'resultadoSemana', label: '3. Qual foi o resultado dessas ações',           hint: 'Ex: ROAS subiu de 3 pra 4 a partir de quinta, ainda abaixo da meta de 7.' },
  { key: 'proximosPassos',  label: '4. Plano para o próximo período (vira o plano do relatório)', hint: 'Ex: pedir 3 criativos de menor ticket, subir remarketing de carrinho, testar lookalike.' },
  { key: 'pedidosCliente',  label: '5. O que você precisa do cliente (vira os pedidos)', hint: 'Ex: 3 vídeos UGC da curva A até quinta, decisão sobre o desconto de 10%.' },
]

export function CheckinReportPanel({
  clientId, clientSlug, canEdit, businessType, initial,
}: {
  clientId: string
  clientSlug: string
  canEdit: boolean
  businessType: string
  initial: Initial
}) {
  const [form, setForm] = useState<CheckinInput>({
    problema:        initial.problema,
    oQueFoiFeito:    initial.oQueFoiFeito,
    resultadoSemana: initial.resultadoSemana,
    proximosPassos:  initial.proximosPassos,
    pedidosCliente:  initial.pedidosCliente,
    novosSeguidores: initial.novosSeguidores,
  })
  const [report, setReport] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()
  const [genPeriod, setGenPeriod] = useState<'weekly' | 'monthly' | null>(null)

  const nicho = businessType === 'LOCAL' ? 'Negócio Local' : 'E-commerce'

  function set<K extends keyof CheckinInput>(k: K, v: CheckinInput[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function gerar(period: 'weekly' | 'monthly') {
    setGenPeriod(period)
    startTransition(async () => {
      const r = await saveCheckinAndGenerate(clientId, period, form, clientSlug)
      setGenPeriod(null)
      if (r.error) { toast(r.error, 'err'); return }
      setReport(r.content ?? '')
      toast(`Relatório ${period === 'weekly' ? 'semanal' : 'mensal'} gerado`)
    })
  }

  function copy() {
    if (!report) return
    navigator.clipboard.writeText(report)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const taCls = 'w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-2 text-xs text-[#EBEBEB] placeholder:text-[#576070] focus:outline-none focus:border-[#95BBE2]/50 disabled:opacity-60 resize-y min-h-[52px]'

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-1">
        <FileText size={16} className="text-[#54e0ee]" />
        <h3 className="text-sm font-semibold text-[#EBEBEB]">Check-in &amp; Relatório do cliente</h3>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#54e0ee]/10 text-[#54e0ee] ml-1">{nicho}</span>
        {initial.atualizadoEm && (
          <span className="text-[10px] text-[#576070] ml-auto">Check-in salvo em {new Date(initial.atualizadoEm).toLocaleDateString('pt-BR')}</span>
        )}
      </div>
      <p className="text-[11px] text-[#87919E] mb-4">
        Preencha o contexto da conta e gere o relatório. A IA cruza o seu check-in com os dados do sistema e monta o relatório no formato oficial da Arkza (enviado ao cliente).
      </p>

      <div className="space-y-3">
        {QUESTIONS.map((q) => (
          <div key={q.key}>
            <label className="text-[11px] font-medium text-[#a3b2c2] block mb-1">{q.label}</label>
            <textarea
              value={form[q.key]}
              onChange={(e) => set(q.key, e.target.value)}
              disabled={!canEdit}
              placeholder={q.hint}
              className={taCls}
            />
          </div>
        ))}
        <div className="max-w-[240px]">
          <label className="text-[11px] font-medium text-[#a3b2c2] block mb-1">6. Novos seguidores no período</label>
          <input
            type="number"
            value={form.novosSeguidores ?? ''}
            onChange={(e) => set('novosSeguidores', e.target.value === '' ? null : Number(e.target.value))}
            disabled={!canEdit}
            placeholder="Ex: 286 (pode ser 0 ou negativo)"
            className={taCls + ' min-h-0'}
          />
        </div>
      </div>

      {canEdit && (
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => gerar('weekly')}
            disabled={pending}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#021015] bg-gradient-to-b from-[#54e0ee] to-[#22c2d6] rounded-lg px-3.5 py-2 disabled:opacity-60"
          >
            <Sparkles size={13} /> {pending && genPeriod === 'weekly' ? 'Gerando…' : 'Gerar relatório semanal'}
          </button>
          <button
            onClick={() => gerar('monthly')}
            disabled={pending}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#EBEBEB] border border-[#38435C] rounded-lg px-3.5 py-2 hover:bg-white/[0.04] disabled:opacity-60"
          >
            <Sparkles size={13} /> {pending && genPeriod === 'monthly' ? 'Gerando…' : 'Gerar relatório mensal'}
          </button>
        </div>
      )}

      {report && (
        <div className="mt-4 rounded-lg border border-[#38435C] bg-[#0A1E2C]/60">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#38435C]">
            <span className="text-[11px] text-[#87919E]">Relatório gerado — revise e envie ao cliente</span>
            <button onClick={copy} className="inline-flex items-center gap-1 text-[11px] text-[#54e0ee] hover:underline">
              {copied ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
            </button>
          </div>
          <pre className="whitespace-pre-wrap text-[12.5px] text-[#EBEBEB] leading-relaxed px-3 py-3 font-sans">{report}</pre>
        </div>
      )}
    </div>
  )
}
