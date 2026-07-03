'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { Lead } from './types'
import { KANBAN_STAGES, STAGE_CONFIG } from './types'

interface Member { id: string; name: string; role: string; isMe?: boolean }

// Papéis que assumem leads como responsável comercial.
const OWNER_ROLES = ['MANAGER', 'GESTOR_TRAFEGO']

interface Props {
  open:    boolean
  lead?:   Lead | null        // null = create, Lead = edit
  onClose: () => void
  onSave:  (lead: Lead) => void
}

export function NewLeadDialog({ open, lead, onClose, onSave }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [form, setForm] = useState({
    name:            '',
    email:           '',
    phone:           '',
    company:         '',
    source:          '',
    value:           '',
    probability:     '',
    expectedCloseAt: '',
    notes:           '',
    status:          'NOVO',
    ownerId:         '',
  })

  useEffect(() => {
    fetch('/api/team/members')
      .then(r => r.json())
      .then((data: Member[]) => setMembers(data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setError(null)
    if (lead) {
      setForm({
        name:            lead.name,
        email:           lead.email ?? '',
        phone:           lead.phone ?? '',
        company:         lead.company ?? '',
        source:          lead.source ?? '',
        value:           lead.value != null ? String(lead.value) : '',
        probability:     lead.probability != null ? String(lead.probability) : '',
        expectedCloseAt: lead.expectedCloseAt ? lead.expectedCloseAt.split('T')[0] : '',
        notes:           lead.notes ?? '',
        status:          lead.status ?? 'NOVO',
        ownerId:         lead.ownerId ?? '',
      })
    } else {
      setForm({ name:'', email:'', phone:'', company:'', source:'', value:'', probability:'', expectedCloseAt:'', notes:'', status:'NOVO', ownerId:'' })
    }
  }, [lead, open])

  // Pré-seleciona o usuário atual como responsável ao criar (se for gestor).
  useEffect(() => {
    if (lead || !open || members.length === 0) return
    const me = members.find(m => m.isMe && OWNER_ROLES.includes(m.role))
    if (me) setForm(f => (f.ownerId ? f : { ...f, ownerId: me.id }))
  }, [members, lead, open])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Valor do contrato: número válido e não-negativo. NaN é rejeitado.
    let value: number | undefined
    if (form.value.trim()) {
      value = parseFloat(form.value.replace(/\./g, '').replace(',', '.'))
      if (Number.isNaN(value) || value <= 0) {
        setError('Informe um valor de contrato válido (número maior que zero) ou deixe em branco.')
        return
      }
    }

    setSaving(true)
    try {
      const payload = {
        name:            form.name,
        email:           form.email || undefined,
        phone:           form.phone || undefined,
        company:         form.company || undefined,
        source:          form.source || undefined,
        value,
        probability:     form.probability ? parseInt(form.probability) : undefined,
        expectedCloseAt: form.expectedCloseAt || undefined,
        notes:           form.notes || undefined,
        status:          form.status,
        ownerId:         form.ownerId || undefined,
      }

      const res = lead
        ? await fetch(`/api/comercial/leads/${lead.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/comercial/leads',            { method: 'POST',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })

      if (res.ok) {
        const saved = await res.json()
        onSave(saved)
        onClose()
      } else {
        const data = await res.json().catch(() => null)
        setError(typeof data?.error === 'string' ? data.error : 'Não foi possível salvar o lead.')
      }
    } finally {
      setSaving(false)
    }
  }

  const f = (key: keyof typeof form) => ({
    value:    form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [key]: e.target.value })),
  })

  const inputCls = 'w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-2 text-sm text-[#EBEBEB] placeholder-[#87919E] outline-none focus:border-[#95BBE2] transition-colors'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#0D2137] border border-[#38435C] rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#38435C]">
          <h2 className="text-base font-semibold text-[#EBEBEB]">
            {lead ? 'Editar lead' : 'Novo lead'}
          </h2>
          <button onClick={onClose} className="text-[#87919E] hover:text-[#EBEBEB] transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-[#87919E] mb-1">Nome *</label>
              <input {...f('name')} required placeholder="Nome do lead" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-[#87919E] mb-1">Empresa</label>
              <input {...f('company')} placeholder="Empresa" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-[#87919E] mb-1">Origem</label>
              <input {...f('source')} placeholder="Instagram, Indicação..." className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-[#87919E] mb-1">E-mail</label>
              <input {...f('email')} type="email" placeholder="email@empresa.com" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-[#87919E] mb-1">Telefone</label>
              <input {...f('phone')} placeholder="(11) 99999-0000" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-[#87919E] mb-1">Valor do contrato (R$)</label>
              <input {...f('value')} type="number" min="0" step="0.01" inputMode="decimal" placeholder="5000" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-[#87919E] mb-1">Probabilidade (%)</label>
              <input {...f('probability')} type="number" min="0" max="100" placeholder="70" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-[#87919E] mb-1">Etapa</label>
              <select {...f('status')} className={inputCls}>
                {KANBAN_STAGES.map(s => (
                  <option key={s} value={s}>{STAGE_CONFIG[s].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#87919E] mb-1">Responsável</label>
              <select {...f('ownerId')} className={inputCls}>
                <option value="">Sem responsável</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.name} — {m.role}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-[#87919E] mb-1">Previsão de fechamento</label>
              <input {...f('expectedCloseAt')} type="date" className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-[#87919E] mb-1">Notas</label>
              <textarea
                {...f('notes')}
                rows={3}
                placeholder="Contexto do lead, necessidades, observações..."
                className={inputCls + ' resize-none'}
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg px-3 py-2">{error}</p>
          )}
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#38435C]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-[#87919E] hover:text-[#EBEBEB] transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#22C55E] text-white hover:bg-[#16A34A] transition-colors disabled:opacity-60"
          >
            {saving ? 'Salvando...' : lead ? 'Salvar' : 'Criar lead'}
          </button>
        </div>
      </div>
    </div>
  )
}
