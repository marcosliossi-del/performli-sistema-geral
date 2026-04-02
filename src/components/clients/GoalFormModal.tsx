'use client'

import { useState, useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, X, Target, Calendar } from 'lucide-react'
import { createGoal } from '@/app/actions/goals'

const WEEKLY_METRICS = [
  { value: 'ROAS',          label: 'ROAS',                      hint: 'ex: 4.0'   },
  { value: 'FATURAMENTO',   label: 'Faturamento (R$)',           hint: 'ex: 50000' },
  { value: 'INVESTMENT',    label: 'Investimento Semanal (R$)',  hint: 'ex: 2500'  },
  { value: 'CAC',           label: 'CAC (Custo por Aquisição)',  hint: 'ex: 80.00' },
  { value: 'TAXA_CONVERSAO',label: 'Taxa de Conversão (%)',      hint: 'ex: 2.5'   },
  { value: 'TICKET_MEDIO',  label: 'Ticket Médio (R$)',          hint: 'ex: 300'   },
  { value: 'CPS',           label: 'Custo por Sessão (R$)',      hint: 'ex: 0.50'  },
  { value: 'CPL',           label: 'CPL (Custo por Lead)',       hint: 'ex: 25.00' },
  { value: 'CPA',           label: 'CPA (Custo por Aquisição)',  hint: 'ex: 60.00' },
  { value: 'CONVERSIONS',   label: 'Conversões / Compras',       hint: 'ex: 80'    },
  { value: 'CTR',           label: 'CTR (%)',                    hint: 'ex: 2.5'   },
  { value: 'CPC',           label: 'CPC (R$)',                   hint: 'ex: 1.50'  },
]

const MONTHLY_METRICS = [
  { value: 'ROAS',          label: 'ROAS Esperado',             hint: 'ex: 4.0'    },
  { value: 'FATURAMENTO',   label: 'Faturamento Meta (R$)',     hint: 'ex: 80000'  },
  { value: 'INVESTMENT',    label: 'Investimento do Mês (R$)',  hint: 'ex: 10000'  },
  { value: 'SPEND',         label: 'Budget Total do Mês (R$)',  hint: 'ex: 10000'  },
  { value: 'CAC',           label: 'CAC Meta (R$)',             hint: 'ex: 80.00'  },
  { value: 'CONVERSIONS',   label: 'Compras Meta',              hint: 'ex: 200'    },
  { value: 'TAXA_CONVERSAO',label: 'Taxa de Conversão (%)',     hint: 'ex: 2.5'    },
  { value: 'TICKET_MEDIO',  label: 'Ticket Médio (R$)',         hint: 'ex: 350'    },
  { value: 'CPS',           label: 'Custo por Sessão (R$)',     hint: 'ex: 0.50'   },
]

interface GoalFormModalProps {
  clientId: string
  label?: string
}

const initialState = { error: undefined, success: false }

function getMonthBounds() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  return { start: fmt(start), end: fmt(end) }
}

export function GoalFormModal({ clientId, label }: GoalFormModalProps) {
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState<'WEEKLY' | 'MONTHLY'>('MONTHLY')
  const [state, formAction, pending] = useActionState(createGoal, initialState)

  if (state.success && open) setOpen(false)

  const metrics = period === 'MONTHLY' ? MONTHLY_METRICS : WEEKLY_METRICS
  const { start: monthStart, end: monthEnd } = getMonthBounds()

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={14} />
        {label ?? 'Nova Meta'}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />

          <div className="relative w-full max-w-md bg-[#0A1E2C] border border-[#38435C] rounded-2xl shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#38435C]">
              <div className="flex items-center gap-2">
                <Target size={16} className="text-[#95BBE2]" />
                <h2 className="text-sm font-semibold text-[#EBEBEB]">Nova Meta</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-[#87919E] hover:text-[#EBEBEB] transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <form action={formAction} className="px-6 py-5 space-y-4">
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="period" value={period} />

              {/* Period toggle */}
              <div className="flex rounded-lg overflow-hidden border border-[#38435C] p-0.5 gap-0.5 bg-[#05141C]">
                <button
                  type="button"
                  onClick={() => setPeriod('MONTHLY')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium transition-all ${
                    period === 'MONTHLY'
                      ? 'bg-[#95BBE2]/20 text-[#95BBE2]'
                      : 'text-[#87919E] hover:text-[#EBEBEB]'
                  }`}
                >
                  <Calendar size={12} />
                  Mensal
                </button>
                <button
                  type="button"
                  onClick={() => setPeriod('WEEKLY')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium transition-all ${
                    period === 'WEEKLY'
                      ? 'bg-[#95BBE2]/20 text-[#95BBE2]'
                      : 'text-[#87919E] hover:text-[#EBEBEB]'
                  }`}
                >
                  <Target size={12} />
                  Semanal
                </button>
              </div>

              {/* Metric */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">
                  Métrica
                </label>
                <select
                  name="metric"
                  required
                  className="w-full h-10 px-3 rounded-lg bg-[#05141C] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2] transition-colors"
                >
                  <option value="">Selecionar métrica</option>
                  {metrics.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Target value */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">
                  Valor da Meta
                </label>
                <Input name="targetValue" type="number" step="0.01" min="0" placeholder="ex: 4.0" required />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">
                    Início
                  </label>
                  <Input
                    name="startDate"
                    type="date"
                    required
                    defaultValue={period === 'MONTHLY' ? monthStart : undefined}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">
                    Fim
                  </label>
                  <Input
                    name="endDate"
                    type="date"
                    required
                    defaultValue={period === 'MONTHLY' ? monthEnd : undefined}
                  />
                </div>
              </div>

              {period === 'MONTHLY' && (
                <p className="text-[10px] text-[#87919E]">
                  Datas preenchidas automaticamente com o mês atual. Ajuste se necessário.
                </p>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">
                  Observações
                </label>
                <Input name="notes" type="text" placeholder="Opcional" />
              </div>

              {state?.error && (
                <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg px-3 py-2">
                  <p className="text-[#EF4444] text-xs">{state.error}</p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={pending} className="flex-1">
                  {pending ? 'Salvando...' : 'Salvar Meta'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
