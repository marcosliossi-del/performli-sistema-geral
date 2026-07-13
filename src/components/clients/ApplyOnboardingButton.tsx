'use client'

import { useState, useTransition } from 'react'
import { Rocket, Check, Loader2 } from 'lucide-react'
import { applyOnboardingTemplates } from '@/app/actions/onboarding'

/**
 * CTA client-side para aplicar o onboarding do cliente em 1 clique (FATIA 4).
 * Dois tamanhos: `primary` (estado vazio das tarefas) e `ghost` (header discreto
 * quando o cliente já tem tarefas). Feedback operacional em pt-BR.
 */
export function ApplyOnboardingButton({
  clientId,
  variant = 'primary',
}: {
  clientId: string
  variant?: 'primary' | 'ghost'
}) {
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  function run() {
    setFeedback(null)
    startTransition(async () => {
      const res = await applyOnboardingTemplates(clientId)
      if ('error' in res) {
        setFeedback({ kind: 'error', text: res.error })
      } else {
        setFeedback({ kind: 'ok', text: res.message })
      }
    })
  }

  const base =
    variant === 'primary'
      ? 'inline-flex items-center gap-2 text-xs font-semibold text-[#021015] bg-gradient-to-b from-[#54e0ee] to-[#22c2d6] rounded-lg px-3.5 py-2 disabled:opacity-60'
      : 'inline-flex items-center gap-1.5 text-[11px] font-medium text-[#95BBE2] hover:text-[#54e0ee] disabled:opacity-60'

  return (
    <div className={variant === 'primary' ? 'flex flex-col items-center gap-2' : 'flex items-center gap-2'}>
      <button type="button" onClick={run} disabled={isPending} className={base}>
        {isPending ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
        {isPending ? 'Aplicando onboarding…' : 'Aplicar onboarding'}
      </button>
      {feedback && (
        <span
          className={`inline-flex items-center gap-1 text-[11px] ${
            feedback.kind === 'ok' ? 'text-[#22C55E]' : 'text-[#EF4444]'
          }`}
        >
          {feedback.kind === 'ok' && <Check size={12} />}
          {feedback.text}
        </span>
      )}
    </div>
  )
}
