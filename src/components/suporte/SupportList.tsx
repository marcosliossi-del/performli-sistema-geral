'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { TaskStatus, TaskPriority, SupportCategory } from '@prisma/client'
import { updateTaskStatus } from '@/app/actions/tasks'
import { timeAgo } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { ChevronDown, ChevronRight, Repeat, Flag } from 'lucide-react'

// Linha serializável entregue pelo server component (page.tsx).
export type SupportRow = {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  category: SupportCategory | null
  clientName: string | null
  clientSlug: string | null
  assigneeName: string | null
  requestedAt: string | null // ISO — data do pedido
  dueDate: string | null // ISO — vencimento
  isRecurring: boolean // origin === 'RECORRENCIA'
}

// Grupos por status, na ordem operacional do atendimento.
const GROUPS: { key: TaskStatus; label: string; color: string }[] = [
  { key: 'A_FAZER',             label: 'Para fazer',            color: '#87919E' },
  { key: 'EM_ANDAMENTO',        label: 'Em andamento',          color: '#95BBE2' },
  { key: 'EM_VALIDACAO',        label: 'Validação interna',     color: '#A78BFA' },
  { key: 'AGUARDANDO_CLIENTE',  label: 'Aguardando cliente',    color: '#F59E0B' },
  { key: 'AJUSTES_SOLICITADOS', label: 'Em alteração & ajuste', color: '#F97316' },
  { key: 'CONCLUIDO',           label: 'Concluído',             color: '#22C55E' },
]

// Estágios oferecidos no select inline (mesma ordem dos grupos).
const STAGE_OPTIONS = GROUPS.map((g) => ({ value: g.key, label: g.label }))

const CATEGORY_META: Record<SupportCategory, { label: string; color: string }> = {
  TRAFEGO:            { label: 'Tráfego',            color: '#3B82F6' },
  DEMANDA_DA_AGENCIA: { label: 'Demanda da Agência', color: '#F59E0B' },
  SUCESSO_DO_CLIENTE: { label: 'Sucesso do Cliente', color: '#A98CFF' },
}

const PRIORITY_META: Record<TaskPriority, { label: string; color: string; flag: boolean }> = {
  CRITICA: { label: 'Urgente', color: '#EF4444', flag: true },
  ALTA:    { label: 'Alta',    color: '#F59E0B', flag: false },
  MEDIA:   { label: 'Normal',  color: '#95BBE2', flag: false },
  BAIXA:   { label: 'Baixa',   color: '#87919E', flag: false },
}

const PRIORITY_RANK: Record<TaskPriority, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 }

const DAY_MS = 86_400_000

function startOfDay(d: Date): number {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.getTime()
}

