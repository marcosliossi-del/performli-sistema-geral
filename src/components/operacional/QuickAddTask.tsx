'use client'

import { useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Criação rápida no rodapé de um grupo/coluna. Cria SEMPRE em "A fazer"
 * (createOperacionalTask) — decisão documentada no handoff da Fase 4b.
 * Enter cria e mantém o campo aberto (fluxo ClickUp); Esc fecha.
 */
export function QuickAddTask({
  onCreate,
  placeholder = '+ Nova tarefa',
  variant = 'row',
}: {
  onCreate: (title: string) => Promise<void>
  placeholder?: string
  variant?: 'row' | 'card'
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [pending, setPending] = useState(false)

  async function submit() {
    const title = value.trim()
    if (title.length < 3) return
    setPending(true)
    try {
      await onCreate(title)
      setValue('')
    } catch {
      // toast disparado no handler do pai
    } finally {
      setPending(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex w-full items-center gap-1.5 text-left text-[12px] text-[#647488] transition-colors hover:text-[#95BBE2]',
          variant === 'row' ? 'px-2 py-2' : 'rounded-lg border border-dashed border-white/[0.1] px-2.5 py-2',
        )}
      >
        <Plus size={13} aria-hidden /> {placeholder}
      </button>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2',
        variant === 'row' ? 'px-2 py-1.5' : 'rounded-lg border border-[#95BBE2]/30 bg-[#0A1E2C] px-2.5 py-2',
      )}
    >
      <input
        autoFocus
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit() }
          if (e.key === 'Escape') { setOpen(false); setValue('') }
        }}
        onBlur={() => { if (!value.trim()) setOpen(false) }}
        placeholder="Título da tarefa (Enter para criar)"
        className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[#EBEBEB] outline-none placeholder:text-[#647488]"
      />
      {pending && <Loader2 size={13} className="animate-spin text-[#647488]" aria-hidden />}
    </div>
  )
}
