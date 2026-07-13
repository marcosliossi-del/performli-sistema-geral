// Motor compartilhado das views ClickUp-class da Central de Tarefas (Fase 4b).
// "Os dados são um só; as views são lentes" (BLOCO 2.9): Lista e Kanban leem o
// MESMO conjunto filtrado/ordenado daqui. Módulo puro e client-safe (sem prisma,
// sem server-only): apenas tipos, mapeamento p/ view-model e helpers.

import type { TaskStatus, TaskPriority } from '@prisma/client'
import type { OperacionalTask } from '@/lib/dal'
import type { TaskVM } from '@/components/tasks/types'
import type { StatusValue } from '@/components/tasks/StatusBadge'
import type { AssigneeUser } from '@/components/tasks/AssigneeAvatars'
import { STATUS_LABELS, label } from './labels'

// ─── Contrato de interações (partilhado por Lista e Kanban) ────────────────────
// Todas as mutações são otimistas na Central; os handlers aplicam o estado local
// ANTES de chamar a action e fazem rollback + rethrow no erro (o átomo da Fase 3
// mostra o toast). O motor de dados é único (D-001).
export type BoardHandlers = {
  /** Abre o painel canônico da task (/t/[id], D-009). */
  onOpen: (taskId: string) => void
  /** Prefetch da rota do painel (hover/focus) para abrir instantâneo. */
  onPrefetch?: (taskId: string) => void
  onChangeStatus: (task: OperacionalTask, next: string) => Promise<void>
  onChangePriority: (task: OperacionalTask, next: TaskPriority) => Promise<void>
  onChangeDueDate: (task: OperacionalTask, iso: string | null) => Promise<void>
  onToggleAssignee: (task: OperacionalTask, userId: string, willAssign: boolean) => Promise<void>
  /** Reordena dentro da coluna (Kanban): índices dos vizinhos (null nas bordas). */
  onReorder: (taskId: string, before: string | null, after: string | null) => Promise<void>
  /**
   * Semeia a coluna inteira na ordem visual dada (ids em ordem). Usado no
   * primeiro reorder de uma coluna com orderIndex majoritariamente NULL —
   * sem isso, a chave nova não reflete a posição visual (nulls ordenam depois)
   * e o card "pula" após refresh.
   */
  onReorderSeed: (orderedIds: string[]) => Promise<void>
  /** Criação rápida — cria SEMPRE em "A fazer" (createOperacionalTask). */
  onQuickCreate: (title: string) => Promise<void>
  /** Edição plena (criar/editar campos/atribuir/reordenar). GESTOR_TRAFEGO=false. */
  canEdit: boolean
  /**
   * Papel que SÓ move de coluna (altera status), sem editar campos/atribuir —
   * GESTOR_TRAFEGO. Quando true (e canEdit false), o dropdown de status fica
   * ativo, mas prioridade/prazo/responsáveis/criação ficam bloqueados.
   */
  canEditStatusOnly: boolean
  /** Universo de responsáveis selecionáveis. */
  users: AssigneeUser[]
}

const TZ = 'America/Sao_Paulo'

// ─── View toggle (persistência localStorage, default Lista) ────────────────────
export type BoardView = 'lista' | 'kanban' | 'calendario' | 'cliente' | 'responsavel' | 'area'

const VIEW_KEY = 'performli.operacional.view'
const FILTERS_KEY = 'performli.operacional.filters'
const KANBAN_GROUP_KEY = 'performli.operacional.kanbanGroup'

export function loadView(): BoardView {
  if (typeof window === 'undefined') return 'lista'
  const v = window.localStorage.getItem(VIEW_KEY)
  if (
    v === 'lista' || v === 'kanban' || v === 'calendario' ||
    v === 'cliente' || v === 'responsavel' || v === 'area'
  ) return v
  return 'lista'
}

export function saveView(v: BoardView): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(VIEW_KEY, v) } catch { /* quota/privado: ignora */ }
}

// ─── Agrupamento do Kanban: por status (11) ou por grupo visual (6) ────────────
// Mesma preferência-por-localStorage das outras prefs de board (view/filtros).
export type KanbanGrouping = 'status' | 'grupo'

