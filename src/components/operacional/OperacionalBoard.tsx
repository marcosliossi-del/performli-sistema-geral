'use client'

import { useMemo, useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ChevronDown, ChevronRight } from 'lucide-react'
import type { TaskStatus } from '@prisma/client'
import type { OperacionalTask, NovaTarefaContext } from '@/lib/dal'
import { toast } from '@/lib/toast'
import { orderBetween } from '@/lib/tasks/fractional'
import {
  updateTaskStatus, updateTaskFields, assignTask, unassignTask, reorderTask,
} from '@/app/actions/tasks'
import { createOperacionalTask } from '@/app/actions/operacional'
import { TaskDrawer } from './TaskDrawer'
import { NovaTarefaModal } from './NovaTarefaModal'
import { TaskFiltersBar } from './TaskFiltersBar'
import { TasksListView } from './TasksListView'
import { TasksKanbanView } from './TasksKanbanView'
import {
  applyFilters, loadView, saveView, loadFilters, saveFilters,
  loadKanbanGrouping, saveKanbanGrouping, countActiveFilters,
  EMPTY_FILTERS, isOverdue as isOverdueVM,
  type BoardView, type TaskFilters, type BoardHandlers, type KanbanGrouping,
} from './taskBoard'
import {
  STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, label,
} from './labels'

const VIEWS: { key: BoardView; label: string }[] = [
  { key: 'lista', label: 'Lista' },
  { key: 'kanban', label: 'Kanban' },
  { key: 'calendario', label: 'Calendário' },
  { key: 'cliente', label: 'Por Cliente' },
  { key: 'responsavel', label: 'Por Gestor' },
  { key: 'area', label: 'Por Área' },
]

function Segmented({ view, setView }: { view: BoardView; setView: (v: BoardView) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const active = wrap.querySelector<HTMLButtonElement>(`[data-v="${view}"]`)
    if (active) setThumb({ left: active.offsetLeft, width: active.offsetWidth })
  }, [view])

  return (
    <div ref={wrapRef} className="relative inline-flex gap-0.5 bg-white/[0.05] border border-white/[0.09] rounded-xl p-[3px]">
      {thumb && (
        <span
          className="absolute top-[3px] bottom-[3px] rounded-[9px] bg-gradient-to-b from-[#54e0ee] to-[#22c2d6] shadow-[0_4px_12px_-4px_rgba(34,194,214,0.5)] transition-[transform,width] duration-[380ms] ease-[cubic-bezier(.34,1.56,.64,1)]"
          style={{ transform: `translateX(${thumb.left - 3}px)`, width: thumb.width }}
        />
      )}
      {VIEWS.map((v) => (
        <button
          key={v.key}
          data-v={v.key}
          onClick={() => setView(v.key)}
          className={`relative z-10 text-[12.5px] px-[15px] py-[7px] rounded-[9px] whitespace-nowrap transition-colors duration-200 ${view === v.key ? 'text-[#021015] font-bold' : 'text-[#a3b2c2] font-semibold hover:text-[#f2f6fa]'}`}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}

const CRITICAL_STATUS = new Set(['BLOQUEADO', 'ATRASADO'])

function isCritical(t: OperacionalTask): boolean {
  return t.type === 'WAR_ROOM' || t.priority === 'CRITICA' || CRITICAL_STATUS.has(t.status)
}

// ── helpers de apresentação (views legadas: Calendário / Por Cliente / Por Gestor) ──
const AV_COLORS = ['#4d96ff', '#a98cff', '#34c97a', '#f0922b', '#22c2d6', '#ff5e6a', '#e3ad45']
function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AV_COLORS[h % AV_COLORS.length]
}
function initials(name: string): string {
  const p = name.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '—'
}
function relativeDue(d: Date): string {
  const diff = new Date(d).getTime() - Date.now()
  const days = Math.round(diff / 86_400_000)
  if (diff < 0) {
    const ad = Math.abs(days)
    if (ad === 0) return 'hoje'
    return `há ${ad}d`
  }
  if (days === 0) return 'hoje'
  if (days === 1) return 'amanhã'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
function slaInfo(t: OperacionalTask): { label: string; tone: 'ok' | 'warn' | 'over' } | null {
  if (t.slaBreached) return { label: 'estourado', tone: 'over' }
  if (t.slaHours == null || t.requestedAt == null) return null
  const deadline = new Date(t.requestedAt).getTime() + t.slaHours * 3_600_000
  const remH = Math.round((deadline - Date.now()) / 3_600_000)
  if (remH < 0) return { label: `${remH}h`, tone: 'over' }
  if (remH <= 6) return { label: `${remH}h`, tone: 'warn' }
  return { label: `${remH}h`, tone: 'ok' }
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      className="w-[22px] h-[22px] rounded-full grid place-items-center text-[9px] font-bold text-[#021015] shrink-0"
      style={{ background: avatarColor(name) }}
      title={name}
    >
      {initials(name)}
    </span>
  )
}
function HealthDot({ h }: { h: OperacionalTask['clientHealth'] }) {
  const c = h === 'OTIMO' ? 'bg-success' : h === 'REGULAR' ? 'bg-warning' : h === 'RUIM' ? 'bg-danger' : 'bg-[#647488]'
  return <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${c}`} />
}
function StatusBadge({ s }: { s: string }) {
  const crit = CRITICAL_STATUS.has(s)
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${label(STATUS_COLORS, s)}`}>
      <span className={`w-1.5 h-1.5 rounded-full bg-current ak-dot ${crit ? 'ak-pulse' : ''}`} />{label(STATUS_LABELS, s)}
    </span>
  )
}
function PriorityFlag({ p }: { p: string }) {
  const c = p === 'CRITICA' ? '#ff3b4e' : p === 'ALTA' ? '#f0922b' : p === 'MEDIA' ? '#4d96ff' : '#5b6b7c'
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: c }}>
      <span style={{ width: 0, height: 0, borderLeft: `8px solid ${c}`, borderTop: '5px solid transparent', borderBottom: '5px solid transparent' }} />
      {label(PRIORITY_LABELS, p)}
    </span>
  )
}

