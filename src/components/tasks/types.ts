import type { StatusValue } from './StatusBadge'
import type { AssigneeUser } from './AssigneeAvatars'
import type { TaskPriority } from '@prisma/client'

/** Tag simples (view-model). */
export type TaskTagVM = { id: string; label: string; color?: string }

/**
 * View-model enxuto de tarefa para linhas/cards.
 * Montado pela camada de leitura (A4) a partir do payload Prisma — os
 * componentes NÃO consultam dados, só renderizam.
 */
export type TaskVM = {
  id: string
  title: string
  status: StatusValue
  priority: TaskPriority | null
  assignees: AssigneeUser[]
  tags: TaskTagVM[]
  dueDate: Date | string | null
  recurring?: boolean
  /** True quando dueDate já passou e a tarefa não está encerrada. */
  overdue?: boolean
  /** Nome do cliente/lista de origem (opcional, usado no card). */
  clientName?: string | null
  checklist?: { done: number; total: number }
  commentCount?: number
}
