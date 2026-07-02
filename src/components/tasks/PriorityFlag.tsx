'use client'

import { useState } from 'react'
import { Check, Flag, Loader2 } from 'lucide-react'
import type { TaskPriority } from '@prisma/client'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { PRIORITY_META, PRIORITY_ORDER } from './tokens'
import { Popover } from './Popover'

type BaseProps = {
  priority: TaskPriority | null
  /** Mostra o rótulo ao lado da bandeira (default: true). */
  showLabel?: boolean
  size?: 'sm' | 'md'
  className?: string
}

type StaticProps = BaseProps & { interactive?: false }

type InteractiveProps = BaseProps & {
  interactive: true
  onChange: (next: TaskPriority | null) => Promise<void>
  /** Permite limpar a prioridade (default: true). */
  allowClear?: boolean
  onError?: (message: string) => void
  disabled?: boolean
}

export type PriorityFlagProps = StaticProps | InteractiveProps

function FlagLabel({ priority, showLabel = true, size = 'md' }: BaseProps) {
  const textSize = size === 'sm' ? 'text-[11px]' : 'text-xs'
  if (!priority) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-text-low', textSize)}>
        <Flag size={size === 'sm' ? 12 : 13} aria-hidden />
        {showLabel && <span>Sem prioridade</span>}
      </span>
    )
  }
  const meta = PRIORITY_META[priority]
  return (
    <span className={cn('inline-flex items-center gap-1', meta.textClass, textSize)}>
      <Flag size={size === 'sm' ? 12 : 13} fill="currentColor" aria-hidden />
      {showLabel && <span className="font-medium">{meta.label}</span>}
    </span>
  )
}

export function PriorityFlag(props: PriorityFlagProps) {
  if (!props.interactive) {
    return (
      <span className={props.className}>
        <FlagLabel {...props} />
      </span>
    )
  }
  return <InteractivePriorityFlag {...props} />
}

function InteractivePriorityFlag(props: InteractiveProps) {
  const { onChange, onError, disabled, allowClear = true, className, ...rest } = props
  const [pending, setPending] = useState(false)

  async function select(next: TaskPriority | null, close: () => void) {
    close()
    setPending(true)
    try {
      await onChange(next)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível trocar a prioridade.'
      if (onError) onError(msg)
      else toast(msg, 'err')
    } finally {
      setPending(false)
    }
  }

  return (
    <Popover
      label="Trocar prioridade"
      trigger={({ toggle, triggerId }) => (
        <button
          id={triggerId}
          type="button"
          onClick={toggle}
          disabled={disabled || pending}
          aria-haspopup="menu"
          className={cn('rounded-md px-1 py-0.5 hover:bg-surface-raised disabled:opacity-60', className)}
        >
          {pending ? (
            <span className="inline-flex items-center gap-1 text-xs text-text-mid">
              <Loader2 size={12} className="animate-spin" aria-hidden />
              Salvando…
            </span>
          ) : (
            <FlagLabel {...rest} />
          )}
        </button>
      )}
    >
      {(close) => (
        <ul>
          {PRIORITY_ORDER.map((p) => {
            const meta = PRIORITY_META[p]
            const isCurrent = rest.priority === p
            return (
              <li key={p}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => select(p, close)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-surface-raised"
                >
                  <Flag size={13} fill="currentColor" className={meta.textClass} aria-hidden />
                  <span className={cn('flex-1', meta.textClass)}>{meta.label}</span>
                  {isCurrent && <Check size={13} className="text-info" aria-hidden />}
                </button>
              </li>
            )
          })}
          {allowClear && (
            <li>
              <button
                type="button"
                role="menuitem"
                onClick={() => select(null, close)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-text-low hover:bg-surface-raised"
              >
                <Flag size={13} aria-hidden />
                <span className="flex-1">Sem prioridade</span>
                {rest.priority === null && <Check size={13} className="text-info" aria-hidden />}
              </button>
            </li>
          )}
        </ul>
      )}
    </Popover>
  )
}
