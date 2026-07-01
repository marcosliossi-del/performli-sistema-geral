'use client'

import { useState, useTransition } from 'react'
import { Pause, Play } from 'lucide-react'
import { toggleRecurrenceRule } from '@/app/actions/recurrences'
import { toast } from '@/lib/toast'

export function ToggleRecurrenceButton({
  ruleId,
  active,
  templateName,
}: {
  ruleId: string
  active: boolean
  templateName: string
}) {
  const [isPending, startTransition] = useTransition()
  const [optimisticActive, setOptimisticActive] = useState(active)

  function handleClick() {
    const next = !optimisticActive
    startTransition(async () => {
      const res = await toggleRecurrenceRule(ruleId, next)
      if ('error' in res) {
        toast(res.error, 'err')
        return
      }
      setOptimisticActive(next)
      toast(
        next
          ? `Recorrência "${templateName}" reativada.`
          : `Recorrência "${templateName}" pausada. Novas tarefas não serão geradas até religar.`,
        next ? 'ok' : 'info',
      )
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#38435C] text-xs font-medium text-[#EBEBEB] hover:bg-[#38435C]/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {optimisticActive ? (
        <>
          <Pause size={13} />
          Pausar
        </>
      ) : (
        <>
          <Play size={13} />
          Reativar
        </>
      )}
    </button>
  )
}