// Formata a data do pedido: relativo se < 7 dias, senão dd/mm/aa.
function formatRequested(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const days = (Date.now() - d.getTime()) / DAY_MS
  if (days < 7) return timeAgo(d)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

type DueInfo = { label: string; color: string; overdue: boolean }

function dueInfo(iso: string | null): DueInfo | null {
  if (!iso) return null
  const d = new Date(iso)
  const today = startOfDay(new Date())
  const due = startOfDay(d)
  const diffDays = Math.round((due - today) / DAY_MS)
  if (diffDays === 0) return { label: 'Hoje', color: '#F59E0B', overdue: false }
  if (diffDays < 0) {
    const n = Math.abs(diffDays)
    return { label: `há ${n} dia${n !== 1 ? 's' : ''}`, color: '#EF4444', overdue: true }
  }
  return {
    label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    color: '#87919E',
    overdue: false,
  }
}

// Ordenação dentro do grupo: dueDate asc (nulls por último), depois prioridade.
function sortRows(rows: SupportRow[]): SupportRow[] {
  return [...rows].sort((a, b) => {
    const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
    const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
    if (da !== db) return da - db
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  })
}

interface Props {
  initialRows: SupportRow[]
}

export function SupportList({ initialRows }: Props) {
  const [rows, setRows] = useState<SupportRow[]>(initialRows)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ CONCLUIDO: true })

  function toggle(status: TaskStatus) {
    setCollapsed((prev) => ({ ...prev, [status]: !prev[status] }))
  }

  async function moveStage(id: string, next: TaskStatus) {
    const row = rows.find((r) => r.id === id)
    if (!row || row.status === next) return
    const previous = row.status

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: next } : r)))

    const rollback = (m: string) => {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: previous } : r)))
      toast(m, 'err')
    }

    try {
      const res: unknown = await updateTaskStatus(id, next)
      if (
        res &&
        typeof res === 'object' &&
        'error' in res &&
        typeof (res as { error?: unknown }).error === 'string'
      ) {
        rollback((res as { error: string }).error)
      }
    } catch (err) {
      rollback(
        err instanceof Error && err.message
          ? err.message
          : 'Não foi possível mover a demanda. A mudança não foi salva.',
      )
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pb-6">
      {GROUPS.map((group) => {
        const groupRows = sortRows(rows.filter((r) => r.status === group.key))
        const isCollapsed = collapsed[group.key] ?? false
        return (
          <div key={group.key}>
            <button
              onClick={() => toggle(group.key)}
              className="flex items-center gap-2 mb-2 w-full text-left"
            >
              {isCollapsed ? (
                <ChevronRight size={14} className="text-[#87919E]" />
              ) : (
                <ChevronDown size={14} className="text-[#87919E]" />
              )}
              <span
                className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md"
                style={{ backgroundColor: `${group.color}1A`, color: group.color }}
              >
                {group.label}
                <span className="opacity-70">· {groupRows.length}</span>
              </span>
            </button>

            {!isCollapsed && (
              <div className="rounded-xl border border-[#38435C] bg-[#1B2B3A]/40 overflow-hidden">
                {groupRows.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-xs text-[#87919E]">Nada aqui</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left border-collapse">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-[#87919E]/80 border-b border-[#38435C]">
                          <th className="font-medium px-3 py-2">Nome</th>
                          <th className="font-medium px-3 py-2">Cliente</th>
                          <th className="font-medium px-3 py-2">Categoria</th>
                          <th className="font-medium px-3 py-2">Responsável</th>
                          <th className="font-medium px-3 py-2">Pedido</th>
                          <th className="font-medium px-3 py-2">Vencimento</th>
                          <th className="font-medium px-3 py-2">Prioridade</th>
                          <th className="font-medium px-3 py-2">Estágio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupRows.map((row) => (
                          <SupportListRow key={row.id} row={row} onMove={moveStage} />
                        ))}
                      </tbody>
                    </table>
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

function SupportListRow({
  row,
  onMove,
}: {
  row: SupportRow
  onMove: (id: string, next: TaskStatus) => void
}) {
  const cat = row.category ? CATEGORY_META[row.category] : null
  const prio = PRIORITY_META[row.priority]
  const due = dueInfo(row.dueDate)
  const overdue = due?.overdue ?? false

  return (
    <tr
      className={`border-b border-[#38435C]/50 last:border-b-0 hover:bg-[#0A1E2C]/40 transition-colors ${
        overdue ? 'border-l-2 border-l-[#EF4444]' : 'border-l-2 border-l-transparent'
      }`}
    >
      {/* Nome */}
      <td className="px-3 py-2.5 max-w-[280px]">
        <span
          className="text-sm text-[#EBEBEB] line-clamp-1"
          title={row.description ?? undefined}
        >
          {row.title}
        </span>
      </td>

      {/* Cliente */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        {row.clientName ? (
          row.clientSlug ? (
            <Link
              href={`/clients/${row.clientSlug}`}
              className="text-xs text-[#95BBE2] hover:underline"
            >
              {row.clientName}
            </Link>
          ) : (
            <span className="text-xs text-[#87919E]">{row.clientName}</span>
          )
        ) : (
          <span className="text-xs text-[#87919E]/60">—</span>
        )}
      </td>

      {/* Categoria */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        {cat ? (
          <span
            className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${cat.color}1F`, color: cat.color }}
          >
            {cat.label}
          </span>
        ) : (
          <span className="text-xs text-[#87919E]/60">—</span>
        )}
      </td>

      {/* Responsável */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        {row.assigneeName ? (
          <span className="text-xs text-[#EBEBEB]">{row.assigneeName}</span>
        ) : (
          <span className="text-xs text-[#87919E]/60">sem responsável</span>
        )}
      </td>

      {/* Data do Pedido */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className="text-xs text-[#87919E]">{formatRequested(row.requestedAt)}</span>
      </td>

      {/* Vencimento */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        {due ? (
          <span
            className="inline-flex items-center gap-1 text-xs font-medium"
            style={{ color: due.color }}
          >
            {row.isRecurring && <Repeat size={11} className="flex-shrink-0" />}
            {due.overdue ? `Vencido ${due.label}` : due.label}
          </span>
        ) : row.isRecurring ? (
          <span className="inline-flex items-center gap-1 text-xs text-[#87919E]">
            <Repeat size={11} className="flex-shrink-0" />
            —
          </span>
        ) : (
          <span className="text-xs text-[#87919E]/60">—</span>
        )}
      </td>

      {/* Prioridade */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span
          className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${prio.color}1F`, color: prio.color }}
        >
          {prio.flag && <Flag size={10} className="flex-shrink-0" />}
          {prio.label}
        </span>
      </td>

      {/* Estágio (select inline) */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <select
          value={row.status}
          onChange={(e) => onMove(row.id, e.target.value as TaskStatus)}
          className="bg-[#0A1E2C] border border-[#38435C] rounded-lg px-2 py-1 text-xs text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50 cursor-pointer"
        >
          {STAGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </td>
    </tr>
  )
}
