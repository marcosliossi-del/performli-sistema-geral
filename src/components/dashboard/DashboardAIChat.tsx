'use client'

import { useState } from 'react'
import { MessageCircle, X, Send, Loader2 } from 'lucide-react'

interface DashboardContext {
  totalClients: number
  criticalClients: number
  warningClients: number
  healthyClients: number
}

interface Props {
  context: DashboardContext
}

const quickSuggestions = [
  'Visão geral',
  'Maior CPA hoje',
  'Melhor ROAS',
  'Clientes em risco',
]

export function DashboardAIChat({ context }: Props) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(q: string) {
    if (!q.trim() || loading) return
    setLoading(true)
    setAnswer(null)
    setError(null)

    try {
      const res = await fetch('/api/ai/dashboard-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q.trim(), context }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Erro ao processar resposta')
      }

      const data = await res.json()
      setAnswer(data.answer)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    submit(question)
    setQuestion('')
  }

  function handleSuggestion(s: string) {
    setQuestion(s)
    submit(s)
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="w-12 h-12 rounded-full bg-[#95BBE2] hover:bg-[#7AADD8] transition-colors flex items-center justify-center shadow-lg"
          title="Perguntar ao assistente"
        >
          <MessageCircle size={20} className="text-[#05141C]" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="w-[360px] bg-[#0A1E2C] border border-[#38435C] rounded-xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#38435C]">
            <div className="flex items-center gap-2">
              <MessageCircle size={16} className="text-[#95BBE2]" />
              <span className="text-sm font-semibold text-[#EBEBEB]">Assistente</span>
            </div>
            <button
              onClick={() => { setOpen(false); setAnswer(null); setError(null) }}
              className="text-[#87919E] hover:text-[#EBEBEB] transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 space-y-4 flex-1 min-h-[200px]">
            {/* Quick suggestions */}
            {!loading && !answer && !error && (
              <div>
                <p className="text-xs text-[#87919E] mb-2">Sugestões rápidas</p>
                <div className="flex flex-wrap gap-1.5">
                  {quickSuggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSuggestion(s)}
                      className="px-2.5 py-1 rounded-full text-xs border border-[#38435C] text-[#87919E] hover:text-[#EBEBEB] hover:border-[#95BBE2] transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex items-center gap-2 text-[#87919E] text-sm">
                <Loader2 size={14} className="animate-spin" />
                <span>Analisando dados...</span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="text-sm text-[#EF4444] bg-[#EF4444]/10 rounded-lg p-3">
                {error}
              </div>
            )}

            {/* Answer */}
            {answer && (
              <div className="space-y-2">
                <div className="text-sm text-[#EBEBEB] bg-[#38435C]/30 rounded-lg p-3 leading-relaxed whitespace-pre-wrap">
                  {answer}
                </div>
                <button
                  onClick={() => { setAnswer(null); setError(null) }}
                  className="text-xs text-[#87919E] hover:text-[#EBEBEB] transition-colors"
                >
                  Nova pergunta
                </button>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="px-4 pb-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Pergunte sobre os dados de hoje..."
                className="flex-1 bg-[#38435C]/30 border border-[#38435C] rounded-lg px-3 py-2 text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2] transition-colors"
              />
              <button
                type="submit"
                disabled={!question.trim() || loading}
                className="w-9 h-9 rounded-lg bg-[#95BBE2] hover:bg-[#7AADD8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center flex-shrink-0"
              >
                <Send size={14} className="text-[#05141C]" />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
