'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { DueDateChip } from '@/components/tasks/DueDateChip'
import { toast } from '@/lib/toast'

/**
 * Vencimento editável inline: mostra o DueDateChip (Fase 3); ao clicar revela um
 * input date nativo. Salva no change → updateTaskFields (via onChange do pai).
 * Estático (só o chip) quando `editable` é falso — respeita RBAC na renderização.
 */
export function DueDateEditor({
  dueDate,
  recurring,
  editable,
  onChange,
  size = 'sm',
}: {
  dueDate: Date | string | null
  recurring?: boolean
  editable: boolean
  onChange: (iso: string | null) => Promise<void>
  size?: 'sm' | 'md'
}) {
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(false)

  if (!editable) {
    return <DueDateChip dueDate={dueDate} recurring={recurring} size={size} />
  }

  const isoValue = dueDate ? new Date(dueDate).toISOString().slice(0, 10) : ''

  async function commit(next: string | null) {
    setPending(true)
    try {
      await onChange(next)
      setEditing(false)
    } catch (e) {
      // handler fez rollback + rethrow; o chip não é um átomo com toast próprio.
      toast(e instanceof Error ? e.message : 'Não foi possível alterar o prazo.', 'err')
    } finally {
      setPending(false)
    }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          type="date"
          autoFocus
          disabled={pending}
          defaultValue={isoValue}
          onChange={(e) => commit(e.target.value || null)}
          onBlur={() => !pending && setEditing(false)}
          className="rounded-md border border-[#38435C] bg-[#0A1E2C] px-1.5 py-0.5 text-[11px] text-[#EBEBEB] outline-none focus:border-[#95BBE2]/50"
        />
        {isoValue && (
          <button
            type="button"
            aria-label="Remover prazo"
            disabled={pending}
            onMouseDown={(e) => { e.preventDefault(); commit(null) }}
            className="text-[#647488] hover:text-[#ff5e6a]"
          >
            <X size={12} aria-hidden />
          </button>
        )}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="rounded-md px-0.5 hover:bg-white/[0.05]"
      title="Alterar prazo"
    >
      <DueDateChip dueDate={dueDate} recurring={recurring} size={size} />
    </button>
  )
}
