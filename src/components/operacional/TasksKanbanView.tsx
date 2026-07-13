'use client'

import { useMemo } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { StatusBadge } from '@/components/tasks/StatusBadge'
import { TaskCard } from '@/components/tasks/TaskCard'
import { toast } from '@/lib/toast'
import type { OperacionalTask } from '@/lib/dal'
import { QuickAddTask } from './QuickAddTask'
import {
  PIPELINE_STATUS_ORDER, KANBAN_BASE_STATUS, CLOSED_STATUS, DONE_COLUMN_LIMIT,
  compareTasks, compareCompletedDesc, legacyStatusValue, toTaskVM,
  VISUAL_GROUP_ORDER, VISUAL_GROUP_LABELS, VISUAL_GROUP_PRIMARY, visualGroupOf,
  type BoardHandlers, type KanbanGrouping, type VisualStatusGroup,
} from './taskBoard'

// Cada coluna do Kanban. No modo "status" a chave é um TaskStatus; no modo
// "grupo" a chave é um VisualStatusGroup. `closed` marca a coluna encerrada
// (Concluído/Cancelado) — limitada às N mais recentes.
type Column = { key: string; label: React.ReactNode; items: OperacionalTask[]; total: number; closed: boolean; isTodo: boolean }

/**
 * View KANBAN (ClickUp-class): colunas = status do pipeline OU grupos visuais de
 * status (spec §3), conforme `grouping`. Arrastar entre colunas → updateTaskStatus
 * (no modo grupo aplica o status "principal" do grupo destino); dentro da coluna →
 * reorderTask. Concluído/Cancelado limitados às 20 mais recentes.
 */
