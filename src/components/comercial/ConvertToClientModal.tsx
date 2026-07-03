'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, UserCheck, Building2, Calendar, DollarSign, Target, User, AlertTriangle } from 'lucide-react'
import type { Lead } from './types'
import { useModalA11y } from '@/lib/useModalA11y'

interface Member { id: string; name: string; role: string; isMe?: boolean }

// Papéis que assumem clientes (podem virar gestor responsável na conversão).
const MANAGER_ROLES = ['MANAGER', 'GESTOR_TRAFEGO']

// Tipo de negócio — mesmo trio do EditClientModal (fonte da verdade: enum
// BusinessType). Define como o cliente é medido depois da conversão.
const BUSINESS_TYPES = [
  { value: 'ECOMMERCE', label: 'E-commerce' },
  { value: 'LOCAL',     label: 'Negócio Local' },
  { value: 'B2B',       label: 'B2B / Atacado' },
] as const

// Métricas coerentes com o GoalFormModal (o resto do sistema não usa 'SALES').
// TODO: importar de src/lib/metas/metricOptions quando o módulo compartilhado
// existir (outro agente está extraindo) — remover esta lista local então.
const GOAL_METRICS = [
  { value: 'FATURAMENTO',  label: 'Faturamento' },
  { value: 'ROAS',         label: 'ROAS' },
  { value: 'SPEND',        label: 'Investimento' },
  { value: 'LEADS',        label: 'Leads' },
  { value: 'CPL',          label: 'CPL' },
  { value: 'CONVERSIONS',  label: 'Conversões' },
  { value: 'MENSAGENS',    label: 'Mensagens' },
  { value: 'AGENDAMENTOS', label: 'Agendamentos' },
] as const

interface Props {
  lead: Lead
  onClose:     () => void
  onConverted: (clientId: string, clientSlug: string) => void
}

const inputCls = 'w-full h-9 px-3 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2] transition-colors'
const labelCls = 'block text-xs text-[#87919E] mb-1'