export function loadKanbanGrouping(): KanbanGrouping {
  if (typeof window === 'undefined') return 'status'
  return window.localStorage.getItem(KANBAN_GROUP_KEY) === 'grupo' ? 'grupo' : 'status'
}

export function saveKanbanGrouping(g: KanbanGrouping): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(KANBAN_GROUP_KEY, g) } catch { /* ignora */ }
}

// ─── Filtros combináveis (AND) — barra única das duas views ────────────────────
export type DueFilter = 'atrasadas' | 'hoje' | 'proximos7' | 'semdata'

export type TaskFilters = {
  status: string[]     // multi
  assignee: string[]   // multi (userId)
  priority: string[]   // multi
  area: string[]       // multi (AreaCode) — Categoria
  clientId: string     // select ('' = todos, '__interno__' = sem cliente)
  due: DueFilter | null
  search: string       // client-side
}

export const EMPTY_FILTERS: TaskFilters = {
  status: [], assignee: [], priority: [], area: [], clientId: '', due: null, search: '',
}

export function loadFilters(): TaskFilters {
  if (typeof window === 'undefined') return EMPTY_FILTERS
  try {
    const raw = window.localStorage.getItem(FILTERS_KEY)
    if (!raw) return EMPTY_FILTERS
    const parsed = JSON.parse(raw) as Partial<TaskFilters>
    return {
      status: Array.isArray(parsed.status) ? parsed.status : [],
      assignee: Array.isArray(parsed.assignee) ? parsed.assignee : [],
      priority: Array.isArray(parsed.priority) ? parsed.priority : [],
      area: Array.isArray(parsed.area) ? parsed.area : [],
      clientId: typeof parsed.clientId === 'string' ? parsed.clientId : '',
      due: parsed.due === 'atrasadas' || parsed.due === 'hoje' || parsed.due === 'proximos7' || parsed.due === 'semdata' ? parsed.due : null,
      search: typeof parsed.search === 'string' ? parsed.search : '',
    }
  } catch {
    return EMPTY_FILTERS
  }
}

export function saveFilters(f: TaskFilters): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(FILTERS_KEY, JSON.stringify(f)) } catch { /* ignora */ }
}

export function countActiveFilters(f: TaskFilters): number {
  return (
    f.status.length + f.assignee.length + f.priority.length + f.area.length +
    (f.clientId ? 1 : 0) + (f.due ? 1 : 0) + (f.search.trim() ? 1 : 0)
  )
}

// ─── Datas: "hoje/atrasada" por DIA no fuso Arkza (coerente com DueDateChip) ────
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** Nº de dias inteiros de `date` até hoje (negativo = passado), no fuso Arkza. */
export function dayDiffFromToday(date: Date): number {
  const a = Date.parse(dayFmt.format(date))
  const b = Date.parse(dayFmt.format(new Date()))
  return Math.round((a - b) / 86_400_000)
}

const OPEN_EXCLUDED = new Set(['CONCLUIDO', 'CANCELADO'])

/** Tarefa aberta (não encerrada) com prazo já vencido. */
export function isOverdue(t: OperacionalTask): boolean {
  return !OPEN_EXCLUDED.has(t.status) && t.dueDate != null && dayDiffFromToday(new Date(t.dueDate)) < 0
}

function matchesDue(t: OperacionalTask, due: DueFilter): boolean {
  if (due === 'semdata') return t.dueDate == null
  if (t.dueDate == null) return false
  const d = dayDiffFromToday(new Date(t.dueDate))
  if (due === 'atrasadas') return !OPEN_EXCLUDED.has(t.status) && d < 0
  if (due === 'hoje') return d === 0
  if (due === 'proximos7') return d >= 0 && d <= 7
  return true
}

