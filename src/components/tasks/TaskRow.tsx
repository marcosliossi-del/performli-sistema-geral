'use client'

import { cn } from '@/lib/utils'
import { StatusBadge } from './StatusBadge'
import { PriorityFlag } from './PriorityFlag'
import { AssigneeAvatars } from './AssigneeAvatars'
import { DueDateChip } from './DueDateChip'
import { TagChip } from './TagChip'
import type { TaskVM } from './types'

/**
 * Linha densa da view Lista (~40px). Borda esquerda vermelha quando atrasada.
 * Título clicável abre o painel da task. Seleção via checkbox (multi-select).
 */
export function TaskRow({
  task,
  selected = false,
  onSelectChange,
  onOpen,
  className,
}: {
  task: TaskVM
  selected?: boolean
  onSelectChange?: (checked: boolean) => void
  onOpen?: (taskId: string) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'group flex h-10 items-center gap-3 border-l-2 pl-2 pr-3 transition-colors hover:bg-surface-raised',
        task.overdue ? 'border-l-danger' : 'border-l-transparent',
        className,
      )}
    >
      {onSelectChange && (
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelectChange(e.target.checked)}
          aria-label={`Selecionar ${task.title}`}
          className="h-3.5 w-3.5 shrink-0 accent-[var(--ak-brand)]"
        />
      )}

      <div className="w-36 shrink-0">
        <StatusBadge value={task.status} size="sm" />
      </div>

      <button
        type="button"
        onClick={() => onOpen?.(task.id)}
        className="min-w-0 flex-1 truncate text-left text-[13px] text-text-hi hover:text-brand-strong"
      >
        {task.title}
      </button>

      {task.tags.length > 0 && (
        <div className="hidden shrink-0 items-center gap-1 lg:flex">
          {task.tags.slice(0, 2).map((t) => (
            <TagChip key={t.id} label={t.label} color={t.color} size="sm" />
          ))}
          {task.tags.length > 2 && (
            <span className="text-[10px] text-text-low">+{task.tags.length - 2}</span>
          )}
        </div>
      )}

      <div className="w-40 shrink-0 text-right">
        <DueDateChip dueDate={task.dueDate} recurring={task.recurring} size="sm" />
      </div>

      <div className="w-16 shrink-0">
        <AssigneeAvatars assignees={task.assignees} size={22} />
      </div>

      <div className="w-8 shrink-0 text-right">
        <PriorityFlag priority={task.priority} showLabel={false} size="sm" />
      </div>
    </div>
  )
}
