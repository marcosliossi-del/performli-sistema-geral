'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { useModalA11y } from '@/lib/useModalA11y'

/**
 * Confirmação simples e acessível (useModalA11y: Esc fecha, foco preso,
 * devolve foco ao gatilho). Ação destrutiva em vermelho.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  onConfirm,
  onClose,
  onError,
}: {
  open: boolean
  title: string
  body?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => Promise<void> | void
  onClose: () => void
  onError?: (message: string) => void
}) {
  const [pending, setPending] = useState(false)
  const ref = useModalA11y<HTMLDivElement>(onClose)

  if (!open) return null

  async function confirm() {
    setPending(true)
    try {
      await onConfirm()
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível concluir a ação.'
      if (onError) onError(msg)
      else toast(msg, 'err')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="ak-scrim absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="card ak-glass-strong relative w-full max-w-sm p-5"
      >
        <h2 id="confirm-title" className="text-base font-semibold text-text-hi">
          {title}
        </h2>
        {body && <div className="mt-2 text-[13px] text-text-mid">{body}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-9 rounded-lg border border-[var(--ak-hair)] px-3.5 text-[13px] text-text-hi hover:bg-surface-raised disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-semibold disabled:opacity-60',
              destructive
                ? 'bg-danger text-white hover:brightness-110'
                : 'bg-brand text-[var(--ak-s0)] hover:brightness-105',
            )}
          >
            {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
