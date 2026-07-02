'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'

/**
 * Texto que vira input no clique.
 * Enter salva · Esc cancela · blur salva se mudou. onSave assíncrono com
 * pending/erro; em erro reverte para o valor original e reporta a mensagem.
 */
export function InlineEdit({
  value,
  onSave,
  placeholder = 'Sem título',
  as = 'text',
  inputClassName,
  displayClassName,
  onError,
  ariaLabel,
}: {
  value: string
  onSave: (next: string) => Promise<void>
  placeholder?: string
  as?: 'text' | 'heading'
  inputClassName?: string
  displayClassName?: string
  onError?: (message: string) => void
  ariaLabel?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  async function save() {
    const next = draft.trim()
    setEditing(false)
    if (next === value.trim() || next === '') {
      setDraft(value)
      return
    }
    setPending(true)
    try {
      await onSave(next)
    } catch (e) {
      setDraft(value)
      const msg = e instanceof Error ? e.message : 'Não foi possível salvar.'
      if (onError) onError(msg)
      else toast(msg, 'err')
    } finally {
      setPending(false)
    }
  }

  const base = as === 'heading' ? 'text-lg font-semibold' : 'text-[13px]'

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            save()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setDraft(value)
            setEditing(false)
          }
        }}
        aria-label={ariaLabel ?? 'Editar texto'}
        className={cn(
          base,
          'w-full rounded-md border border-[var(--ak-brand)] bg-surface px-1.5 py-0.5 text-text-hi outline-none',
          inputClassName,
        )}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={pending}
      aria-label={ariaLabel ?? 'Editar texto'}
      className={cn(
        base,
        'inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left hover:bg-surface-raised',
        value ? 'text-text-hi' : 'text-text-low',
        displayClassName,
      )}
    >
      <span className="truncate">{value || placeholder}</span>
      {pending && <Loader2 size={12} className="animate-spin text-text-low" aria-hidden />}
    </button>
  )
}
