'use client'

import { useState, useTransition, useCallback } from 'react'
import { upsertMonthlyGoals, type GoalUpsert } from '@/app/actions/goals'
import { MetricType } from '@prisma/client'
import { Check, Loader2, AlertCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

type ClientGoals = {
  id: string
  name: string
  slug: string
  managerName: string
  goals: {
    FATURAMENTO: number | null
    ROAS: number | null
    INVESTMENT: number | null
  }
}

type RowState = {
  faturamento: string
  roas: string
  investment: string
  saved: boolean
  error: string | null
}

function monthBounds(year: number, month: number) {
  const start = new Date(year, month, 1)
  const end   = new Date(year, month + 1, 0)
  const fmt   = (d: Date) => d.toISOString().split('T')[0]
  return { startDate: fmt(start), endDate: fmt(end) }
}

function monthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export function MetasBulkTable({
  clients,
  initialYear,
  initialMonth,
}: {
  clients: ClientGoals[]
  initialYear: number
  initialMonth: number
}) {
  const [year, setYear]   = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [isPending, startTransition] = useTransition()

  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      clients.map((c) => [
        c.id,
        {
          faturamento: c.goals.FATURAMENTO != null ? String(c.goals.FATURAMENTO) : '',
          roas:        c.goals.ROAS        != null ? String(c.goals.ROAS)        : '',
          investment:  c.goals.INVESTMENT  != null ? String(c.goals.INVESTMENT)  : '',
          saved: false,
          error: null,
        },
      ])
    )
  )

  const setField = useCallback(
    (clientId: string, field: 'faturamento' | 'roas' | 'investment', value: string) => {
      setRows((prev) => ({
        ...prev,
        [clientId]: { ...prev[clientId], [field]: value, saved: false, error: null },
      }))
    },
    []
  )

  function buildGoals(clientId: string, row: RowState): GoalUpsert[] {
    const { startDate, endDate } = monthBounds(year, month)
    const result: GoalUpsert[] = []

    const fat = parseFloat(row.faturamento)
    if (!isNaN(fat) && fat >= 0) {
      result.push({ clientId, metric: 'FATURAMENTO' as MetricType, value: fat, startDate, endDate })
    }
    const roas = parseFloat(row.roas)
    if (!isNaN(roas) && roas >= 0) {
      result.push({ clientId, metric: 'ROAS' as MetricType, value: roas, startDate, endDate })
    }
    const inv = parseFloat(row.investment)
    if (!isNaN(inv) && inv >= 0) {
      result.push({ clientId, metric: 'INVESTMENT' as MetricType, value: inv, startDate, endDate })
    }
    return result
  }

  function saveRow(clientId: string) {
    const row = rows[clientId]
    const goals = buildGoals(clientId, row)
    if (goals.length === 0) return

    startTransition(async () => {
      const res = await upsertMonthlyGoals(goals)
      setRows((prev) => ({
        ...prev,
        [clientId]: {
          ...prev[clientId],
          saved: res.ok,
          error: res.error ?? null,
        },
      }))
    })
  }

  function saveAll() {
    const allGoals: GoalUpsert[] = []
    for (const [clientId, row] of Object.entries(rows)) {
      allGoals.push(...buildGoals(clientId, row))
    }
    if (allGoals.length === 0) return

    startTransition(async () => {
      const res = await upsertMonthlyGoals(allGoals)
      if (res.ok) {
        setRows((prev) =>
          Object.fromEntries(
            Object.entries(prev).map(([id, row]) => [id, { ...row, saved: true, error: null }])
          )
        )
      }
    })
  }

  // Month navigation
  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setRows((prev) =>
      Object.fromEntries(Object.entries(prev).map(([id, r]) => [id, { ...r, saved: false }]))
    )
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setRows((prev) =>
      Object.fromEntries(Object.entries(prev).map(([id, r]) => [id, { ...r, saved: false }]))
    )
  }

  const totalFat = clients.reduce((s, c) => {
    const v = parseFloat(rows[c.id]?.faturamento ?? '')
    return isNaN(v) ? s : s + v
  }, 0)

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="w-8 h-8 rounded-lg border border-[#38435C] text-[#87919E] hover:text-[#EBEBEB] hover:bg-[#38435C]/50 transition-colors flex items-center justify-center text-sm"
          >
            ‹
          </button>
          <span className="text-sm font-semibold text-[#EBEBEB] capitalize min-w-[160px] text-center">
            {monthLabel(year, month)}
          </span>
          <button
            onClick={nextMonth}
            className="w-8 h-8 rounded-lg border border-[#38435C] text-[#87919E] hover:text-[#EBEBEB] hover:bg-[#38435C]/50 transition-colors flex items-center justify-center text-sm"
          >
            ›
          </button>
        </div>

        <div className="flex items-center gap-3">
          {totalFat > 0 && (
            <span className="text-xs text-[#87919E]">
              Total faturamento: <span className="text-[#EBEBEB] font-semibold">{formatCurrency(totalFat)}</span>
            </span>
          )}
          <button
            onClick={saveAll}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#95BBE2] text-[#05141C] text-xs font-semibold hover:bg-[#95BBE2]/90 disabled:opacity-50 transition-colors"
          >
            {isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Salvar todos
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#38435C] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#38435C] bg-[#0A1E2C]">
              <th className="text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider px-4 py-3 w-[220px]">
                Cliente
              </th>
              <th className="text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider px-3 py-3 w-[120px]">
                Gestor
              </th>
              <th className="text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider px-3 py-3">
                Faturamento Meta (R$)
              </th>
              <th className="text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider px-3 py-3">
                ROAS Meta
              </th>
              <th className="text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider px-3 py-3">
                Budget Mensal (R$)
              </th>
              <th className="px-3 py-3 w-[90px]" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#38435C]">
            {clients.map((client) => {
              const row = rows[client.id]
              return (
                <tr key={client.id} className="hover:bg-[#38435C]/20 transition-colors group">
                  <td className="px-4 py-3">
                    <a
                      href={`/clients/${client.slug}`}
                      className="text-[#95BBE2] hover:underline font-medium text-xs"
                    >
                      {client.name}
                    </a>
                  </td>
                  <td className="px-3 py-3 text-xs text-[#87919E]">{client.managerName}</td>

                  {/* Faturamento */}
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min="0"
                      step="100"
                      placeholder="ex: 80000"
                      value={row.faturamento}
                      onChange={(e) => setField(client.id, 'faturamento', e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveRow(client.id)}
                      className="w-full bg-[#0A1E2C] border border-[#38435C] focus:border-[#95BBE2]/50 rounded-lg px-3 py-1.5 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/40 focus:outline-none transition-colors"
                    />
                  </td>

                  {/* ROAS */}
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="ex: 4.0"
                      value={row.roas}
                      onChange={(e) => setField(client.id, 'roas', e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveRow(client.id)}
                      className="w-full bg-[#0A1E2C] border border-[#38435C] focus:border-[#95BBE2]/50 rounded-lg px-3 py-1.5 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/40 focus:outline-none transition-colors"
                    />
                  </td>

                  {/* Budget/Investment */}
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min="0"
                      step="100"
                      placeholder="ex: 10000"
                      value={row.investment}
                      onChange={(e) => setField(client.id, 'investment', e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveRow(client.id)}
                      className="w-full bg-[#0A1E2C] border border-[#38435C] focus:border-[#95BBE2]/50 rounded-lg px-3 py-1.5 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/40 focus:outline-none transition-colors"
                    />
                  </td>

                  {/* Save row / status */}
                  <td className="px-3 py-3">
                    {row.error ? (
                      <span title={row.error}>
                        <AlertCircle size={14} className="text-[#EF4444]" />
                      </span>
                    ) : row.saved ? (
                      <Check size={14} className="text-[#22C55E]" />
                    ) : (
                      <button
                        onClick={() => saveRow(client.id)}
                        disabled={isPending}
                        className="text-[10px] text-[#87919E] hover:text-[#95BBE2] border border-[#38435C] hover:border-[#95BBE2]/30 rounded px-2 py-1 transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                      >
                        Salvar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-[#87919E]/60">
        Pressione Enter em qualquer campo para salvar a linha. As metas são criadas ou atualizadas para {monthLabel(year, month)}.
      </p>
    </div>
  )
}
