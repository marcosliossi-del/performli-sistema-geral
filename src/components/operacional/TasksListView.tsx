'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { StatusBadge } from '@/components/tasks/StatusBadge'
import type { OperacionalTask } from '@/lib/dal'
import { TaskListRow } from './TaskListRow'
import { QuickAddTask } from './QuickAddTask'
import {
  PIPELINE_STATUS_ORDER, CLOSED_STATUS, compareTasks, compareCompletedDesc,
  legacyStatusValue, type BoardHandlers,
} from './taskBoard'

/**
 * View LISTA (ClickUp-class): grupos por status colapsáveis na ordem do pipeline.
 * Concluído/Cancelado começam colapsados. Criação rápida só no grupo "A fazer"
 * (createOperacionalTask cria em A_FAZER; ver decisão no handoff da Fase 4b).
 */
export function TasksListView({
  tasks,
  handlers,
}: {
  tasks: OperacionalTask[]
  handlers: BoardHandlers
}) {
  // Colapso: encerrados começam fechados; usuário sobrepõe por grupo.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})

  const groups = useMemo(() => {
    const byStatus = new Map<string, OperacionalTask[]>()
    for (const t of tasks) {
      const arr = byStatus.get(t.status)
      if (arr) arr.push(t)
      else byStatus.set(t.status, [t])
    }
    return PIPELINE_STATUS_ORDER
      .filter((s) => byStatus.has(s) || s === 'A_FAZER')
      .map((status) => {
        const items = (byStatus.get(status) ?? []).slice()
        items.sort(CLOSED_STATUS.has(status) ? compareCompletedDesc : compareTasks)
        return { status, items }
      })
  }, [tasks])

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const collapsedDefault = CLOSED_STATUS.has(g.status)
        const collapsed = overrides[g.status] ?? collapsedDefault
        const showQuickAdd = handlers.canEdit && g.status === 'A_FAZER'
        return (
          <div key={g.status}>
            <button
              type="button"
              onClick={() => setOverrides((o) => ({ ...o, [g.status]: !collapsed }))}
              className="group mb-1.5 flex items-center gap-2"
            >
              {collapsed
                ? <ChevronRight size={14} className="text-[#647488]" aria-hidden />
                : <ChevronDown size={14} className="text-[#647488]" aria-hidden />}
              <StatusBadge value={legacyStatusValue(g.status)} size="sm" />
              <span className="rounded-full bg-white/[0.05] px-2 py-0.5 font-mono text-[11px] text-[#647488] tabular-nums">
                {g.items.length}
              </span>
            </button>

            {!collapsed && (
              <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#10151c]">
                <div className="divide-y divide-white/[0.05]">
                  {g.items.map((t) => (
                    <TaskListRow key={t.id} task={t} handlers={handlers} />
                  ))}
                  {g.items.length === 0 && !showQuickAdd && (
                    <p className="px-3 py-3 text-[12px] text-[#647488]">Nenhuma tarefa neste status.</p>
                  )}
                </div>
                {showQuickAdd && (
                  <div className="border-t border-white/[0.05]">
                    <QuickAddTask onCreate={handlers.onQuickCreate} />
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
