'use client'

import { useState } from 'react'
import { Check, ChevronDown, Loader2 } from 'lucide-react'
import type { StatusGroup, TaskStatus } from '@prisma/client'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { CLOSED_GROUPS, LEGACY_STATUS } from './tokens'
import { Popover } from './Popover'

/** Shape do model Status (subset visual). */
export type StatusShape = { id?: string; name: string; color: string; group: StatusGroup }

/** União discriminada: status custom (model Status) OU enum TaskStatus legado. */
export type StatusValue =
  | { kind: 'custom'; status: StatusShape }
  | { kind: 'legacy'; status: TaskStatus }

/** Normaliza qualquer variante para { name, color, group } visual. */
export function resolveStatus(value: StatusValue): StatusShape {
  if (value.kind === 'custom') return value.status
  const meta = LEGACY_STATUS[value.status]
  return { name: meta.label, color: meta.color, group: meta.group }
}

type BaseProps = {
  value: StatusValue
  size?: 'sm' | 'md'
  className?: string
}

/** Variante estática (não interativa). */
type StaticProps = BaseProps & { interactive?: false }

/** Variante interativa: dropdown de troca. */
type InteractiveProps = BaseProps & {
  interactive: true
  /** Lista de status disponíveis para troca (mesma discriminação). */
  options: StatusValue[]
  /** Troca assíncrona. Deve lançar/rejeitar em caso de erro. */
  onChange: (next: StatusValue) => Promise<void>
  onError?: (message: string) => void
  disabled?: boolean
}

export type StatusBadgeProps = StaticProps | InteractiveProps

function Pill({
  shape,
  size = 'md',
  withCaret,
  className,
}: {
  shape: StatusShape
  size?: 'sm' | 'md'
  withCaret?: boolean
  className?: string
}) {
  const done = CLOSED_GROUPS.includes(shape.group)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        className,
      )}
      style={{
        color: shape.color,
        borderColor: `color-mix(in srgb, ${shape.color} 35%, transparent)`,
        background: `color-mix(in srgb, ${shape.color} 14%, transparent)`,
      }}
    >
      {done ? (
        <Check size={12} strokeWidth={3} aria-hidden />
      ) : (
        <span
          className="ak-dot inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: shape.color }}
          aria-hidden
        />
      )}
      <span className="truncate">{shape.name}</span>
      {withCaret && <ChevronDown size={12} className="opacity-70" aria-hidden />}
    </span>
  )
}

export function StatusBadge(props: StatusBadgeProps) {
  const shape = resolveStatus(props.value)

  if (!props.interactive) {
    return <Pill shape={shape} size={props.size} className={props.className} />
  }

  return <InteractiveStatusBadge {...props} current={shape} />
}

function InteractiveStatusBadge(props: InteractiveProps & { current: StatusShape }) {
  const { options, onChange, onError, disabled, size, className, current } = props
  const [pending, setPending] = useState(false)

  async function select(next: StatusValue, close: () => void) {
    close()
    setPending(true)
    try {
      await onChange(next)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível trocar o status.'
      if (onError) onError(msg)
      else toast(msg, 'err')
    } finally {
      setPending(false)
    }
  }

  return (
    <Popover
      label="Trocar status"
      trigger={({ toggle, triggerId }) => (
        <button
          id={triggerId}
          type="button"
          onClick={toggle}
          disabled={disabled || pending}
          aria-haspopup="menu"
          className={cn(
            'rounded-full transition-opacity hover:opacity-80 disabled:opacity-60',
            className,
          )}
        >
          {pending ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ak-hair)] bg-surface px-2.5 py-1 text-xs text-text-mid">
              <Loader2 size={12} className="animate-spin" aria-hidden />
              Salvando…
            </span>
          ) : (
            <Pill shape={current} size={size} withCaret />
          )}
        </button>
      )}
    >
      {(close) => (
        <ul className="max-h-64 overflow-auto">
          {options.map((opt, i) => {
            const s = resolveStatus(opt)
            const isCurrent = s.name === current.name
            return (
              <li key={s.id ?? `${s.name}-${i}`}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => select(opt, close)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-text-hi hover:bg-surface-raised"
                >
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{s.name}</span>
                  {isCurrent && <Check size={13} className="text-info" aria-hidden />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Popover>
  )
}
