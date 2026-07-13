'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronDown, Search, X, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover } from '@/components/tasks/Popover'
import {
  STATUS_CHOICES, statusLabel, countActiveFilters,
  type TaskFilters, type DueFilter,
} from './taskBoard'
import { PRIORITY_LABELS, PRIORITY_OPTIONS, AREA_LABELS, label } from './labels'

type Opt = { value: string; label: string }

const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: 'atrasadas', label: 'Atrasadas' },
  { value: 'hoje', label: 'Hoje' },
  { value: 'proximos7', label: 'Próximos 7 dias' },
  { value: 'semdata', label: 'Sem prazo' },
]

/** Popover de seleção múltipla (status / responsável / prioridade). */
function MultiSelect({
  label: btnLabel,
  options,
  selected,
  onChange,
}: {
  label: string
  options: Opt[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const set = useMemo(() => new Set(selected), [selected])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
  }, [options, query])

  function toggle(v: string) {
    onChange(set.has(v) ? selected.filter((x) => x !== v) : [...selected, v])
  }

  const active = selected.length > 0
  return (
    <Popover
      label={`Filtrar por ${btnLabel}`}
      panelClassName="w-60"
      trigger={({ toggle: t }) => (
        <button
          type="button"
          onClick={t}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
            active
              ? 'border-[#95BBE2]/40 bg-[#95BBE2]/15 text-[#95BBE2]'
              : 'border-[#38435C] bg-[#0A1E2C] text-[#a3b2c2] hover:text-[#EBEBEB]',
          )}
        >
          {btnLabel}
          {active && (
            <span className="rounded-full bg-[#95BBE2]/25 px-1.5 text-[10px] font-semibold tabular-nums">
              {selected.length}
            </span>
          )}
          <ChevronDown size={12} className="opacity-70" aria-hidden />
        </button>
      )}
    >
      {() => (
        <div>
          {options.length > 8 && (
            <div className="mb-1 flex items-center gap-2 rounded-lg bg-surface px-2 py-1.5">
              <Search size={13} className="text-text-low" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar…"
                className="w-full bg-transparent text-xs text-text-hi outline-none placeholder:text-text-low"
              />
            </div>
          )}
          <ul className="max-h-64 overflow-auto">
            {filtered.map((o) => {
              const on = set.has(o.value)
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() => toggle(o.value)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-text-hi hover:bg-surface-raised"
                  >
                    <span
                      className={cn(
                        'grid h-3.5 w-3.5 shrink-0 place-items-center rounded border',
                        on ? 'border-[var(--ak-brand)] bg-[var(--ak-brand)]' : 'border-[var(--ak-hair)]',
                      )}
                    >
                      {on && <Check size={11} strokeWidth={3} className="text-[var(--ak-s0)]" aria-hidden />}
                    </span>
                    <span className="flex-1 truncate">{o.label}</span>
                  </button>
                </li>
              )
            })}
            {filtered.length === 0 && (
              <li className="px-2 py-2 text-xs text-text-low">Nada encontrado.</li>
            )}
          </ul>
          {active && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-[11px] text-text-low hover:bg-surface-raised"
            >
              Limpar seleção
            </button>
          )}
        </div>
      )}
    </Popover>
  )
}

export function TaskFiltersBar({
  filters,
  onChange,
  users,
  clientes,
  areas,
}: {
  filters: TaskFilters
  onChange: (next: TaskFilters) => void
  users: { id: string; name: string }[]
  clientes: { id: string; name: string }[]
  /** Categorias (Áreas) disponíveis — code = AreaCode, name = rótulo pt-BR. */
  areas: { code: string; name: string }[]
}) {
  const statusOpts: Opt[] = STATUS_CHOICES.map((s) => ({ value: s, label: statusLabel(s) }))
  const userOpts: Opt[] = users.map((u) => ({ value: u.id, label: u.name }))
  const prioOpts: Opt[] = PRIORITY_OPTIONS.map((p) => ({ value: p, label: label(PRIORITY_LABELS, p) }))
  const areaOpts: Opt[] = areas.map((a) => ({ value: a.code, label: a.name || label(AREA_LABELS, a.code) }))
  const activeCount = countActiveFilters(filters)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#647488]">
        <Filter size={12} aria-hidden /> Filtros
      </span>

      <div className="flex items-center gap-2 rounded-lg border border-[#38435C] bg-[#0A1E2C] px-2.5 py-1.5">
        <Search size={13} className="text-[#647488]" aria-hidden />
        <input
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Buscar tarefa ou cliente…"
          className="w-44 bg-transparent text-xs text-[#EBEBEB] outline-none placeholder:text-[#647488]"
        />
      </div>

      <MultiSelect label="Status" options={statusOpts} selected={filters.status} onChange={(v) => onChange({ ...filters, status: v })} />
      <MultiSelect label="Responsável" options={userOpts} selected={filters.assignee} onChange={(v) => onChange({ ...filters, assignee: v })} />
      <MultiSelect label="Prioridade" options={prioOpts} selected={filters.priority} onChange={(v) => onChange({ ...filters, priority: v })} />
      {areaOpts.length > 0 && (
        <MultiSelect label="Categoria" options={areaOpts} selected={filters.area} onChange={(v) => onChange({ ...filters, area: v })} />
      )}

      <select
        value={filters.clientId}
        onChange={(e) => onChange({ ...filters, clientId: e.target.value })}
        className={cn(
          'rounded-lg border px-2 py-1.5 text-xs',
          filters.clientId
            ? 'border-[#95BBE2]/40 bg-[#95BBE2]/15 text-[#95BBE2]'
            : 'border-[#38435C] bg-[#0A1E2C] text-[#a3b2c2]',
        )}
      >
        <option value="">Cliente: todos</option>
        <option value="__interno__">Interno (sem cliente)</option>
        {clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      {/* Vencimento — pílulas exclusivas */}
      <div className="inline-flex items-center gap-1 rounded-lg border border-[#38435C] bg-[#0A1E2C] p-0.5">
        {DUE_OPTIONS.map((d) => {
          const on = filters.due === d.value
          return (
            <button
              key={d.value}
              type="button"
              onClick={() => onChange({ ...filters, due: on ? null : d.value })}
              className={cn(
                'rounded-md px-2 py-1 text-[11px] transition-colors',
                on ? 'bg-[#95BBE2]/20 text-[#95BBE2] font-semibold' : 'text-[#a3b2c2] hover:text-[#EBEBEB]',
              )}
            >
              {d.label}
            </button>
          )
        })}
      </div>

      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => onChange({ status: [], assignee: [], priority: [], area: [], clientId: '', due: null, search: '' })}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-[#647488] hover:text-[#EBEBEB]"
        >
          <X size={12} aria-hidden /> Limpar ({activeCount})
        </button>
      )}
    </div>
  )
}