// ── Linha da tabela (views legadas Por Cliente / Por Gestor) ────────────────────
function TaskTableRow({ t, onClick }: { t: OperacionalTask; onClick: () => void }) {
  const overdue = isOverdueVM(t)
  const sla = slaInfo(t)
  return (
    <tr onClick={onClick} className={`cursor-pointer transition-colors hover:bg-white/[0.035] ${isCritical(t) ? 'shadow-[inset_3px_0_0_#ff3b4e]' : ''}`}>
      <td className="px-3.5 py-3 text-[12.5px] font-medium text-[#EBEBEB]">{t.title}</td>
      <td className="px-3.5 py-3">
        {t.clientName
          ? <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[#9fb0c0]"><HealthDot h={t.clientHealth} />{t.clientName}</span>
          : <span className="text-[11px] text-[#647488]">Interno</span>}
      </td>
      <td className="px-3.5 py-3"><Avatar name={t.assigneeName} /></td>
      <td className="px-3.5 py-3"><StatusBadge s={t.status} /></td>
      <td className="px-3.5 py-3"><PriorityFlag p={t.priority} /></td>
      <td className={`px-3.5 py-3 font-mono text-[11.5px] ${overdue ? 'text-[#ff5e6a] font-semibold' : 'text-[#9fb0c0]'}`}>
        {t.dueDate ? relativeDue(t.dueDate) : '—'}
      </td>
      <td className="px-3.5 py-3">
        {sla
          ? <span className={`font-mono text-[10.5px] px-2 py-0.5 rounded ${sla.tone === 'over' ? 'text-[#ff5e6a] bg-[#ff5e6a]/12' : sla.tone === 'warn' ? 'text-[#e3ad45] bg-white/[0.05]' : 'text-[#9fb0c0] bg-white/[0.05]'}`}>{sla.label}</span>
          : <span className="text-[10px] text-[#647488]">—</span>}
      </td>
    </tr>
  )
}

function TaskTable({ items, onSelect }: { items: OperacionalTask[]; onSelect: (t: OperacionalTask) => void }) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-[#647488]">
            <th className="text-left font-semibold px-3.5 py-2.5 border-b border-white/[0.05]">Tarefa</th>
            <th className="text-left font-semibold px-3.5 py-2.5 border-b border-white/[0.05]">Cliente</th>
            <th className="text-left font-semibold px-3.5 py-2.5 border-b border-white/[0.05]">Responsável</th>
            <th className="text-left font-semibold px-3.5 py-2.5 border-b border-white/[0.05]">Status</th>
            <th className="text-left font-semibold px-3.5 py-2.5 border-b border-white/[0.05]">Prioridade</th>
            <th className="text-left font-semibold px-3.5 py-2.5 border-b border-white/[0.05]">Prazo</th>
            <th className="text-left font-semibold px-3.5 py-2.5 border-b border-white/[0.05]">SLA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {items.map((t) => <TaskTableRow key={t.id} t={t} onClick={() => onSelect(t)} />)}
        </tbody>
      </table>
    </div>
  )
}

