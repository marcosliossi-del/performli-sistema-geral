'use client'

import { useMemo, useState } from 'react'
import { Check, Loader2, Search, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { avatarColor, initials } from './tokens'
import { Popover } from './Popover'

export type AssigneeUser = { id: string; name: string; avatarUrl?: string | null }

function Avatar({
  user,
  size = 24,
  ring = true,
}: {
  user: AssigneeUser
  size?: number
  ring?: boolean
}) {
  const color = avatarColor(user.id)
  return (
    <span
      title={user.name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-[var(--ak-s0)]',
        ring && 'ring-2 ring-[var(--ak-s2)]',
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        backgroundColor: color,
      }}
      aria-hidden
    >
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        initials(user.name)
      )}
    </span>
  )
}

type BaseProps = {
  assignees: AssigneeUser[]
  max?: number
  size?: number
  className?: string
}

type StaticProps = BaseProps & { interactive?: false }

type InteractiveProps = BaseProps & {
  interactive: true
  /** Universo de usuários selecionáveis. */
  options: AssigneeUser[]
  /** Alterna um usuário (add/remove). Deve rejeitar em erro. */
  onToggle: (userId: string, willBeAssigned: boolean) => Promise<void>
  onError?: (message: string) => void
  disabled?: boolean
}

export type AssigneeAvatarsProps = StaticProps | InteractiveProps

function Stack({ assignees, max = 3, size = 24, empty }: BaseProps & { empty?: React.ReactNode }) {
  if (assignees.length === 0) {
    return <>{empty ?? <span className="text-xs text-text-low">Sem responsável</span>}</>
  }
  const shown = assignees.slice(0, max)
  const rest = assignees.length - shown.length
  return (
    <span className="inline-flex items-center">
      <span className="flex -space-x-2">
        {shown.map((u) => (
          <Avatar key={u.id} user={u} size={size} />
        ))}
      </span>
      {rest > 0 && (
        <span
          className="ml-1 inline-flex items-center justify-center rounded-full bg-surface-raised font-semibold text-text-mid ring-2 ring-[var(--ak-s2)]"
          style={{ width: size, height: size, fontSize: size * 0.38 }}
        >
          +{rest}
        </span>
      )}
    </span>
  )
}

export function AssigneeAvatars(props: AssigneeAvatarsProps) {
  if (!props.interactive) {
    return (
      <span className={props.className}>
        <Stack {...props} />
      </span>
    )
  }
  return <InteractiveAssigneeAvatars {...props} />
}

function InteractiveAssigneeAvatars(props: InteractiveProps) {
  const { options, onToggle, onError, disabled, assignees, max, size, className } = props
  const [query, setQuery] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)

  const assignedIds = useMemo(() => new Set(assignees.map((a) => a.id)), [assignees])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((u) => u.name.toLowerCase().includes(q)) : options
  }, [options, query])

  async function toggle(userId: string) {
    const willBeAssigned = !assignedIds.has(userId)
    setPendingId(userId)
    try {
      await onToggle(userId, willBeAssigned)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível atualizar os responsáveis.'
      if (onError) onError(msg)
      else toast(msg, 'err')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <Popover
      label="Selecionar responsáveis"
      panelClassName="w-64"
      trigger={({ toggle: t, triggerId }) => (
        <button
          id={triggerId}
          type="button"
          onClick={t}
          disabled={disabled}
          aria-haspopup="menu"
          className={cn('inline-flex items-center gap-1 rounded-full hover:opacity-85 disabled:opacity-60', className)}
        >
          <Stack
            assignees={assignees}
            max={max}
            size={size}
            empty={
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-[var(--ak-hair)] text-text-low">
                <UserPlus size={13} aria-hidden />
              </span>
            }
          />
        </button>
      )}
    >
      {() => (
        <div>
          <div className="flex items-center gap-2 rounded-lg bg-surface px-2 py-1.5">
            <Search size={13} className="text-text-low" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar pessoa…"
              className="w-full bg-transparent text-xs text-text-hi outline-none placeholder:text-text-low"
            />
          </div>
          <ul className="mt-1 max-h-56 overflow-auto">
            {filtered.length === 0 && (
              <li className="px-2.5 py-2 text-xs text-text-low">Ninguém encontrado.</li>
            )}
            {filtered.map((u) => {
              const selected = assignedIds.has(u.id)
              const isPending = pendingId === u.id
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={selected}
                    onClick={() => toggle(u.id)}
                    disabled={isPending}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-raised disabled:opacity-70"
                  >
                    <Avatar user={u} size={22} ring={false} />
                    <span className="flex-1 truncate text-xs text-text-hi">{u.name}</span>
                    {isPending ? (
                      <Loader2 size={13} className="animate-spin text-text-low" aria-hidden />
                    ) : (
                      selected && <Check size={14} className="text-info" aria-hidden />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Popover>
  )
}
