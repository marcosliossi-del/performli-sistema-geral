'use client'

import { useMemo, useState } from 'react'
import { Plus, ChevronDown, ChevronRight } from 'lucide-react'
import type { OperacionalTask, NovaTarefaContext } from '@/lib/dal'
import { TaskDrawer } from './TaskDrawer'
import { NovaTarefaModal } from './NovaTarefaModal'
import {
  STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, KANBAN_ORDER, label,
} from './labels'

type View = 'lista' | 'kanban' | 'responsavel' | 'cliente'

const VIEWS: { key: View; label: string }[] = [
  { key: 'lista', label: 'Lista' },
  { key: 'kanban', label: 'Kanban' },
  { key: 'responsavel', label: 'Por gestor' },
  { key: 'cliente', label: 'Por cliente' },
]

const CRITICAL_STATUS = new Set(['BLOQUEADO', 'ATRASADO'])

function isOverdue(t: OperacionalTask): boolean {
  return t.status !== 'CONCLUIDO' && t.status !== 'CANCELADO' && t.dueDate != null && new Date(t.dueDate).getTime() < Date.now()
}
function isCritical(t: OperacionalTask): boolean {
  return t.type === 'WAR_ROOM' || t.priority === 'CRITICA' || CRITICAL_STATUS.has(t.status)
}

// ── helpers de apresentação ────────────────────────────────────────────────────
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
  const c = h === 'OTIMO' ? 'bg-[#34c97a]' : h === 'REGULAR' ? 'bg-[#e3ad45]' : h === 'RUIM' ? 'bg-[#ff3b4e]' : 'bg-[#647488]'
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

// ── Linha da tabela (view lista/gestor/cliente) ────────────────────────────────
function TaskTableRow({ t, onClick }: { t: OperacionalTask; onClick: () => void }) {
  const overdue = isOverdue(t)
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
            <th className="text-left font-semibold px-3.5 py-2.5 border-b border-white/[0.05]">Resp.</th>
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

// ── Card do kanban ─────────────────────────────────────────────────────────────
function KanbanCard({ t, onClick }: { t: OperacionalTask; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`ak-lift w-full text-left bg-[#161d26] border rounded-xl p-3 ${isCritical(t) ? 'border-[#ff3b4e]/35' : 'border-white/[0.08]'}`}>
      <StatusBadge s={t.status} />
      <p className="text-[12.5px] font-medium text-[#EBEBEB] leading-snug mt-2 mb-2.5">{t.title}</p>
      <div className="flex items-center gap-2 text-[11px] text-[#647488]">
        {t.clientName && <span className="inline-flex items-center gap-1.5"><HealthDot h={t.clientHealth} />{t.clientName}</span>}
      </div>
      <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-white/[0.05]">
        <span className="text-[11px]"><PriorityFlag p={t.priority} /></span>
        <Avatar name={t.assigneeName} />
      </div>
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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

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
    // lista: agrupado por status, na ordem do kanban
    return KANBAN_ORDER
      .map((s) => ({ key: s, label: label(STATUS_LABELS, s), items: filtered.filter((t) => t.status === s) }))
      .filter((g) => g.items.length > 0)
  }, [filtered, view])

  const kanbanCols = useMemo(() =>
    KANBAN_ORDER
      .map((s) => ({ key: s, label: label(STATUS_LABELS, s), items: filtered.filter((t) => t.status === s) }))
      .filter((g) => g.items.length > 0),
  [filtered])

  return (
    <div className="space-y-4">
      {/* Barra de ações */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-0.5 bg-[#0A1E2C]/60 border border-[#38435C]/50 rounded-xl p-1">
          {VIEWS.map((v) => (
            <button key={v.key} onClick={() => setView(v.key)}
              className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all duration-200 ease-out ${view === v.key ? 'bg-gradient-to-b from-[#54e0ee] to-[#22c2d6] text-[#021015] shadow-[0_4px_12px_-4px_rgba(34,194,214,0.5)]' : 'text-[#87919E] hover:text-[#EBEBEB]'}`}>
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
        <div className="flex gap-3.5 overflow-x-auto pb-2">
          {kanbanCols.map((g) => {
            const crit = g.items.some(isCritical) && CRITICAL_STATUS.has(g.key)
            return (
              <div key={g.key} className={`min-w-[272px] w-[272px] flex-shrink-0 bg-[#10151c] border rounded-xl flex flex-col ${crit ? 'border-[#ff3b4e]/35' : 'border-white/[0.08]'}`}>
                <div className={`flex items-center gap-2 px-3.5 py-3 border-b border-white/[0.05] ${crit ? 'bg-[#ff3b4e]/[0.06] rounded-t-xl' : ''}`}>
                  <StatusBadge s={g.key} />
                  <span className="ml-auto text-[11px] font-mono text-[#647488] bg-white/[0.05] px-2 py-0.5 rounded-full">{g.items.length}</span>
                </div>
                <div className="p-2.5 space-y-2.5">
                  {g.items.map((t) => <KanbanCard key={t.id} t={t} onClick={() => setSelected(t)} />)}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => {
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

      {selected && <TaskDrawer task={selected} canEdit={canEdit} onClose={() => setSelected(null)} />}
      {novaOpen && <NovaTarefaModal ctx={ctx} onClose={() => setNovaOpen(false)} />}
    </div>
  )
}