// ── Calendário (grade do mês, tarefas por dia de vencimento) ───────────────────
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
function CalendarView({ tasks, onSelect }: { tasks: OperacionalTask[]; onSelect: (t: OperacionalTask) => void }) {
  const now = new Date()
  const [ym, setYm] = useState<{ y: number; m: number }>({ y: now.getFullYear(), m: now.getMonth() })
  const first = new Date(ym.y, ym.m, 1)
  const startDay = first.getDay()
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array.from({ length: startDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  const byDay = new Map<number, OperacionalTask[]>()
  for (const t of tasks) {
    if (!t.dueDate) continue
    const d = new Date(t.dueDate)
    if (d.getFullYear() === ym.y && d.getMonth() === ym.m) {
      const day = d.getDate()
      if (!byDay.has(day)) byDay.set(day, [])
      byDay.get(day)!.push(t)
    }
  }
  const monthName = first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const isToday = (day: number) => now.getFullYear() === ym.y && now.getMonth() === ym.m && now.getDate() === day

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setYm((s) => (s.m === 0 ? { y: s.y - 1, m: 11 } : { y: s.y, m: s.m - 1 }))} className="text-[#95BBE2] text-sm px-2 py-1 rounded-lg hover:bg-white/[0.05]">←</button>
        <span className="text-[13px] font-bold text-[#EBEBEB] capitalize">{monthName}</span>
        <button onClick={() => setYm((s) => (s.m === 11 ? { y: s.y + 1, m: 0 } : { y: s.y, m: s.m + 1 }))} className="text-[#95BBE2] text-sm px-2 py-1 rounded-lg hover:bg-white/[0.05]">→</button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[9px] uppercase tracking-wider text-[#647488] text-center py-1 font-semibold">{w}</div>
        ))}
        {cells.map((day, i) => (
          <div key={i} className={`min-h-[76px] rounded-lg border p-1.5 ${day == null ? 'border-transparent' : isToday(day) ? 'border-[#95BBE2]/40 bg-[#95BBE2]/[0.06]' : 'border-white/[0.05] bg-[#0F1623]'}`}>
            {day != null && (
              <>
                <div className={`text-[10px] tabular mb-1 ${isToday(day) ? 'text-[#95BBE2] font-bold' : 'text-[#647488]'}`}>{day}</div>
                <div className="space-y-0.5">
                  {(byDay.get(day) ?? []).slice(0, 3).map((t) => (
                    <button key={t.id} onClick={() => onSelect(t)} title={t.title}
                      className={`block w-full text-left text-[9.5px] truncate px-1 py-0.5 rounded ${isCritical(t) ? 'bg-[#ff3b4e]/15 text-[#ff7a8a]' : isOverdueVM(t) ? 'bg-[#ff5e6a]/15 text-[#ff8aa1]' : 'bg-white/[0.06] text-[#a3b2c2]'}`}>
                      {t.title}
                    </button>
                  ))}
                  {(byDay.get(day)?.length ?? 0) > 3 && (
                    <div className="text-[9px] text-[#647488] px-1">+{(byDay.get(day)!.length - 3)} mais</div>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function OperacionalBoard({
  tasks: initialTasks, ctx, canEdit, canEditStatusOnly = false, initialTaskId, currentUser,
}: {
  tasks: OperacionalTask[]
  ctx: NovaTarefaContext
  canEdit: boolean
  /** GESTOR_TRAFEGO: só move de coluna (status), sem editar/criar. */
  canEditStatusOnly?: boolean
  initialTaskId?: string
  currentUser: { id: string; name: string }
}) {
  const router = useRouter()
  // Estado otimista local (D-001): as mutações refletem na hora e reconciliam via
  // revalidatePath das actions. Semeado das props (sem re-seed no meio da sessão).
  const [tasks, setTasks] = useState<OperacionalTask[]>(initialTasks)

  const [view, setView] = useState<BoardView>('lista')
  const [kanbanGrouping, setKanbanGrouping] = useState<KanbanGrouping>('status')
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS)
  const [hydrated, setHydrated] = useState(false)

  const [selected, setSelected] = useState<OperacionalTask | null>(null)
  const [novaOpen, setNovaOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // Preferências persistidas (localStorage) — carregadas só no cliente p/ evitar
  // divergência de hidratação (TaskSavedView sem action de escrita — ver handoff).
  // A-110: prefs namespaced por usuário (a mesma máquina pode alternar contas).
  useEffect(() => {
    setView(loadView(currentUser.id))
    setKanbanGrouping(loadKanbanGrouping(currentUser.id))
    setFilters(loadFilters(currentUser.id))
    setHydrated(true)
  }, [currentUser.id])
  useEffect(() => { if (hydrated) saveView(currentUser.id, view) }, [view, hydrated, currentUser.id])
  useEffect(() => { if (hydrated) saveKanbanGrouping(currentUser.id, kanbanGrouping) }, [kanbanGrouping, hydrated, currentUser.id])
  useEffect(() => { if (hydrated) saveFilters(currentUser.id, filters) }, [filters, hydrated, currentUser.id])

  // Deep-link: ?task=<id> abre o TaskDrawer atual (preservado — não remover).
  useEffect(() => {
    if (!initialTaskId) return
    const t = initialTasks.find((x) => x.id === initialTaskId)
    if (t) setSelected(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTaskId])

  const filtered = useMemo(() => applyFilters(tasks, filters), [tasks, filters])
  // A-110: os KPIs do topo contam o board INTEIRO (saúde global, intencional).
  // A lista abaixo é filtrada no cliente — sem sinal, "5 abertas" no KPI e 2
  // linhas na tela parecem contradição. Mostramos "N de M" quando há filtro
  // ativo (nota visual mínima que elimina a leitura errada, sem tocar o KPI).
  const activeFilterCount = countActiveFilters(filters)

  // ── Mutação otimista local ────────────────────────────────────────────────
  function patchTask(id: string, patch: Partial<OperacionalTask>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  const usersOpts = useMemo(() => ctx.usuarios.map((u) => ({ id: u.id, name: u.name })), [ctx.usuarios])
  const clientesOpts = useMemo(() => ctx.clientes.map((c) => ({ id: c.id, name: c.name })), [ctx.clientes])
  const areasOpts = useMemo(() => ctx.areas.map((a) => ({ code: a.code, name: a.name })), [ctx.areas])
  const userNameById = useMemo(() => new Map(usersOpts.map((u) => [u.id, u.name])), [usersOpts])

  // Handlers rethrow no erro (rollback já aplicado); os átomos da Fase 3 e o
  // onDragEnd do Kanban exibem o toast.
  const handlers: BoardHandlers = {
    canEdit,
    canEditStatusOnly,
    users: usersOpts,
    onOpen: (id) => router.push(`/t/${id}`),
    // Prefetch no hover/focus: aquece o RSC do painel /t/[id] antes do clique,
    // fazendo a navegação abrir instantânea (percepção de fluidez).
    onPrefetch: (id) => router.prefetch(`/t/${id}`),

    onChangeStatus: async (task, next) => {
      const prevStatus = task.status
      const prevCompleted = task.completedAt
      patchTask(task.id, { status: next, completedAt: next === 'CONCLUIDO' ? new Date() : null })
      try {
        const r = await updateTaskStatus(task.id, next as TaskStatus)
        if ('error' in r) {
          patchTask(task.id, { status: prevStatus, completedAt: prevCompleted })
          throw new Error(r.error) // KanbanBoard exibe o motivo do bloqueio
        }
      } catch (e) {
        patchTask(task.id, { status: prevStatus, completedAt: prevCompleted })
        throw e
      }
    },

    onChangePriority: async (task, next) => {
      const prev = task.priority
      patchTask(task.id, { priority: next })
      const res = await updateTaskFields(task.id, { priority: next })
      if ('error' in res) { patchTask(task.id, { priority: prev }); throw new Error(res.error) }
    },

    onChangeDueDate: async (task, iso) => {
      const prev = task.dueDate
      // Meio-dia UTC = mesmo dia em America/Sao_Paulo (espelha parseDateInput
      // do servidor; meia-noite UTC mostraria o dia anterior no chip).
      patchTask(task.id, { dueDate: iso ? new Date(`${iso}T12:00:00Z`) : null })
      const res = await updateTaskFields(task.id, { dueDate: iso })
      if ('error' in res) { patchTask(task.id, { dueDate: prev }); throw new Error(res.error) }
    },

    onToggleAssignee: async (task, userId, willAssign) => {
      const prev = task.assignees
      if (!willAssign && prev.length <= 1) {
        throw new Error('Não é possível remover o único responsável da tarefa.')
      }
      const next = willAssign
        ? [...prev, { id: userId, name: userNameById.get(userId) ?? 'Responsável' }]
        : prev.filter((a) => a.id !== userId)
      patchTask(task.id, { assignees: next })
      const res = willAssign ? await assignTask(task.id, userId) : await unassignTask(task.id, userId)
      if ('error' in res) { patchTask(task.id, { assignees: prev }); throw new Error(res.error) }
    },

    onReorder: async (taskId, before, after) => {
      const task = tasks.find((t) => t.id === taskId)
      if (!task) return
      const prev = task.orderIndex
      let newIndex: string
      try {
        newIndex = orderBetween(before, after)
      } catch (e) {
        throw e instanceof Error ? e : new Error('Não foi possível reordenar aqui.')
      }
      patchTask(taskId, { orderIndex: newIndex })
      const res = await reorderTask(taskId, before, after)
      if ('error' in res) { patchTask(taskId, { orderIndex: prev }); throw new Error(res.error) }
    },

    onReorderSeed: async (orderedIds) => {
      // Semeia a coluna inteira na ordem visual: chaves sequenciais determinís-
      // ticas (orderBetween é puro — o servidor, recebendo os mesmos vizinhos,
      // chega às MESMAS chaves). Optimistic em bloco + rollback total no erro.
      const prevById = new Map<string, string | null>()
      for (const id of orderedIds) {
        const t = tasks.find((x) => x.id === id)
        prevById.set(id, t?.orderIndex ?? null)
      }
      const keys: string[] = []
      let prevKey: string | null = null
      for (let i = 0; i < orderedIds.length; i++) {
        const k: string = orderBetween(prevKey, null)
        keys.push(k)
        prevKey = k
      }
      orderedIds.forEach((id, i) => patchTask(id, { orderIndex: keys[i] }))
      try {
        for (let i = 0; i < orderedIds.length; i++) {
          const res = await reorderTask(orderedIds[i], i === 0 ? null : keys[i - 1], null)
          if ('error' in res) throw new Error(res.error)
        }
      } catch (e) {
        orderedIds.forEach((id) => patchTask(id, { orderIndex: prevById.get(id) ?? null }))
        throw e instanceof Error ? e : new Error('Não foi possível reordenar a coluna.')
      }
    },

    onQuickCreate: async (title) => {
      const tempId = `temp-${Date.now()}`
      const optimistic: OperacionalTask = {
        id: tempId, title, status: 'A_FAZER', priority: 'MEDIA', type: 'SIMPLES',
        dueDate: null, requestedAt: new Date(), createdAt: new Date(), completedAt: null,
        clientId: null, clientName: null, clientSlug: null, clientHealth: null,
        assigneeId: currentUser.id, assigneeName: currentUser.name,
        assignees: [{ id: currentUser.id, name: currentUser.name }],
        areaName: null, areaCode: null, popCode: null, slaHours: null, slaBreached: false,
        tags: [], orderIndex: null, checklistDone: 0, checklistTotal: 0, commentCount: 0,
      }
      setTasks((prev) => [optimistic, ...prev])
      const res = await createOperacionalTask({ title })
      if ('error' in res) {
        setTasks((prev) => prev.filter((t) => t.id !== tempId))
        toast(res.error, 'err')
        throw new Error(res.error)
      }
      const realId = res.id
      if (realId) patchTask(tempId, { id: realId })
    },
  }

  // Grupos das views legadas Por Cliente / Por Gestor
  const legacyGroups = useMemo(() => {
    if (view !== 'responsavel' && view !== 'cliente' && view !== 'area') return []
    const keyFn = view === 'responsavel'
      ? (t: OperacionalTask) => t.assigneeName
      : view === 'area'
        ? (t: OperacionalTask) => t.areaName ?? 'Sem área'
        : (t: OperacionalTask) => t.clientName ?? 'Interno'
    const map = new Map<string, OperacionalTask[]>()
    for (const t of filtered) {
      const k = keyFn(t)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(t)
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, items]) => ({ key, label: key, items }))
  }, [filtered, view])

  return (
    <div className="space-y-4">
      {/* Barra de visão + criar */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented view={view} setView={setView} />
        {view === 'kanban' && (
          <div className="inline-flex items-center gap-1 rounded-lg border border-[#38435C] bg-[#0A1E2C] p-0.5" role="group" aria-label="Agrupar Kanban">
            {([
              { key: 'status', label: 'Por status' },
              { key: 'grupo', label: 'Por grupo' },
            ] as { key: KanbanGrouping; label: string }[]).map((g) => {
              const on = kanbanGrouping === g.key
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setKanbanGrouping(g.key)}
                  className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${on ? 'bg-[#95BBE2]/20 text-[#95BBE2] font-semibold' : 'text-[#a3b2c2] hover:text-[#EBEBEB]'}`}
                >
                  {g.label}
                </button>
              )
            })}
          </div>
        )}
        <div className="flex-1" />
        {canEdit && (
          <button onClick={() => setNovaOpen(true)} className="flex items-center gap-1.5 text-xs bg-[#95BBE2]/10 text-[#95BBE2] border border-[#95BBE2]/20 rounded-lg px-3 py-1.5 hover:bg-[#95BBE2]/20">
            <Plus size={13} /> Nova tarefa
          </button>
        )}
      </div>

      {/* Barra de filtros única (compartilhada por todas as views) */}
      <TaskFiltersBar
        filters={filters}
        onChange={setFilters}
        users={usersOpts}
        clientes={clientesOpts}
        areas={areasOpts}
      />

      {/* A-110: contagem "visíveis com o filtro atual" vs. total do board. */}
      {hydrated && activeFilterCount > 0 && (
        <p className="text-[11.5px] text-[#87919E] -mt-1">
          Mostrando <span className="font-semibold text-[#EBEBEB]">{filtered.length}</span> de {tasks.length} tarefas
          {' '}(filtro ativo — os indicadores acima contam a carteira inteira)
        </p>
      )}

      {/* Conteúdo — Lista/Kanban sempre renderizam (grupos/colunas vazios ainda
          oferecem a criação rápida); as views legadas mostram o estado vazio. */}
      {view === 'lista' ? (
        <TasksListView tasks={filtered} handlers={handlers} />
      ) : view === 'kanban' ? (
        <TasksKanbanView tasks={filtered} handlers={handlers} grouping={kanbanGrouping} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-[#87919E]">Nenhuma tarefa com esses filtros.</div>
      ) : view === 'calendario' ? (
        <CalendarView tasks={filtered} onSelect={setSelected} />
      ) : (
        <div className="space-y-5">
          {legacyGroups.map((g) => {
            const isCol = collapsed[g.key]
            return (
              <div key={g.key}>
                <button onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))} className="flex items-center gap-2 mb-2 group">
                  {isCol ? <ChevronRight size={13} className="text-[#647488]" /> : <ChevronDown size={13} className="text-[#647488]" />}
                  <span className="text-[12.5px] font-bold text-[#EBEBEB]">{g.label}</span>
                  <span className="text-[11px] font-mono text-[#647488] bg-white/[0.05] px-2 py-0.5 rounded-full">{g.items.length}</span>
                </button>
                {!isCol && <TaskTable items={g.items} onSelect={setSelected} />}
              </div>
            )
          })}
        </div>
      )}

      {selected && <TaskDrawer task={selected} canEdit={canEdit} canEditStatusOnly={canEditStatusOnly} currentUser={currentUser} onClose={() => setSelected(null)} />}
      {novaOpen && <NovaTarefaModal ctx={ctx} onClose={() => setNovaOpen(false)} />}
    </div>
  )
}