/** Aplica todos os filtros (AND). Busca por título ou nome do cliente. */
export function applyFilters(tasks: OperacionalTask[], f: TaskFilters): OperacionalTask[] {
  const q = f.search.trim().toLowerCase()
  const statusSet = f.status.length ? new Set(f.status) : null
  const prioSet = f.priority.length ? new Set(f.priority) : null
  const assigneeSet = f.assignee.length ? new Set(f.assignee) : null
  const areaSet = f.area.length ? new Set(f.area) : null

  return tasks.filter((t) => {
    if (statusSet && !statusSet.has(t.status)) return false
    if (prioSet && !prioSet.has(t.priority)) return false
    if (assigneeSet && !t.assignees.some((a) => assigneeSet.has(a.id))) return false
    if (areaSet && !(t.areaCode != null && areaSet.has(t.areaCode))) return false
    if (f.clientId) {
      if (f.clientId === '__interno__') { if (t.clientName != null) return false }
      else if (t.clientId !== f.clientId) return false
    }
    if (f.due && !matchesDue(t, f.due)) return false
    if (q && !(t.title.toLowerCase().includes(q) || (t.clientName ?? '').toLowerCase().includes(q))) return false
    return true
  })
}

// ─── Ordenação: orderIndex asc (nulls last) → dueDate asc ──────────────────────
export function compareTasks(a: OperacionalTask, b: OperacionalTask): number {
  const ao = a.orderIndex, bo = b.orderIndex
  if (ao != null && bo != null) { if (ao !== bo) return ao < bo ? -1 : 1 }
  else if (ao != null) return -1        // com índice vem antes de sem índice
  else if (bo != null) return 1
  // desempate por prazo asc (sem prazo por último)
  const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
  const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
  if (ad !== bd) return ad - bd
  // Mais recente primeiro no empate final; 0 em igualdade (contrato de comparador).
  if (a.createdAt === b.createdAt) return 0
  return a.createdAt < b.createdAt ? 1 : -1
}

/** Ordena as encerradas por conclusão mais recente (coluna/‌grupo Concluído/Cancelado). */
export function compareCompletedDesc(a: OperacionalTask, b: OperacionalTask): number {
  const ac = a.completedAt ? new Date(a.completedAt).getTime() : (a.dueDate ? new Date(a.dueDate).getTime() : 0)
  const bc = b.completedAt ? new Date(b.completedAt).getTime() : (b.dueDate ? new Date(b.dueDate).getTime() : 0)
  return bc - ac
}

// ─── Pipeline de status ────────────────────────────────────────────────────────
/** Ordem canônica do pipeline (grupos da view Lista). */
export const PIPELINE_STATUS_ORDER: string[] = [
  'A_FAZER', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE', 'AGUARDANDO_GESTOR', 'AGUARDANDO_CS',
  'EM_VALIDACAO', 'AJUSTES_SOLICITADOS', 'BLOQUEADO', 'ATRASADO', 'CONCLUIDO', 'CANCELADO',
]

/** Colunas sempre visíveis no Kanban (as 8 ativas do fluxo + Concluído). */
export const KANBAN_BASE_STATUS: string[] = [
  'A_FAZER', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE', 'AGUARDANDO_CS', 'EM_VALIDACAO',
  'AJUSTES_SOLICITADOS', 'BLOQUEADO', 'CONCLUIDO',
]

/** Status encerrados: colapsados por default (Lista) e limitados a 20 (Kanban). */
export const CLOSED_STATUS = new Set(['CONCLUIDO', 'CANCELADO'])
export const DONE_COLUMN_LIMIT = 20

/** Status que o dropdown interativo do StatusBadge oferece. */
export const STATUS_CHOICES: string[] = [
  'A_FAZER', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE', 'AGUARDANDO_GESTOR', 'AGUARDANDO_CS',
  'EM_VALIDACAO', 'AJUSTES_SOLICITADOS', 'BLOQUEADO', 'CONCLUIDO', 'CANCELADO',
]

export function legacyStatusValue(status: string): StatusValue {
  return { kind: 'legacy', status: status as TaskStatus }
}

export const STATUS_VALUE_OPTIONS: StatusValue[] = STATUS_CHOICES.map(legacyStatusValue)

export function statusLabel(status: string): string {
  return label(STATUS_LABELS, status)
}

