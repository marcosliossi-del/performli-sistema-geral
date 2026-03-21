'use client'

import { useState, useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, X, Target } from 'lucide-react'
import { createGoal } from '@/app/actions/goals'

const metrics = [
  { value: 'ROAS', label: 'ROAS', hint: 'ex: 4.0' },
  { value: 'CPL', label: 'CPL (Custo por Lead)', hint: 'ex: 25.00' },
  { value: 'CPA', label: 'CPA (Custo por Aquisição)', hint: 'ex: 60.00' },
  { value: 'INVESTMENT', label: 'Investimento (R$)', hint: 'ex: 5000' },
  { value: 'CONVERSIONS', label: 'Conversões', hint: 'ex: 80' },
  { value: 'CTR', label: 'CTR (%)', hint: 'ex: 2.5' },
  { value: 'CPC', label: 'CPC (Custo por Clique)', hint: 'ex: 1.50' },
]

interface GoalFormModalProps {
  clientId: string
  label?: string
}

const initialState = { error: undefined, success: false }

export function GoalFormModal({ clientId, label }: GoalFormModalProps) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(createGoal, initialState)

  if (state.success && open) setOpen(false)

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={14} />
        {label ?? 'Nova Meta'}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-md bg-[#0A1E2C] border border-[#38435C] rounded-2xl shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#38435C]">
              <div className="flex items-center gap-2">
                <Target size={16} className="text-[#95BBE2]" />
                <h2 className="text-sm font-semibold text-[#EBEBEB]">Nova Meta Semanal</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-[#87919E] hover:text-[#EBEBEB] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <form action={formAction} className="px-6 py-5 space-y-4">
              <input type="hidden" name="clientId" value={clientId} />

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
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">
                  Valor da Meta
                </label>
                <Input name="targetValue" type="number" step="0.01" min="0" placeholder="ex: 4.0" required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">
                    Início
                  </label>
                  <Input name="startDate" type="date" required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">
                    Fim
                  </label>
                  <Input name="endDate" type="date" required />
                </div>
              </div>

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
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setOpen(false)}
                >
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
