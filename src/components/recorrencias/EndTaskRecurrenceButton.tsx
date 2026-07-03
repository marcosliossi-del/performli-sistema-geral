'use client'

import { useState, useTransition } from 'react'
import { XCircle } from 'lucide-react'
import { removeTaskRecurrence } from '@/app/actions/task-recurrence'
import { toast } from '@/lib/toast'

/**
 * Encerra a série de recorrência por task (Motor B). Confirmação inline em dois
 * passos — encerrar é irreversível nesta fatia (sem re-edição da regra Json).
 * A task-fonte NÃO é apagada, só para de gerar novas ocorrências.
 */
export function EndTaskRecurrenceButton({
  taskId,
  title,
}: {
  taskId: string
  title: string
}) {
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function handleEnd() {
    startTransition(async () => {
      const res = await removeTaskRecurrence(taskId)
      if ('error' in res) {
        toast(res.error, 'err')
        return
      }
      toast(
        `Recorrência da tarefa "${title}" encerrada. A tarefa continua no sistema, mas não gera novas ocorrências.`,
        'ok',
      )
      setConfirming(false)
    })
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={isPending}
        className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#38435C] text-xs font-medium text-[#EBEBEB] hover:bg-[#38435C]/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <XCircle size={13} />
        Encerrar série
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleEnd}
        disabled={isPending}
        className="h-8 px-3 rounded-lg bg-[#EF4444]/15 text-xs font-medium text-[#EF4444] hover:bg-[#EF4444]/25 transition-colors disabled:opacity-50"
      >
        {isPending ? 'Encerrando...' : 'Confirmar'}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={isPending}
        className="h-8 px-3 rounded-lg border border-[#38435C] text-xs font-medium text-[#87919E] hover:bg-[#38435C]/40 transition-colors disabled:opacity-50"
      >
        Cancelar
      </button>
    </div>
  )
}
