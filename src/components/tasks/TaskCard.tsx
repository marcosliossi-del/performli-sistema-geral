'use client'

import { CheckSquare, GripVertical, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PriorityFlag } from './PriorityFlag'
import { AssigneeAvatars } from './AssigneeAvatars'
import { DueDateChip } from './DueDateChip'
import { TagChip } from './TagChip'
import type { TaskVM } from './types'

/**
 * Card do Kanban. Título, cliente (opcional), prazo, prioridade, responsáveis,
 * contadores de checklist e comentários. `dragHandleProps` é repassado pela
 * lib de DnD (A4) ao grip.
 */
export function TaskCard({
  task,
  onOpen,
  dragHandleProps,
  className,
}: {
  task: TaskVM
  onOpen?: (taskId: string) => void
  dragHandleProps?: React.HTMLAttributes<HTMLElement>
  className?: string
}) {
  const checklist = task.checklist
  return (
    <div
      className={cn(
        'card group relative p-3 text-left',
        task.overdue && 'border-l-2 border-l-danger',
        className,
      )}
    >
      <div className="flex items-start gap-1.5">
        {dragHandleProps && (
          <span
            {...dragHandleProps}
            aria-label="Arrastar tarefa"
            className="mt-0.5 cursor-grab text-text-low opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
          >
            <GripVertical size={14} aria-hidden />
          </span>
        )}
        <button
          type="button"
          onClick={() => onOpen?.(task.id)}
          className="min-w-0 flex-1 text-left text-[13px] font-medium leading-snug text-text-hi hover:text-brand-strong"
        >
          {task.title}
        </button>
      </div>

      {task.clientName && (
        <p className="mt-1 truncate text-[11px] text-text-mid">{task.clientName}</p>
      )}

      {task.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {task.tags.map((t) => (
            <TagChip key={t.id} label={t.label} color={t.color} size="sm" />
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <DueDateChip dueDate={task.dueDate} recurring={task.recurring} size="sm" />
        <PriorityFlag priority={task.priority} showLabel={false} size="sm" />
        <div className="ml-auto flex items-center gap-2 text-[11px] text-text-low">
          {checklist && checklist.total > 0 && (
            <span
              className="inline-flex items-center gap-0.5"
              title={`${checklist.done} de ${checklist.total} itens concluídos`}
            >
              <CheckSquare size={12} aria-hidden />
              {checklist.done}/{checklist.total}
            </span>
          )}
          {task.commentCount != null && task.commentCount > 0 && (
            <span className="inline-flex items-center gap-0.5" title={`${task.commentCount} comentários`}>
              <MessageSquare size={12} aria-hidden />
              {task.commentCount}
            </span>
          )}
          <AssigneeAvatars assignees={task.assignees} size={22} max={3} />
        </div>
      </div>
    </div>
  )
}
