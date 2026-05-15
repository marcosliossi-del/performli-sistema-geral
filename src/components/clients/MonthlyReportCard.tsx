'use client'

import { useActionState, useState } from 'react'
import { FileText, Copy, Check, Loader2, RefreshCw, ChevronDown } from 'lucide-react'
import { generateClientMonthlyReport } from '@/app/actions/weeklyReports'

function getPrevMonths(count = 6) {
  const months = []
  const now = new Date()
  for (let i = 1; i <= count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) })
  }
  return months
}

type Props = {
  clientId: string
  clientSlug: string
  existingReport: { content: string; generatedAt: Date | string; monthStart: Date | string } | null
}

export function MonthlyReportCard({ clientId, clientSlug, existingReport }: Props) {
  const months = getPrevMonths()
  const [selected, setSelected] = useState(0) // index in months[]
  const [copied, setCopied] = useState(false)
  const [state, action, pending] = useActionState(generateClientMonthlyReport, {
    content: existingReport?.content,
  })

  const reportContent = state.content ?? existingReport?.content
  const reportDate    = existingReport?.generatedAt
  const reportMonth   = existingReport?.monthStart
    ? new Date(existingReport.monthStart).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : null

  async function handleCopy() {
    if (!reportContent) return
    await navigator.clipboard.writeText(reportContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-[#0A1E2C] border border-[#38435C] rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#38435C]">
        <div className="flex items-center gap-2">
          <FileText size={15} className="text-[#95BBE2]" />
          <div>
            <h3 className="text-sm font-semibold text-[#EBEBEB]">Relatório Mensal</h3>
            {reportDate && reportMonth && (
              <p className="text-[10px] text-[#87919E]">
                {reportMonth} · gerado em {new Date(reportDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {reportContent && (
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#38435C]/50 text-[#87919E] hover:text-[#EBEBEB] text-xs transition-colors border border-[#38435C]"
            >
              {copied ? <Check size={13} className="text-[#22C55E]" /> : <Copy size={13} />}
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          )}
          <form action={action} className="flex items-center gap-2">
            <input type="hidden" name="clientId" value={clientId} />
            <input type="hidden" name="clientSlug" value={clientSlug} />
            <input type="hidden" name="year"  value={months[selected].year} />
            <input type="hidden" name="month" value={months[selected].month} />
            <div className="relative">
              <select
                value={selected}
                onChange={(e) => setSelected(Number(e.target.value))}
                className="h-8 pl-3 pr-7 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-xs text-[#EBEBEB] focus:outline-none appearance-none capitalize"
              >
                {months.map((m, i) => (
                  <option key={i} value={i} className="capitalize">{m.label}</option>
                ))}
              </select>
              <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#87919E] pointer-events-none" />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#95BBE2]/10 text-[#95BBE2] hover:bg-[#95BBE2]/20 text-xs transition-colors border border-[#95BBE2]/20 disabled:opacity-50"
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {reportContent ? 'Regerar' : 'Gerar relatório'}
            </button>
          </form>
        </div>
      </div>

      <div className="px-4 py-3">
        {state.error && <p className="text-sm text-[#EF4444] mb-3">{state.error}</p>}
        {pending && (
          <div className="flex items-center justify-center py-8 gap-2 text-[#87919E]">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Gerando relatório mensal com IA...</span>
          </div>
        )}
        {!pending && reportContent ? (
          <pre className="text-sm text-[#EBEBEB] whitespace-pre-wrap font-sans leading-relaxed">
            {reportContent}
          </pre>
        ) : !pending && !reportContent ? (
          <div className="flex flex-col items-center py-8 text-center">
            <FileText size={28} className="text-[#38435C] mb-2" />
            <p className="text-sm text-[#87919E]">Nenhum relatório mensal gerado ainda.</p>
            <p className="text-xs text-[#87919E] mt-1 max-w-xs">
              Selecione o mês e clique em &quot;Gerar relatório&quot; para criar o fechamento mensal.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
