'use client'

import { useState, useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, X, Target, Calendar } from 'lucide-react'
import { createGoal } from '@/app/actions/goals'
import { BusinessType } from '@prisma/client'
import { useModalA11y } from '@/lib/useModalA11y'
import {
  ECOMMERCE_WEEKLY,
  ECOMMERCE_MONTHLY,
  LOCAL_WEEKLY,
  LOCAL_MONTHLY,
} from '@/lib/metas/metricOptions'

interface GoalFormModalProps {
  clientId: string
  businessType?: BusinessType
  label?: string
  icon?: React.ReactNode
}

const initialState = { error: undefined, success: false }

function getMonthBounds() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: fmt(start), end: fmt(end) }
}

export function GoalFormModal({ clientId, businessType, label, icon }: GoalFormModalProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {icon !== undefined ? (
        <button
          onClick={() => setOpen(true)}
          title="Adicionar outra meta"
          className="w-6 h-6 flex items-center justify-center rounded border border-[#38435C] text-[#87919E] hover:text-[#95BBE2] hover:border-[#95BBE2]/30 transition-colors"
        >
          {icon}
        </button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus size={14} />
          {label ?? 'Nova Meta'}
        </Button>
      )}

      {open && (
        <GoalFormDialog clientId={clientId} businessType={businessType} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

function GoalFormDialog({ clientId, businessType, onClose }: { clientId: string; businessType?: BusinessType; onClose: () => void }) {
  const [period, setPeriod] = useState<'WEEKLY' | 'MONTHLY'>('MONTHLY')
  const [state, formAction, pending] = useActionState(createGoal, initialState)
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)

  if (state.success) onClose()

  const isLocal = businessType === 'LOCAL' || businessType === 'B2B'
  const metrics = period === 'MONTHLY'
    ? (isLocal ? LOCAL_MONTHLY : ECOMMERCE_MONTHLY)
    : (isLocal ? LOCAL_WEEKLY  : ECOMMERCE_WEEKLY)
  const { start: monthStart, end: monthEnd } = getMonthBounds()

  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="lg-overlay absolute inset-0 bg-black/60" onClick={onClose} />

          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Nova Meta"
            className="lg-glass-strong relative w-full max-w-md bg-[#0A1E2C] border border-[#38435C] rounded-2xl shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#38435C]">
              <div className="flex items-center gap-2">
                <Target size={16} className="text-[#95BBE2]" />
                <h2 className="text-sm font-semibold text-[#EBEBEB]">Nova Meta</h2>
              </div>
              <button onClick={onClose} className="text-[#87919E] hover:text-[#EBEBEB] transition-colors">
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
                <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={pending} className="flex-1">
                  {pending ? 'Salvando...' : 'Salvar Meta'}
                </Button>
              </div>
            </form>
          </div>
        </div>
  )
}
