'use client'

import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'

export type ChecklistItemVM = { id: string; name: string; done: boolean }

/**
 * Bloco de checklist com toggle otimista (local), barra de progresso e
 * adição inline. Callbacks assíncronos reconciliam com o servidor; em erro
 * revertem o estado local e reportam a mensagem.
 */
export function ChecklistBlock({
  items,
  onToggle,
  onAdd,
  title = 'Checklist',
  onError,
  className,
}: {
  items: ChecklistItemVM[]
  onToggle: (itemId: string, done: boolean) => Promise<void>
  onAdd?: (name: string) => Promise<void>
  title?: string
  onError?: (message: string) => void
  className?: string
}) {
  const [local, setLocal] = useState(items)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const total = local.length
  const done = local.filter((i) => i.done).length
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)

  function report(e: unknown, fallback: string) {
    const msg = e instanceof Error ? e.message : fallback
    if (onError) onError(msg)
    else toast(msg, 'err')
  }

  async function toggle(item: ChecklistItemVM) {
    const next = !item.done
    setLocal((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: next } : i)))
    setPendingIds((prev) => new Set(prev).add(item.id))
    try {
      await onToggle(item.id, next)
    } catch (e) {
      // rollback
      setLocal((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: item.done } : i)))
      report(e, 'Não foi possível atualizar o item.')
    } finally {
      setPendingIds((prev) => {
        const s = new Set(prev)
        s.delete(item.id)
        return s
      })
    }
  }

  async function add() {
    const name = draft.trim()
    if (!name || !onAdd) return
    setAdding(true)
    try {
      await onAdd(name)
      setDraft('')
    } catch (e) {
      report(e, 'Não foi possível adicionar o item.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-mid">{title}</span>
        <span className="text-[11px] tabular text-text-low">
          {done}/{total}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full bg-success transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="space-y-0.5">
        {local.map((item) => {
          const isPending = pendingIds.has(item.id)
          return (
            <li key={item.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-raised">
                <input
                  type="checkbox"
                  checked={item.done}
                  disabled={isPending}
                  onChange={() => toggle(item)}
                  className="h-3.5 w-3.5 accent-[var(--ak-green)]"
                />
                <span
                  className={cn(
                    'flex-1 text-[13px]',
                    item.done ? 'text-text-low line-through' : 'text-text-hi',
                  )}
                >
                  {item.name}
                </span>
                {isPending && <Loader2 size={12} className="animate-spin text-text-low" aria-hidden />}
              </label>
            </li>
          )
        })}
        {local.length === 0 && (
          <li className="px-1.5 py-1 text-[12px] text-text-low">Nenhum item ainda.</li>
        )}
      </ul>

      {onAdd && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
          className="flex items-center gap-1.5 pl-1.5"
        >
          <Plus size={13} className="text-text-low" aria-hidden />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Adicionar item…"
            disabled={adding}
            className="h-7 flex-1 bg-transparent text-[13px] text-text-hi outline-none placeholder:text-text-low"
          />
          {adding && <Loader2 size={13} className="animate-spin text-text-low" aria-hidden />}
        </form>
      )}
    </div>
  )
}