export function ConvertToClientModal({ lead, onClose, onConverted }: Props) {
  const [members,  setMembers]  = useState<Member[]>([])
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)

  const today = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState({
    clientName:     lead.company || lead.name,
    razaoSocial:    '',
    businessType:   'ECOMMERCE',
    phone:          lead.phone   ?? '',
    email:          lead.email   ?? '',
    industry:       '',
    contractStart:  today,
    contractMonths: '12',
    contractValue:  lead.value ? String(Math.round(lead.value)) : '',
    managerId:      '',
    monthlyGoal:    '',
    goalMetric:     'FATURAMENTO',
  })

  useEffect(() => {
    fetch('/api/team/members')
      .then(r => r.json())
      .then((data: Member[]) => {
        setMembers(data)
        // Pré-seleciona o usuário atual como gestor se ele for gestor de tráfego.
        const me = data.find(m => m.isMe && MANAGER_ROLES.includes(m.role))
        if (me) setForm(f => (f.managerId ? f : { ...f, managerId: me.id }))
      })
      .catch(() => {})
  }, [])

  function set(field: keyof typeof form, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit() {
    if (!form.clientName.trim() || !form.contractStart) return
    setSaving(true)
    setError(null)
    try {
      const res  = await fetch(`/api/comercial/leads/${lead.id}/convert`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName:    form.clientName.trim(),
          razaoSocial:   form.razaoSocial.trim() || undefined,
          businessType:  form.businessType,
          phone:         form.phone    || undefined,
          email:         form.email    || undefined,
          industry:      form.industry || undefined,
          contractStart: form.contractStart,
          contractMonths:form.contractMonths ? Number(form.contractMonths) : undefined,
          contractValue: form.contractValue  ? Number(form.contractValue)  : undefined,
          managerId:     form.managerId      || undefined,
          monthlyGoal:   form.monthlyGoal    ? Number(form.monthlyGoal)    : undefined,
          goalMetric:    form.goalMetric     || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erro ao converter')
        return
      }
      onConverted(data.clientId, data.clientSlug)
    } catch {
      setError('Erro de conexão')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Converter em cliente"
        className="lg-glass-strong relative w-full max-w-lg bg-[#0D2137] border border-[#38435C] rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#38435C]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#22C55E]/15 flex items-center justify-center">
              <UserCheck size={15} className="text-[#22C55E]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#EBEBEB]">Converter em cliente</h2>
              <p className="text-[11px] text-[#87919E]">{lead.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#87919E] hover:text-[#EBEBEB] transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">

          {/* Cliente */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={13} className="text-[#87919E]" />
              <span className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">Dados do cliente</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Nome do cliente / empresa *</label>
                <input value={form.clientName} onChange={e => set('clientName', e.target.value)} className={inputCls} placeholder="Nome da empresa ou cliente" />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Razão social (como está no Asaas)</label>
                <input value={form.razaoSocial} onChange={e => set('razaoSocial', e.target.value)} className={inputCls} placeholder="Usada para conciliar faturas do Asaas com este cliente" />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Tipo de negócio</label>
                <div className="flex gap-2">
                  {BUSINESS_TYPES.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => set('businessType', value)}
                      className={`flex-1 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                        form.businessType === value
                          ? 'border-[#95BBE2] bg-[#95BBE2]/10 text-[#95BBE2]'
                          : 'border-[#38435C] text-[#87919E] hover:border-[#38435C]/80'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Telefone</label>
                <input value={form.phone} onChange={e => set('phone', e.target.value)} className={inputCls} placeholder="(11) 99999-0000" />
              </div>
              <div>
                <label className={labelCls}>E-mail</label>
                <input value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} placeholder="email@empresa.com" type="email" />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Segmento</label>
                <input value={form.industry} onChange={e => set('industry', e.target.value)} className={inputCls} placeholder="Ex: E-commerce, Clínica, Restaurante..." />
              </div>
            </div>
          </div>

          {/* Contrato */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={13} className="text-[#87919E]" />
              <span className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">Contrato</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Início do contrato *</label>
                <input value={form.contractStart} onChange={e => set('contractStart', e.target.value)} type="date" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Duração (meses)</label>
                <input value={form.contractMonths} onChange={e => set('contractMonths', e.target.value)} type="number" min="1" className={inputCls} placeholder="12" />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Fee mensal (R$)</label>
                <div className="relative">
                  <DollarSign size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#87919E]" />
                  <input value={form.contractValue} onChange={e => set('contractValue', e.target.value)} type="number" min="0" className={`${inputCls} pl-8`} placeholder="0,00" />
                </div>
              </div>
            </div>
          </div>

          {/* Gestor */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <User size={13} className="text-[#87919E]" />
              <span className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">Gestor responsável</span>
            </div>
            <select value={form.managerId} onChange={e => set('managerId', e.target.value)} className={inputCls}>
              <option value="">Selecionar gestor (opcional)</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name} — {m.role}</option>
              ))}
            </select>
            {!form.managerId && (
              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-[#F59E0B] bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-lg px-2.5 py-1.5">
                <AlertTriangle size={13} className="mt-px shrink-0" />
                Sem gestor definido — o cliente ficará sem responsável.
              </p>
            )}
          </div>

          {/* Meta */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Target size={13} className="text-[#87919E]" />
              <span className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">Meta mensal</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Métrica</label>
                <select value={form.goalMetric} onChange={e => set('goalMetric', e.target.value)} className={inputCls}>
                  {GOAL_METRICS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Valor alvo</label>
                <input value={form.monthlyGoal} onChange={e => set('monthlyGoal', e.target.value)} type="number" min="0" className={inputCls} placeholder="Ex: 50000" />
              </div>
            </div>
          </div>

          {error && (
            <p className="text-xs text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#38435C]">
          <button onClick={onClose} className="text-sm text-[#87919E] hover:text-[#EBEBEB] transition-colors px-4 py-2">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.clientName.trim() || !form.contractStart}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-[#22C55E] text-white hover:bg-[#16A34A] transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
            {saving ? 'Criando cliente...' : 'Criar cliente'}
          </button>
        </div>
      </div>
    </div>
  )
}
