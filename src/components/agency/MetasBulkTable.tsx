'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { upsertMonthlyGoals, fetchMonthlyGoals, type GoalUpsert } from '@/app/actions/goals'
import { MetricType } from '@prisma/client'
import { Check, Loader2, AlertCircle, Plus } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { GoalFormModal } from '@/components/clients/GoalFormModal'

type ClientGoals = {
  id: string
  name: string
  slug: string
  managerName: string
  goals: {
    FATURAMENTO: number | null
    ROAS: number | null
    SPEND: number | null
  }
}

type RowState = {
  faturamento: string
  roas: string
  spend: string
  saved: boolean
  error: string | null
}

function monthBounds(year: number, month: number) {
  const start = new Date(year, month, 1)
  const end   = new Date(year, month + 1, 0)
  const fmt   = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { startDate: fmt(start), endDate: fmt(end) }
}

function monthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

function initRows(clients: ClientGoals[]): Record<string, RowState> {
  return Object.fromEntries(
    clients.map((c) => [
      c.id,
      {
        faturamento: c.goals.FATURAMENTO != null ? String(c.goals.FATURAMENTO) : '',
        roas:        c.goals.ROAS        != null ? String(c.goals.ROAS)        : '',
        spend:       c.goals.SPEND       != null ? String(c.goals.SPEND)       : '',
        saved: false,
        error: null,
      },
    ])
  )
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
  const [isLoading, setIsLoading]    = useState(false)

  const [rows, setRows] = useState<Record<string, RowState>>(() => initRows(clients))

  const clientIds = clients.map((c) => c.id)

  // Re-fetch goals whenever month/year changes
  useEffect(() => {
    setIsLoading(true)
    fetchMonthlyGoals(clientIds, year, month).then((data) => {
      setRows(
        Object.fromEntries(
          clients.map((c) => {
            const g = data[c.id] ?? { FATURAMENTO: null, ROAS: null, SPEND: null }
            return [
              c.id,
              {
                faturamento: g.FATURAMENTO != null ? String(g.FATURAMENTO) : '',
                roas:        g.ROAS        != null ? String(g.ROAS)        : '',
                spend:       g.SPEND       != null ? String(g.SPEND)       : '',
                saved: false,
                error: null,
              },
            ]
          })
        )
      )
      setIsLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  const setField = useCallback(
    (clientId: string, field: 'faturamento' | 'roas' | 'spend', value: string) => {
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
    const spend = parseFloat(row.spend)
    if (!isNaN(spend) && spend >= 0) {
      result.push({ clientId, metric: 'SPEND' as MetricType, value: spend, startDate, endDate })
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

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
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
          {isLoading && <Loader2 size={13} className="animate-spin text-[#87919E]" />}
        </div>

        <div className="flex items-center gap-3">
          {totalFat > 0 && (
            <span className="text-xs text-[#87919E]">
              Total faturamento: <span className="text-[#EBEBEB] font-semibold">{formatCurrency(totalFat)}</span>
            </span>
          )}
          <button
            onClick={saveAll}
            disabled={isPending || isLoading}
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
              <th className="text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider px-4 py-3 w-[200px]">
                Cliente
              </th>
              <th className="text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider px-3 py-3 w-[110px]">
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
              <th className="px-3 py-3 w-[110px]" />
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
                      value={row?.faturamento ?? ''}
                      onChange={(e) => setField(client.id, 'faturamento', e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveRow(client.id)}
                      disabled={isLoading}
                      className="w-full bg-[#0A1E2C] border border-[#38435C] focus:border-[#95BBE2]/50 rounded-lg px-3 py-1.5 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/40 focus:outline-none transition-colors disabled:opacity-40"
                    />
                  </td>

                  {/* ROAS */}
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="ex: 4.0"
                      value={row?.roas ?? ''}
                      onChange={(e) => setField(client.id, 'roas', e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveRow(client.id)}
                      disabled={isLoading}
                      className="w-full bg-[#0A1E2C] border border-[#38435C] focus:border-[#95BBE2]/50 rounded-lg px-3 py-1.5 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/40 focus:outline-none transition-colors disabled:opacity-40"
                    />
                  </td>

                  {/* Budget / SPEND */}
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min="0"
                      step="100"
                      placeholder="ex: 10000"
                      value={row?.spend ?? ''}
                      onChange={(e) => setField(client.id, 'spend', e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveRow(client.id)}
                      disabled={isLoading}
                      className="w-full bg-[#0A1E2C] border border-[#38435C] focus:border-[#95BBE2]/50 rounded-lg px-3 py-1.5 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/40 focus:outline-none transition-colors disabled:opacity-40"
                    />
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      {row?.error ? (
                        <span title={row.error}>
                          <AlertCircle size={14} className="text-[#EF4444]" />
                        </span>
                      ) : row?.saved ? (
                        <Check size={14} className="text-[#22C55E]" />
                      ) : (
                        <button
                          onClick={() => saveRow(client.id)}
                          disabled={isPending || isLoading}
                          className="text-[10px] text-[#87919E] hover:text-[#95BBE2] border border-[#38435C] hover:border-[#95BBE2]/30 rounded px-2 py-1 transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                        >
                          Salvar
                        </button>
                      )}
                      {/* Extra metrics (local business, etc.) */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <GoalFormModal clientId={client.id} label="" icon={<Plus size={12} />} />
                      </div>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-[#87919E]/60">
        Pressione Enter em qualquer campo para salvar a linha. Use + para adicionar outras metas (negócios locais, conversões, etc.).
      </p>
    </div>
  )
}
