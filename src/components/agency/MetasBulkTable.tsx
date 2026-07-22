'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { upsertMonthlyGoals, fetchMonthlyGoals, type GoalUpsert, type MonthlyGoalsRow } from '@/app/actions/goals'
import { MetricType, BusinessType } from '@prisma/client'
import { Check, Loader2, AlertCircle, Plus, Zap } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { GoalFormModal } from '@/components/clients/GoalFormModal'
import { LOCAL_RESULT_METRICS, costMetricFor, costLabelFor } from '@/lib/metas/metricOptions'

type ClientGoals = {
  id: string
  name: string
  slug: string
  businessType: BusinessType
  managerName: string
  goals: MonthlyGoalsRow
  suggestedCpa: number | null
  prevTicketMedio: number | null
}

type RowState = {
  // E-commerce fields
  faturamento: string
  roas: string
  // Local fields
  mainMetric: MetricType   // métrica-resultado principal escolhida por cliente
  mainValue: string        // valor da meta dessa métrica principal
  cost: string             // custo-alvo (grava CPL se métrica=LEADS, senão CPA)
  // Common
  spend: string
  lastManual: 'faturamento' | 'roas' | 'mainValue' | null
  autoRoas: boolean
  autoFat: boolean
  autoCost: boolean
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

function calcAutoFieldsEcommerce(
  field: 'faturamento' | 'roas' | 'spend',
  value: string,
  row: RowState,
): Partial<RowState> {
  const val = parseFloat(value)

  if (field === 'faturamento') {
    const spend = parseFloat(row.spend)
    if (!isNaN(val) && val > 0 && !isNaN(spend) && spend > 0) {
      return { autoRoas: true, autoFat: false, lastManual: 'faturamento', roas: (val / spend).toFixed(2) }
    }
    return { autoRoas: false, autoFat: false, lastManual: 'faturamento' }
  }

  if (field === 'roas') {
    const spend = parseFloat(row.spend)
    if (!isNaN(val) && val > 0 && !isNaN(spend) && spend > 0) {
      return { autoRoas: false, autoFat: true, lastManual: 'roas', faturamento: Math.round(val * spend).toString() }
    }
    return { autoRoas: false, autoFat: false, lastManual: 'roas' }
  }

  if (field === 'spend') {
    const spend = parseFloat(value)
    if (isNaN(spend) || spend <= 0) return {}
    if (row.lastManual === 'faturamento') {
      const fat = parseFloat(row.faturamento)
      if (!isNaN(fat) && fat > 0) {
        return { autoRoas: true, roas: (fat / spend).toFixed(2) }
      }
    } else if (row.lastManual === 'roas') {
      const roas = parseFloat(row.roas)
      if (!isNaN(roas) && roas > 0) {
        return { autoFat: true, faturamento: Math.round(roas * spend).toString() }
      }
    }
  }

  return {}
}

function calcAutoFieldsLocal(
  field: 'mainValue' | 'spend',
  value: string,
  row: RowState,
): Partial<RowState> {
  const val = parseFloat(value)

  // Custo-alvo = budget ÷ meta da métrica principal (mesma mecânica do antigo CPL).
  if (field === 'mainValue') {
    const spend = parseFloat(row.spend)
    if (!isNaN(val) && val > 0 && !isNaN(spend) && spend > 0) {
      return { autoCost: true, lastManual: 'mainValue', cost: (spend / val).toFixed(2) }
    }
    return { autoCost: false, lastManual: 'mainValue' }
  }

  if (field === 'spend') {
    const main = parseFloat(row.mainValue)
    if (!isNaN(val) && val > 0 && !isNaN(main) && main > 0) {
      return { autoCost: true, cost: (val / main).toFixed(2) }
    }
  }

  return {}
}

function initRow(goals: MonthlyGoalsRow): RowState {
  const fat   = goals.FATURAMENTO != null ? String(goals.FATURAMENTO) : ''
  const roas  = goals.ROAS        != null ? String(goals.ROAS)        : ''
  const spend = goals.SPEND       != null ? String(goals.SPEND)       : ''
  // Default inteligente por cliente: métrica principal = a meta-resultado
  // existente do cliente no mês; sem meta existente → LEADS.
  const mainMetric: MetricType = goals.localMetric ?? 'LEADS'
  const mainValue = goals.localValue != null ? String(goals.localValue) : ''
  // Custo-alvo correspondente: CPL quando a principal é LEADS, senão CPA.
  const costVal = costMetricFor(mainMetric) === 'CPL' ? goals.CPL : goals.CPA
  const cost = costVal != null ? String(costVal) : ''
  return {
    faturamento: fat,
    roas,
    mainMetric,
    mainValue,
    cost,
    spend,
    lastManual: fat ? 'faturamento' : roas ? 'roas' : mainValue ? 'mainValue' : null,
    autoRoas: false,
    autoFat: false,
    autoCost: false,
    saved: false,
    error: null,
  }
}

function initRows(clients: ClientGoals[]): Record<string, RowState> {
  return Object.fromEntries(clients.map((c) => [c.id, initRow(c.goals)]))
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

  useEffect(() => {
    setIsLoading(true)
    fetchMonthlyGoals(clientIds, year, month).then((data) => {
      setRows(
        Object.fromEntries(
          clients.map((c) => {
            const g = data[c.id] ?? { FATURAMENTO: null, ROAS: null, SPEND: null, CPL: null, CPA: null, localMetric: null, localValue: null }
            return [c.id, initRow(g)]
          })
        )
      )
      setIsLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  const setField = useCallback(
    (clientId: string, field: 'faturamento' | 'roas' | 'spend' | 'mainValue' | 'cost', value: string, isLocal: boolean) => {
      setRows((prev) => {
        const row = prev[clientId]
        let auto: Partial<RowState> = {}
        if (isLocal) {
          if (field === 'mainValue' || field === 'spend') {
            auto = calcAutoFieldsLocal(field, value, row)
          }
        } else {
          if (field === 'faturamento' || field === 'roas' || field === 'spend') {
            auto = calcAutoFieldsEcommerce(field, value, row)
          }
        }
        return {
          ...prev,
          [clientId]: { ...row, [field]: value, saved: false, error: null, ...auto },
        }
      })
    },
    []
  )

  // Troca da métrica principal do cliente (seletor por linha). Não recalcula o
  // custo — só muda para qual métrica-resultado o valor/custo será gravado.
  const setMetric = useCallback((clientId: string, metric: MetricType) => {
    setRows((prev) => ({
      ...prev,
      [clientId]: { ...prev[clientId], mainMetric: metric, saved: false, error: null },
    }))
  }, [])

  function buildGoals(clientId: string, row: RowState, isLocal: boolean): GoalUpsert[] {
    const { startDate, endDate } = monthBounds(year, month)
    const result: GoalUpsert[] = []

    const spend = parseFloat(row.spend)
    if (!isNaN(spend) && spend >= 0) {
      result.push({ clientId, metric: 'SPEND' as MetricType, value: spend, startDate, endDate })
    }

    if (isLocal) {
      // Grava a Goal da MÉTRICA PRINCIPAL escolhida por este cliente (não mais
      // LEADS fixo). Ao trocar a métrica, a antiga não é apagada — o dono limpa
      // manualmente se quiser (ver handoff).
      const mainValue = parseFloat(row.mainValue)
      if (!isNaN(mainValue) && mainValue >= 0) {
        result.push({ clientId, metric: row.mainMetric, value: mainValue, startDate, endDate })
      }
      const cost = parseFloat(row.cost)
      if (!isNaN(cost) && cost >= 0) {
        // CPL quando a principal é LEADS, senão CPA.
        result.push({ clientId, metric: costMetricFor(row.mainMetric), value: cost, startDate, endDate })
      }
    } else {
      const fat = parseFloat(row.faturamento)
      if (!isNaN(fat) && fat >= 0) {
        result.push({ clientId, metric: 'FATURAMENTO' as MetricType, value: fat, startDate, endDate })
      }
      const roas = parseFloat(row.roas)
      if (!isNaN(roas) && roas >= 0) {
        result.push({ clientId, metric: 'ROAS' as MetricType, value: roas, startDate, endDate })
      }
    }

    return result
  }

  function saveRow(clientId: string, isLocal: boolean) {
    const row = rows[clientId]
    const goals = buildGoals(clientId, row, isLocal)
    if (goals.length === 0) return

    startTransition(async () => {
      const res = await upsertMonthlyGoals(goals)
      setRows((prev) => ({
        ...prev,
        [clientId]: { ...prev[clientId], saved: res.ok, error: res.error ?? null },
      }))
    })
  }

  function saveAll() {
    const allGoals: GoalUpsert[] = []
    for (const client of clients) {
      const row = rows[client.id]
      allGoals.push(...buildGoals(client.id, row, client.businessType === 'LOCAL' || client.businessType === 'B2B'))
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

  const ecommerceClients = clients.filter(c => c.businessType !== 'LOCAL' && c.businessType !== 'B2B')
  const localClients     = clients.filter(c => c.businessType === 'LOCAL' || c.businessType === 'B2B')

  const totalFatEcommerce = ecommerceClients.reduce((s, c) => {
    const v = parseFloat(rows[c.id]?.faturamento ?? '')
    return isNaN(v) ? s : s + v
  }, 0)

  function RowActions({ client, isLocal }: { client: ClientGoals; isLocal: boolean }) {
    const row = rows[client.id]
    return (
      <div className="flex items-center gap-1.5">
        {row?.error ? (
          <span title={row.error}>
            <AlertCircle size={14} className="text-[#EF4444]" />
          </span>
        ) : row?.saved ? (
          <Check size={14} className="text-[#22C55E]" />
        ) : (
          <button
            onClick={() => saveRow(client.id, isLocal)}
            disabled={isPending || isLoading}
            className="text-[10px] text-[#87919E] hover:text-[#95BBE2] border border-[#38435C] hover:border-[#95BBE2]/30 rounded px-2 py-1 transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
          >
            Salvar
          </button>
        )}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <GoalFormModal clientId={client.id} businessType={client.businessType} label="" icon={<Plus size={12} />} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
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
          {totalFatEcommerce > 0 && (
            <span className="text-xs text-[#87919E]">
              Faturamento e-com: <span className="text-[#EBEBEB] font-semibold">{formatCurrency(totalFatEcommerce)}</span>
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

      {/* ── E-commerce ─────────────────────────────────────────────────────── */}
      {ecommerceClients.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-[#87919E] uppercase tracking-widest mb-2">E-commerce</p>
          <div className="rounded-xl border border-[#38435C] overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#38435C] bg-[#0A1E2C]">
                  <th className="text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider px-4 py-3 w-[180px]">Cliente</th>
                  <th className="text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider px-3 py-3 w-[100px]">Gestor</th>
                  <th className="text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider px-3 py-3">Budget (R$)</th>
                  <th className="text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider px-3 py-3">Faturamento Meta (R$)</th>
                  <th className="text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider px-3 py-3">ROAS Meta</th>
                  <th className="text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider px-3 py-3 w-[130px]">CPA Sugerido</th>
                  <th className="px-3 py-3 w-[80px]" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#38435C]">
                {ecommerceClients.map((client) => {
                  const row = rows[client.id]
                  const spend = parseFloat(row?.spend ?? '')
                  const fat   = parseFloat(row?.faturamento ?? '')

                  let liveCpa: number | null = null
                  if (!isNaN(spend) && spend > 0 && client.prevTicketMedio && client.prevTicketMedio > 0) {
                    if (!isNaN(fat) && fat > 0) {
                      const estConversions = fat / client.prevTicketMedio
                      liveCpa = estConversions > 0 ? spend / estConversions : null
                    } else {
                      liveCpa = client.suggestedCpa
                    }
                  } else if (!isNaN(spend) && spend > 0 && client.suggestedCpa) {
                    liveCpa = client.suggestedCpa
                  }

                  return (
                    <tr key={client.id} className="hover:bg-[#38435C]/20 transition-colors group">
                      <td className="px-4 py-3">
                        <a href={`/clients/${client.slug}`} className="text-[#95BBE2] hover:underline font-medium text-xs">
                          {client.name}
                        </a>
                      </td>
                      <td className="px-3 py-3 text-xs text-[#87919E]">{client.managerName}</td>
                      <td className="px-3 py-3">
                        <input
                          type="number" min="0" step="100" placeholder="ex: 10000"
                          value={row?.spend ?? ''}
                          onChange={(e) => setField(client.id, 'spend', e.target.value, false)}
                          onKeyDown={(e) => e.key === 'Enter' && saveRow(client.id, false)}
                          disabled={isLoading}
                          className="w-full bg-[#0A1E2C] border border-[#38435C] focus:border-[#95BBE2]/50 rounded-lg px-3 py-1.5 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/40 focus:outline-none transition-colors disabled:opacity-40"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="relative">
                          <input
                            type="number" min="0" step="100" placeholder="ex: 80000"
                            value={row?.faturamento ?? ''}
                            onChange={(e) => setField(client.id, 'faturamento', e.target.value, false)}
                            onKeyDown={(e) => e.key === 'Enter' && saveRow(client.id, false)}
                            disabled={isLoading}
                            className={`w-full bg-[#0A1E2C] border rounded-lg px-3 py-1.5 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/40 focus:outline-none transition-colors disabled:opacity-40 ${
                              row?.autoFat ? 'border-[#95BBE2]/40 bg-[#95BBE2]/5' : 'border-[#38435C] focus:border-[#95BBE2]/50'
                            }`}
                          />
                          {row?.autoFat && <Zap size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#95BBE2]/60" />}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="relative">
                          <input
                            type="number" min="0" step="0.1" placeholder="ex: 4.0"
                            value={row?.roas ?? ''}
                            onChange={(e) => setField(client.id, 'roas', e.target.value, false)}
                            onKeyDown={(e) => e.key === 'Enter' && saveRow(client.id, false)}
                            disabled={isLoading}
                            className={`w-full bg-[#0A1E2C] border rounded-lg px-3 py-1.5 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/40 focus:outline-none transition-colors disabled:opacity-40 ${
                              row?.autoRoas ? 'border-[#95BBE2]/40 bg-[#95BBE2]/5' : 'border-[#38435C] focus:border-[#95BBE2]/50'
                            }`}
                          />
                          {row?.autoRoas && <Zap size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#95BBE2]/60" />}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {liveCpa != null ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-semibold text-[#EAB308]">{formatCurrency(liveCpa)}</span>
                            {client.prevTicketMedio && (
                              <span className="text-[10px] text-[#87919E]/60">TM prev: {formatCurrency(client.prevTicketMedio)}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-[#87919E]/40">
                            {client.suggestedCpa ? `~${formatCurrency(client.suggestedCpa)}` : 'Sem histórico'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3"><RowActions client={client} isLocal={false} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Negócio Local ──────────────────────────────────────────────────── */}
      {localClients.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-[#87919E] uppercase tracking-widest mb-2">Negócio Local / B2B</p>
          <div className="rounded-xl border border-[#38435C] overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#38435C] bg-[#0A1E2C]">
                  <th className="text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider px-4 py-3 w-[180px]">Cliente</th>
                  <th className="text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider px-3 py-3 w-[100px]">Gestor</th>
                  <th className="text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider px-3 py-3 w-[190px]">Métrica principal</th>
                  <th className="text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider px-3 py-3">Meta</th>
                  <th className="text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider px-3 py-3">Custo-alvo (R$)</th>
                  <th className="text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider px-3 py-3">Budget (R$)</th>
                  <th className="px-3 py-3 w-[80px]" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#38435C]">
                {localClients.map((client) => {
                  const row = rows[client.id]
                  const metric = row?.mainMetric ?? 'LEADS'
                  const costLabel = costLabelFor(metric)
                  return (
                    <tr key={client.id} className="hover:bg-[#38435C]/20 transition-colors group">
                      <td className="px-4 py-3">
                        <a href={`/clients/${client.slug}`} className="text-[#95BBE2] hover:underline font-medium text-xs">
                          {client.name}
                        </a>
                      </td>
                      <td className="px-3 py-3 text-xs text-[#87919E]">{client.managerName}</td>
                      <td className="px-3 py-3">
                        <select
                          value={metric}
                          onChange={(e) => setMetric(client.id, e.target.value as MetricType)}
                          disabled={isLoading}
                          className="w-full bg-[#0A1E2C] border border-[#38435C] focus:border-[#95BBE2]/50 rounded-lg px-2 py-1.5 text-xs text-[#EBEBEB] focus:outline-none transition-colors disabled:opacity-40"
                        >
                          {LOCAL_RESULT_METRICS.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number" min="0" step="1" placeholder="ex: 150"
                          value={row?.mainValue ?? ''}
                          onChange={(e) => setField(client.id, 'mainValue', e.target.value, true)}
                          onKeyDown={(e) => e.key === 'Enter' && saveRow(client.id, true)}
                          disabled={isLoading}
                          className="w-full bg-[#0A1E2C] border border-[#38435C] focus:border-[#95BBE2]/50 rounded-lg px-3 py-1.5 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/40 focus:outline-none transition-colors disabled:opacity-40"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[9px] font-semibold text-[#87919E]/70 pointer-events-none">{costLabel}</span>
                          <input
                            type="number" min="0" step="0.01" placeholder="opcional"
                            value={row?.cost ?? ''}
                            onChange={(e) => setField(client.id, 'cost', e.target.value, true)}
                            onKeyDown={(e) => e.key === 'Enter' && saveRow(client.id, true)}
                            disabled={isLoading}
                            className={`w-full bg-[#0A1E2C] border rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/40 focus:outline-none transition-colors disabled:opacity-40 ${
                              row?.autoCost ? 'border-[#95BBE2]/40 bg-[#95BBE2]/5' : 'border-[#38435C] focus:border-[#95BBE2]/50'
                            }`}
                          />
                          {row?.autoCost && <Zap size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#95BBE2]/60" />}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number" min="0" step="100" placeholder="ex: 3000"
                          value={row?.spend ?? ''}
                          onChange={(e) => setField(client.id, 'spend', e.target.value, true)}
                          onKeyDown={(e) => e.key === 'Enter' && saveRow(client.id, true)}
                          disabled={isLoading}
                          className="w-full bg-[#0A1E2C] border border-[#38435C] focus:border-[#95BBE2]/50 rounded-lg px-3 py-1.5 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/40 focus:outline-none transition-colors disabled:opacity-40"
                        />
                      </td>
                      <td className="px-3 py-3"><RowActions client={client} isLocal={true} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* Mesmo saveAll do topo — repetido aqui porque o botão global ficava
              longe da seção de locais e parecia salvar só o e-commerce. */}
          <div className="flex justify-end mt-3">
            <button
              onClick={saveAll}
              disabled={isPending || isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#95BBE2] text-[#05141C] text-xs font-semibold hover:bg-[#95BBE2]/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Salvar todos (e-commerce + locais)
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 text-[10px] text-[#87919E]/60">
        <span className="flex items-center gap-1">
          <Zap size={10} className="text-[#95BBE2]/60" /> Campo calculado automaticamente
        </span>
        <span>· Enter salva a linha · + adiciona outras metas por cliente</span>
      </div>
    </div>
  )
}