// ─── Grupos visuais de status (spec §3 — ZERO migração, enum intocado) ─────────
// Os 11 status do enum viram 6 grupos de APRESENTAÇÃO. Nada muda no schema nem
// nos filtros (que seguem pelos 11). Só o Kanban ganha o modo "por grupo".
// ATRASADO é flag derivada de prazo (isOverdue), mas continua sendo um valor de
// enum possível no dado — para não perder cards, cai em "Em andamento".
export type VisualStatusGroup =
  | 'PARA_FAZER'
  | 'EM_ANDAMENTO'
  | 'VALIDACAO_INTERNA'
  | 'AGUARDANDO'
  | 'ALTERACAO_AJUSTE'
  | 'CONCLUIDO'

export const VISUAL_GROUP_ORDER: VisualStatusGroup[] = [
  'PARA_FAZER', 'EM_ANDAMENTO', 'VALIDACAO_INTERNA', 'AGUARDANDO', 'ALTERACAO_AJUSTE', 'CONCLUIDO',
]

export const VISUAL_GROUP_LABELS: Record<VisualStatusGroup, string> = {
  PARA_FAZER: 'Para fazer',
  EM_ANDAMENTO: 'Em andamento',
  VALIDACAO_INTERNA: 'Validação interna',
  AGUARDANDO: 'Aguardando',
  ALTERACAO_AJUSTE: 'Alteração e ajuste',
  CONCLUIDO: 'Concluído',
}

/** Status que compõem cada grupo (ordem = ordem interna da coluna). */
export const VISUAL_GROUP_STATUSES: Record<VisualStatusGroup, string[]> = {
  PARA_FAZER: ['A_FAZER'],
  EM_ANDAMENTO: ['EM_ANDAMENTO', 'ATRASADO'],
  VALIDACAO_INTERNA: ['EM_VALIDACAO'],
  AGUARDANDO: ['AGUARDANDO_CLIENTE', 'AGUARDANDO_CS', 'AGUARDANDO_GESTOR'],
  ALTERACAO_AJUSTE: ['AJUSTES_SOLICITADOS', 'BLOQUEADO'],
  CONCLUIDO: ['CONCLUIDO', 'CANCELADO'],
}

/**
 * Status "principal" aplicado ao soltar um card num grupo com vários status
 * (drag entre colunas de grupo). Grupos de 1 status aplicam o próprio; grupos
 * multi aplicam o representante operacional definido na spec §3.
 */
export const VISUAL_GROUP_PRIMARY: Record<VisualStatusGroup, string> = {
  PARA_FAZER: 'A_FAZER',
  EM_ANDAMENTO: 'EM_ANDAMENTO',
  VALIDACAO_INTERNA: 'EM_VALIDACAO',
  AGUARDANDO: 'AGUARDANDO_CLIENTE',
  ALTERACAO_AJUSTE: 'AJUSTES_SOLICITADOS',
  CONCLUIDO: 'CONCLUIDO',
}

const STATUS_TO_GROUP: Record<string, VisualStatusGroup> = (() => {
  const m: Record<string, VisualStatusGroup> = {}
  for (const g of VISUAL_GROUP_ORDER) for (const s of VISUAL_GROUP_STATUSES[g]) m[s] = g
  return m
})()

/** Grupo visual do status (fallback "Em andamento" p/ valores fora do mapa). */
export function visualGroupOf(status: string): VisualStatusGroup {
  return STATUS_TO_GROUP[status] ?? 'EM_ANDAMENTO'
}

// ─── View-model p/ TaskRow / TaskCard (Fase 3) ─────────────────────────────────
export function toTaskVM(t: OperacionalTask): TaskVM {
  return {
    id: t.id,
    title: t.title,
    status: legacyStatusValue(t.status),
    priority: t.priority as TaskPriority,
    assignees: t.assignees.map((a) => ({ id: a.id, name: a.name })),
    tags: t.tags.map((tag, i) => ({ id: `${t.id}:${i}`, label: tag })),
    dueDate: t.dueDate,
    overdue: isOverdue(t),
    clientName: t.clientName,
    checklist: t.checklistTotal > 0 ? { done: t.checklistDone, total: t.checklistTotal } : undefined,
    commentCount: t.commentCount,
  }
}
