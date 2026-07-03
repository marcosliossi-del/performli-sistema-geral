'use client'

import { useTransition } from 'react'
import { RotateCcw } from 'lucide-react'
import { restoreRecurrenceRule } from '@/app/actions/recurrences'
import { toast } from '@/lib/toast'

export function RestoreRecurrenceButton({
  ruleId,
  templateName,
}: {
  ruleId: string
  templateName: string
}) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const res = await restoreRecurrenceRule(ruleId)
      if ('error' in res) {
        toast(res.error, 'err')
        return
      }
      toast(`Recorrência "${templateName}" restaurada. Volta pausada — reative quando quiser.`, 'ok')
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#38435C] text-xs font-medium text-[#EBEBEB] hover:bg-[#38435C]/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <RotateCcw size={13} />
      {isPending ? 'Restaurando...' : 'Restaurar'}
    </button>
  )
}
