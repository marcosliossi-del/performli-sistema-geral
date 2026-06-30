'use client'

import { useMemo, useState } from 'react'
import { Plus, AlertTriangle, Clock } from 'lucide-react'
import type { OperacionalTask, NovaTarefaContext } from '@/lib/dal'
import { TaskDrawer } from './TaskDrawer'
import { NovaTarefaModal } from './NovaTarefaModal'
import {
  STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS, KANBAN_ORDER, label,
} from './labels'

type View = 'lista' | 'kanban' | 'responsavel' | 'cliente'

const VIEWS: { key: View; label: string }[] = [
  { key: 'lista', label: 'Lista' },
  { key: 'kanban', label: 'Kanban' },
  { key: 'responsavel', label: 'Por responsável' },
  { key: 'cliente', label: 'Por cliente' },
]

function isOverdue(t: OperacionalTask): boolean {
  return t.status !== 'CONCLUIDO' && t.status !== 'CANCELADO' && t.dueDate != null && new Date(t.dueDate).getTime() < Date.now()
}

function TaskRow({ t, onClick }: { t: OperacionalTask; onClick: () => void }) {
  const overdue = isOverdue(t)
  return (
    <button onClick={onClick} className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0A1E2C]/40 border border-[#38435C]/50 hover:border-[#95BBE2]/40 transition-colors">
      <span className={`text-[9px] rounded px-1.5 py-0.5 border whitespace-nowrap ${label(STATUS_COLORS, t.status)}`}>{label(STATUS_LABELS, t.status)}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-[#EBEBEB] truncate">{t.title}</p>
        <p className="text-[10px] text-[#87919E] truncate">
          {t.clientName ?? 'Interno'} · {t.assigneeName}{t.popCode ? ` · ${t.popCode}` : ''}
        </p>
      </div>
      <span className={`text-[10px] ${label(PRIORITY_COLORS, t.priority)}`}>{label(PRIORITY_LABELS, t.priority)}</span>
      {t.dueDate && (
        <span className={`text-[10px] flex items-center gap-0.5 ${overdue ? 'text-[#EF4444]' : 'text-[#87919E]'}`}>
          {overdue ? <AlertTriangle size={10} /> : <Clock size={10} />}
          {new Date(t.dueDate).toLocaleDateString('pt-BR')}
        </span>
      )}
    </button>
  )
}

export function OperacionalBoard({
  tasks, ctx, canEdit,
}: {
  tasks: OperacionalTask[]
  ctx: NovaTarefaContext
  canEdit: boolean
}) {
  const [view, setView] = useState<View>('lista')
  const [statusF, setStatusF] = useState('')
  const [priorityF, setPriorityF] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<OperacionalTask | null>(null)
  const [novaOpen, setNovaOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks.filter((t) => {
      if (statusF && t.status !== statusF) return false
      if (priorityF && t.priority !== priorityF) return false
      if (overdueOnly && !isOverdue(t)) return false
      if (q && !(t.title.toLowerCase().includes(q) || (t.clientName ?? '').toLowerCase().includes(q))) return false
      return true
    })
  }, [tasks, statusF, priorityF, overdueOnly, search])

  const groups = useMemo(() => {
    if (view === 'kanban') {
      return KANBAN_ORDER
        .map((s) => ({ key: s, label: label(STATUS_LABELS, s), items: filtered.filter((t) => t.status === s) }))
        .filter((g) => g.items.length > 0)
    }
    if (view === 'responsavel' || view === 'cliente') {
      const keyFn = view === 'responsavel' ? (t: OperacionalTask) => t.assigneeName : (t: OperacionalTask) => t.clientName ?? 'Interno'
      const map = new Map<string, OperacionalTask[]>()
      for (const t of filtered) {
        const k = keyFn(t)
        if (!map.has(k)) map.set(k, [])
        map.get(k)!.push(t)
      }
      return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([key, items]) => ({ key, label: key, items }))
    }
    // lista: não-concluídas primeiro
    const abertas = filtered.filter((t) => t.status !== 'CONCLUIDO' && t.status !== 'CANCELADO')
    const fechadas = filtered.filter((t) => t.status === 'CONCLUIDO' || t.status === 'CANCELADO')
    return [
      { key: 'abertas', label: `Abertas (${abertas.length})`, items: abertas },
      { key: 'fechadas', label: `Concluídas/canceladas (${fechadas.length})`, items: fechadas },
    ].filter((g) => g.items.length > 0)
  }, [filtered, view])

  return (
    <div className="space-y-4">
      {/* Barra de ações */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-[#0A1E2C]/40 border border-[#38435C]/50 rounded-lg p-0.5">
          {VIEWS.map((v) => (
            <button key={v.key} onClick={() => setView(v.key)}
              className={`text-[11px] px-2.5 py-1 rounded ${view === v.key ? 'bg-[#95BBE2]/15 text-[#95BBE2]' : 'text-[#87919E] hover:text-[#EBEBEB]'}`}>
              {v.label}
            </button>
          ))}
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…"
          className="bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-1.5 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/50 focus:outline-none focus:border-[#95BBE2]/50" />
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="bg-[#0A1E2C] border border-[#38435C] rounded-lg px-2 py-1.5 text-xs text-[#EBEBEB]">
          <option value="">Status: todos</option>
          {KANBAN_ORDER.map((s) => <option key={s} value={s}>{label(STATUS_LABELS, s)}</option>)}
        </select>
        <select value={priorityF} onChange={(e) => setPriorityF(e.target.value)} className="bg-[#0A1E2C] border border-[#38435C] rounded-lg px-2 py-1.5 text-xs text-[#EBEBEB]">
          <option value="">Prioridade: todas</option>
          {['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'].map((p) => <option key={p} value={p}>{label(PRIORITY_LABELS, p)}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-[#87919E] cursor-pointer">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} /> Só atrasadas
        </label>
        <div className="flex-1" />
        {canEdit && (
          <button onClick={() => setNovaOpen(true)} className="flex items-center gap-1.5 text-xs bg-[#95BBE2]/10 text-[#95BBE2] border border-[#95BBE2]/20 rounded-lg px-3 py-1.5 hover:bg-[#95BBE2]/20">
            <Plus size={13} /> Nova tarefa
          </button>
        )}
      </div>

      {/* Conteúdo */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-[#87919E]">Nenhuma tarefa com esses filtros.</div>
      ) : view === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {groups.map((g) => (
            <div key={g.key} className="min-w-[260px] w-[260px] flex-shrink-0">
              <p className="text-[11px] font-semibold text-[#87919E] uppercase tracking-wider mb-2">{g.label} · {g.items.length}</p>
              <div className="space-y-1.5">
                {g.items.map((t) => <TaskRow key={t.id} t={t} onClick={() => setSelected(t)} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.key}>
              <p className="text-[11px] font-semibold text-[#87919E] uppercase tracking-wider mb-2">{g.label}</p>
              <div className="space-y-1.5">
                {g.items.map((t) => <TaskRow key={t.id} t={t} onClick={() => setSelected(t)} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && <TaskDrawer task={selected} canEdit={canEdit} onClose={() => setSelected(null)} />}
      {novaOpen && <NovaTarefaModal ctx={ctx} onClose={() => setNovaOpen(false)} />}
    </div>
  )
}