export function TasksKanbanView({
  tasks,
  handlers,
  grouping = 'status',
}: {
  tasks: OperacionalTask[]
  handlers: BoardHandlers
  grouping?: KanbanGrouping
}) {
  // GESTOR_TRAFEGO (status-only) também arrasta entre colunas para mudar status.
  const canDrag = handlers.canEdit || handlers.canEditStatusOnly

  const columns = useMemo<Column[]>(() => {
    if (grouping === 'grupo') {
      const byGroup = new Map<VisualStatusGroup, OperacionalTask[]>()
      for (const t of tasks) {
        const g = visualGroupOf(t.status)
        const arr = byGroup.get(g)
        if (arr) arr.push(t)
        else byGroup.set(g, [t])
      }
      return VISUAL_GROUP_ORDER.map((g) => {
        const all = byGroup.get(g) ?? []
        const closed = g === 'CONCLUIDO'
        const items = closed
          ? all.slice().sort(compareCompletedDesc).slice(0, DONE_COLUMN_LIMIT)
          : all.slice().sort(compareTasks)
        return { key: g, label: VISUAL_GROUP_LABELS[g], items, total: all.length, closed, isTodo: g === 'PARA_FAZER' }
      })
    }
    // Modo status (padrão): uma coluna por status do pipeline.
    const present = new Set(tasks.map((t) => t.status))
    const statuses = PIPELINE_STATUS_ORDER.filter((s) => KANBAN_BASE_STATUS.includes(s) || present.has(s))
    return statuses.map((status) => {
      const all = tasks.filter((t) => t.status === status)
      const closed = CLOSED_STATUS.has(status)
      const items = closed
        ? all.slice().sort(compareCompletedDesc).slice(0, DONE_COLUMN_LIMIT)
        : all.slice().sort(compareTasks)
      return {
        key: status,
        label: <StatusBadge value={legacyStatusValue(status)} size="sm" />,
        items, total: all.length, closed, isTodo: status === 'A_FAZER',
      }
    })
  }, [tasks, grouping])

  async function onDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const task = tasks.find((t) => t.id === draggableId)
    if (!task) return

    // ── Modo grupo: soltar num grupo diferente aplica o status "principal" dele.
    // Soltar no mesmo grupo é no-op (grupo mistura status; reordenar entre eles
    // seria ambíguo e poderia trocar o status sem intenção do usuário).
    if (grouping === 'grupo') {
      if (destination.droppableId === source.droppableId) return
      const primary = VISUAL_GROUP_PRIMARY[destination.droppableId as VisualStatusGroup]
      if (!primary || primary === task.status) return
      try {
        await handlers.onChangeStatus(task, primary)
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Não foi possível mover a tarefa.', 'err')
      }
      return
    }

    const destStatus = destination.droppableId
    // GESTOR_TRAFEGO só move de coluna (status); reordenar dentro da coluna é
    // edição de campo — bloqueia com motivo operacional.
    if (destStatus === source.droppableId && !handlers.canEdit) {
      toast('Seu perfil altera apenas o status da tarefa.', 'err')
      return
    }
    // Handlers rethrow no erro (rollback já aplicado); aqui mostramos o toast
    // porque o drag não passa por um átomo interativo da Fase 3.
    try {
      if (destStatus !== source.droppableId) {
        // Entre colunas → troca de status (optimistic + rollback no handler).
        await handlers.onChangeStatus(task, destStatus)
        return
      }
      // Dentro da coluna → reordena com o orderIndex dos vizinhos (null nas bordas).
      const col = columns.find((c) => c.key === destStatus)
      if (!col) return
      const without = col.items.filter((t) => t.id !== draggableId)
      // Coluna com itens SEM orderIndex: chaves de vizinhos nulos não refletem
      // a posição visual (nulls ordenam depois) — semeia a coluna inteira na
      // nova ordem visual, uma única vez; depois disso o caminho barato assume.
      const newOrder = [...without]
      newOrder.splice(destination.index, 0, task)
      if (newOrder.some((t) => t.orderIndex == null)) {
        await handlers.onReorderSeed(newOrder.map((t) => t.id))
        return
      }
      const before = without[destination.index - 1]?.orderIndex ?? null
      const after = without[destination.index]?.orderIndex ?? null
      await handlers.onReorder(draggableId, before, after)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível mover a tarefa.', 'err')
    }
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-3.5 overflow-x-auto pb-2">
        {columns.map((col) => {
          const truncated = col.items.length < col.total
          const showQuickAdd = handlers.canEdit && col.isTodo
          return (
            <div
              key={col.key}
              className="flex w-[280px] min-w-[280px] flex-shrink-0 flex-col rounded-xl border border-white/[0.08] bg-[#10151c]"
            >
              <div className="flex items-center gap-2 border-b border-white/[0.05] px-3.5 py-3">
                {typeof col.label === 'string'
                  ? <span className="text-[12.5px] font-bold text-[#EBEBEB]">{col.label}</span>
                  : col.label}
                <span className="ml-auto rounded-full bg-white/[0.05] px-2 py-0.5 font-mono text-[11px] text-[#647488] tabular-nums">
                  {col.total}
                </span>
              </div>

              <Droppable droppableId={col.key}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 space-y-2.5 p-2.5 transition-colors ${snapshot.isDraggingOver ? 'bg-white/[0.03]' : ''}`}
                  >
                    {col.items.map((t, index) => (
                      <Draggable
                        key={t.id}
                        draggableId={t.id}
                        index={index}
                        isDragDisabled={!canDrag}
                      >
                        {(prov, snap) => (
                          <div
                            ref={prov.innerRef}
                            {...prov.draggableProps}
                            className={snap.isDragging ? 'opacity-90' : ''}
                          >
                            <TaskCard
                              task={toTaskVM(t)}
                              onOpen={handlers.onOpen}
                              onPrefetch={handlers.onPrefetch}
                              dragHandleProps={
                                canDrag && prov.dragHandleProps
                                  // As libs de DnD e a Fase 3 divergem no tipo do handle;
                                  // os props são spread num elemento, então o cast é seguro.
                                  ? (prov.dragHandleProps as unknown as React.HTMLAttributes<HTMLElement>)
                                  : undefined
                              }
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}

                    {truncated && (
                      <p className="px-1 pt-1 text-center text-[10.5px] text-[#647488]">
                        mostrando as {col.items.length} mais recentes de {col.total}
                      </p>
                    )}
                    {col.total === 0 && !showQuickAdd && (
                      <p className="px-1 py-4 text-center text-[11px] text-[#647488]">Vazio</p>
                    )}
                  </div>
                )}
              </Droppable>

              {showQuickAdd && (
                <div className="border-t border-white/[0.05] p-2.5">
                  <QuickAddTask onCreate={handlers.onQuickCreate} variant="card" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </DragDropContext>
  )
}
