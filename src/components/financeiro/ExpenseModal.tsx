'use client'

import { useState } from 'react'
import { X, Loader2, TrendingDown, Trash2 } from 'lucide-react'

export interface ExpenseRow {
  id:          string
  description: string
  category:    string
  value:       number
  date:        string
  recurring:   boolean
  notes:       string | null
}

const CATEGORIES: { value: string; label: string; color: string }[] = [
  { value: 'SALARIOS',      label: 'Salários e encargos',      color: '#8B5CF6' },
  { value: 'MARKETING',     label: 'Marketing e mídia paga',   color: '#F59E0B' },
  { value: 'FERRAMENTAS',   label: 'Ferramentas e SaaS',       color: '#3B82F6' },
  { value: 'IMPOSTOS',      label: 'Impostos e taxas',         color: '#EF4444' },
  { value: 'CONTABILIDADE', label: 'Contabilidade e jurídico', color: '#06B6D4' },
  { value: 'ESCRITORIO',    label: 'Escritório e infra',       color: '#84CC16' },
  { value: 'OUTROS',        label: 'Outros',                   color: '#87919E' },
]

export function categoryLabel(cat: string) {
  return CATEGORIES.find(c => c.value === cat)?.label ?? cat
}

export function categoryColor(cat: string) {
  return CATEGORIES.find(c => c.value === cat)?.color ?? '#87919E'
}

interface Props {
  expense?:  ExpenseRow | null
  onClose:   () => void
  onSaved:   (e: ExpenseRow) => void
  onDeleted?: (id: string) => void
}

const inputCls = 'w-full h-9 px-3 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2] transition-colors'
const labelCls = 'block text-xs text-[#87919E] mb-1'

export function ExpenseModal({ expense, onClose, onSaved, onDeleted }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const [form, setForm] = useState({
    description: expense?.description ?? '',
    category:    expense?.category    ?? 'OUTROS',
    value:       expense?.value ? String(expense.value) : '',
    date:        expense?.date  ? expense.date.split('T')[0] : today,
    recurring:   expense?.recurring ?? false,
    notes:       expense?.notes ?? '',
  })

  function set(k: keyof typeof form, v: string | boolean) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleSave() {
    if (!form.description.trim() || !form.value || !form.date) return
    setSaving(true)
    setError(null)
    try {
      const url    = expense ? `/api/financeiro/expenses/${expense.id}` : '/api/financeiro/expenses'
      const method = expense ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: form.description.trim(),
          category:    form.category,
          value:       Number(form.value),
          date:        form.date,
          recurring:   form.recurring,
          notes:       form.notes || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erro'); return }
      onSaved(data)
    } catch { setError('Erro de conexão') }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!expense) return
    setDeleting(true)
    await fetch(`/api/financeiro/expenses/${expense.id}`, { method: 'DELETE' })
    onDeleted?.(expense.id)
    setDeleting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-[#0D2137] border border-[#38435C] rounded-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#38435C]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#EF4444]/15 flex items-center justify-center">
              <TrendingDown size={15} className="text-[#EF4444]" />
            </div>
            <h2 className="text-sm font-semibold text-[#EBEBEB]">
              {expense ? 'Editar despesa' : 'Lançar despesa'}
            </h2>
          </div>
          <button onClick={onClose} className="text-[#87919E] hover:text-[#EBEBEB] transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className={labelCls}>Descrição *</label>
            <input
              value={form.description}
              onChange={e => set('description', e.target.value)}
              className={inputCls}
              placeholder="Ex: Salários abril, Google Ads, Notion..."
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Categoria *</label>
              <select value={form.category} onChange={e => set('category', e.target.value)} className={inputCls}>
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Valor (R$) *</label>
              <input
                value={form.value}
                onChange={e => set('value', e.target.value)}
                type="number"
                min="0"
                step="0.01"
                className={inputCls}
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Data *</label>
              <input
                value={form.date}
                onChange={e => set('date', e.target.value)}
                type="date"
                className={inputCls}
              />
            </div>
            <div className="flex items-end pb-0.5">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <div
                  onClick={() => set('recurring', !form.recurring)}
                  className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${form.recurring ? 'bg-[#95BBE2]' : 'bg-[#38435C]'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.recurring ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-xs text-[#87919E]">Recorrente</span>
              </label>
            </div>
          </div>

          <div>
            <label className={labelCls}>Observações</label>
            <input
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              className={inputCls}
              placeholder="Opcional"
            />
          </div>

          {error && (
            <p className="text-xs text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#38435C]">
          <div>
            {expense && onDeleted && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 text-xs text-[#EF4444]/70 hover:text-[#EF4444] transition-colors"
              >
                <Trash2 size={12} />
                {deleting ? 'Removendo...' : 'Remover'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="text-sm text-[#87919E] hover:text-[#EBEBEB] transition-colors px-3 py-2">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.description.trim() || !form.value || !form.date}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-[#EF4444] text-white hover:bg-[#DC2626] transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <TrendingDown size={14} />}
              {saving ? 'Salvando...' : expense ? 'Salvar' : 'Lançar despesa'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
