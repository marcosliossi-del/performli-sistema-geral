'use client'

import type { TaskPriority } from '@prisma/client'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/tasks/StatusBadge'
import { PriorityFlag } from '@/components/tasks/PriorityFlag'
import { AssigneeAvatars } from '@/components/tasks/AssigneeAvatars'
import { TagChip } from '@/components/tasks/TagChip'
import type { OperacionalTask } from '@/lib/dal'
import { DueDateEditor } from './DueDateEditor'
import {
  isOverdue, legacyStatusValue, STATUS_VALUE_OPTIONS, type BoardHandlers,
} from './taskBoard'

/**
 * Linha da view Lista com edição inline (compõe os átomos da Fase 3 em modo
 * interativo). Espelha o layout do TaskRow, mas fia status/prioridade/prazo/
 * responsáveis às actions. Estático quando o papel não pode editar (RBAC na
 * renderização; a segurança real está no backend).
 */
export function TaskListRow({ task, handlers }: { task: OperacionalTask; handlers: BoardHandlers }) {
  const overdue = isOverdue(task)
  const { canEdit, canEditStatusOnly } = handlers
  // GESTOR_TRAFEGO só move de coluna: status ativo, resto estático.
  const canChangeStatus = canEdit || canEditStatusOnly
  const priority = task.priority as TaskPriority

  return (
    <div
      className={cn(
        'group flex h-11 items-center gap-3 border-l-2 pl-2 pr-3 transition-colors hover:bg-white/[0.035]',
        overdue ? 'border-l-danger' : 'border-l-transparent',
      )}
    >
      <div className="w-40 shrink-0">
        {canChangeStatus ? (
          <StatusBadge
            value={legacyStatusValue(task.status)}
            interactive
            size="sm"
            options={STATUS_VALUE_OPTIONS}
            onChange={async (next) => {
              if (next.kind === 'legacy') await handlers.onChangeStatus(task, next.status)
            }}
          />
        ) : (
          <StatusBadge value={legacyStatusValue(task.status)} size="sm" />
        )}
      </div>

      <button
        type="button"
        onClick={() => handlers.onOpen(task.id)}
        onMouseEnter={() => handlers.onPrefetch?.(task.id)}
        onFocus={() => handlers.onPrefetch?.(task.id)}
        className="min-w-0 flex-1 truncate text-left text-[13px] text-[#EBEBEB] hover:text-[#95BBE2]"
      >
        {task.title}
        {task.clientName && <span className="ml-2 text-[11px] text-[#647488]">· {task.clientName}</span>}
      </button>

      {task.tags.length > 0 && (
        <div className="hidden shrink-0 items-center gap-1 lg:flex">
          {task.tags.slice(0, 2).map((t, i) => <TagChip key={i} label={t} size="sm" />)}
          {task.tags.length > 2 && <span className="text-[10px] text-[#647488]">+{task.tags.length - 2}</span>}
        </div>
      )}

      <div
        className="w-40 shrink-0 text-right"
        title={!canEdit && canEditStatusOnly ? 'Seu perfil altera apenas o status da tarefa.' : undefined}
      >
        <DueDateEditor
          dueDate={task.dueDate}
          editable={canEdit}
          onChange={(iso) => handlers.onChangeDueDate(task, iso)}
        />
      </div>

      <div
        className="w-16 shrink-0"
        title={!canEdit && canEditStatusOnly ? 'Seu perfil altera apenas o status da tarefa.' : undefined}
      >
        {canEdit ? (
          <AssigneeAvatars
            assignees={task.assignees}
            interactive
            options={handlers.users}
            size={22}
            max={3}
            onToggle={(userId, willAssign) => handlers.onToggleAssignee(task, userId, willAssign)}
          />
        ) : (
          <AssigneeAvatars assignees={task.assignees} size={22} max={3} />
        )}
      </div>

      <div className="w-8 shrink-0 text-right">
        {canEdit ? (
          <PriorityFlag
            priority={priority}
            interactive
            allowClear={false}
            showLabel={false}
            size="sm"
            onChange={async (next) => { if (next) await handlers.onChangePriority(task, next) }}
          />
        ) : (
          <PriorityFlag priority={priority} showLabel={false} size="sm" />
        )}
      </div>
    </div>
  )
}
