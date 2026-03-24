'use client'

import { useActionState } from 'react'
import { generateCampaignInsight, type CampaignInsightState } from '@/app/actions/campaignInsights'
import { Sparkles, RefreshCw, Copy, CheckCheck, AlertCircle } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { timeAgo } from '@/lib/utils'

type Props = {
  clientId: string
  clientSlug: string
  existingInsight: { content: string; createdAt: Date } | null
}

const initial: CampaignInsightState = {}

// Renders plain text with emoji-led sections highlighted
function InsightText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        const isSectionHeader =
          line.startsWith('🎯') ||
          line.startsWith('🚀') ||
          line.startsWith('⚠️') ||
          line.startsWith('🔧') ||
          line.startsWith('💡')
        if (isSectionHeader) {
          return (
            <p key={i} className="text-sm font-semibold text-[#EBEBEB] mt-4 first:mt-0">
              {line}
            </p>
          )
        }
        if (line.trim() === '') return <div key={i} className="h-1" />
        return (
          <p key={i} className="text-sm text-[#87919E] leading-relaxed pl-1">
            {line}
          </p>
        )
      })}
    </div>
  )
}

export function CampaignInsightCard({ clientId, clientSlug, existingInsight }: Props) {
  const [state, action, pending] = useActionState(generateCampaignInsight, initial)
  const [copied, setCopied] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const displayContent = state.success && state.content
    ? state.content
    : existingInsight?.content ?? null

  const displayDate = state.success
    ? new Date()
    : existingInsight?.createdAt ?? null

  useEffect(() => {
    if (state.success) formRef.current?.reset()
  }, [state.success])

  async function handleCopy() {
    if (!displayContent) return
    await navigator.clipboard.writeText(displayContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-[#0A1E2C] border border-[#38435C] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#38435C]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#95BBE2]/10 flex items-center justify-center">
            <Sparkles size={16} className="text-[#95BBE2]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#EBEBEB]">Análise IA de Campanhas</p>
            {displayDate && (
              <p className="text-[10px] text-[#87919E]">
                Gerada {timeAgo(new Date(displayDate))}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {displayContent && (
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#38435C] text-[#87919E] hover:text-[#EBEBEB] hover:border-[#95BBE2] transition-colors text-xs"
            >
              {copied ? <CheckCheck size={12} className="text-[#22C55E]" /> : <Copy size={12} />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          )}

          <form ref={formRef} action={action}>
            <input type="hidden" name="clientId" value={clientId} />
            <input type="hidden" name="clientSlug" value={clientSlug} />
            <button
              type="submit"
              disabled={pending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#95BBE2]/10 hover:bg-[#95BBE2]/20 text-[#95BBE2] border border-[#95BBE2]/30 hover:border-[#95BBE2]/60 transition-colors text-xs font-medium disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <RefreshCw size={12} className={pending ? 'animate-spin' : ''} />
              {pending ? 'Analisando...' : displayContent ? 'Reanalisar' : 'Analisar campanhas'}
            </button>
          </form>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {/* Error */}
        {state.error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/20 mb-4">
            <AlertCircle size={14} className="text-[#EF4444] mt-0.5 flex-shrink-0" />
            <p className="text-xs text-[#EF4444]">{state.error}</p>
          </div>
        )}

        {/* Loading skeleton */}
        {pending && (
          <div className="space-y-2 animate-pulse">
            {[80, 60, 90, 50, 70].map((w, i) => (
              <div key={i} className="h-3 bg-[#38435C]/60 rounded" style={{ width: `${w}%` }} />
            ))}
            <div className="h-1" />
            {[65, 80, 55].map((w, i) => (
              <div key={i} className="h-3 bg-[#38435C]/60 rounded" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}

        {/* Content */}
        {!pending && displayContent && <InsightText text={displayContent} />}

        {/* Empty state */}
        {!pending && !displayContent && !state.error && (
          <div className="flex flex-col items-center py-8 text-center">
            <Sparkles size={28} className="text-[#38435C] mb-3" />
            <p className="text-[#EBEBEB] text-sm font-medium">Análise IA não gerada ainda</p>
            <p className="text-[#87919E] text-xs mt-1 max-w-sm">
              Clique em &ldquo;Analisar campanhas&rdquo; para que a IA identifique oportunidades de
              escala, campanhas puxando o ROAS pra baixo e ações prioritárias.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
