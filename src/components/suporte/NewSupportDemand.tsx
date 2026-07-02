'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { X, Plus } from 'lucide-react'
import { createSupportDemand } from '@/app/actions/suporte'
import { toast } from '@/lib/toast'
import { useModalA11y } from '@/lib/useModalA11y'

type ClientOption = { id: string; name: string }
type UserOption = { id: string; name: string }

type Category = 'TRAFEGO' | 'DEMANDA_DA_AGENCIA' | 'SUCESSO_DO_CLIENTE'
type Priority = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAIXA'

const CATEGORIES: { value: Category; label: string; color: string }[] = [
  { value: 'TRAFEGO',            label: 'Tráfego',            color: '#3B82F6' },
  { value: 'DEMANDA_DA_AGENCIA', label: 'Demanda da Agência', color: '#F59E0B' },
  { value: 'SUCESSO_DO_CLIENTE', label: 'Sucesso do Cliente', color: '#A98CFF' },
]

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'CRITICA', label: 'Urgente' },
  { value: 'ALTA',    label: 'Alta' },
  { value: 'MEDIA',   label: 'Normal' },
  { value: 'BAIXA',   label: 'Baixa' },
]

export function NewSupportDemand({
  clients,
  users,
}: {
  clients: ClientOption[]
  users: UserOption[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-xs font-semibold text-[#021015] bg-gradient-to-b from-[#54e0ee] to-[#22c2d6] rounded-lg px-3.5 py-2"
      >
        <Plus size={14} />
        Nova demanda
      </button>
      {open && (
        <NewSupportDemandModal
          clients={clients}
          users={users}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function NewSupportDemandModal({
  clients,
  users,
  onClose,
}: {
  clients: ClientOption[]
  users: UserOption[]
  onClose: () => void
}) {
  const router = useRouter()
  const [clientId, setClientId] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category>('TRAFEGO')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<Priority>('MEDIA')
  const [description, setDescription] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)

  const canSubmit = clientId.length > 0 && title.trim().length >= 3

  function handleCreate() {
    setMsg(null)
    if (!clientId) {
      setMsg('Selecione o cliente da demanda.')
      return
    }
    if (title.trim().length < 3) {
      setMsg('Descreva a demanda no título.')
      return
    }
    startTransition(async () => {
      const res = await createSupportDemand({
        clientId,
        title,
        category,
        priority,
        assigneeId: assigneeId || undefined,
        dueDate: dueDate || undefined,
        description: description || undefined,
      })
      if ('error' in res) {
        setMsg(res.error)
        return
      }
      toast('Demanda de suporte criada.', 'ok')
      router.refresh()
      onClose()
    })
  }

  return (
    <>
      <div className="lg-overlay fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Nova demanda de suporte"
        className="lg-glass-strong fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[#05141C] border border-[#38435C] rounded-xl z-50"
      >
        <div className="sticky top-0 bg-[#05141C] border-b border-[#38435C] px-5 py-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#EBEBEB]">Nova demanda de suporte</h2>
          <button onClick={onClose} className="text-[#87919E] hover:text-[#EBEBEB]">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <Field label="Cliente *">
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputCls}>
              <option value="">— selecione o cliente —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>

          <Field label="O que precisa ser feito? *">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Ajustar criativo da campanha de inverno"
              className={inputCls}
            />
          </Field>

          <Field label="Categoria *">
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((c) => (
                <CategoryOption
                  key={c.value}
                  active={category === c.value}
                  label={c.label}
                  color={c.color}
                  onClick={() => setCategory(c.value)}
                />
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Responsável">
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={inputCls}>
                <option value="">CS do cliente</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Prioridade">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className={inputCls}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Vencimento (opcional)">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field label="Detalhes (opcional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={`${inputCls} resize-none`}
              placeholder="Contexto que ajuda quem for atender"
            />
          </Field>

          {msg && <p className="text-[11px] text-[#EF4444]">{msg}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="text-xs text-[#87919E] border border-[#38435C] rounded-lg px-3 py-1.5 hover:bg-[#38435C]/30"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={isPending || !canSubmit}
              className="text-xs bg-[#95BBE2]/10 text-[#95BBE2] border border-[#95BBE2]/20 rounded-lg px-4 py-1.5 hover:bg-[#95BBE2]/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Criar demanda
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function CategoryOption({
  active,
  label,
  color,
  onClick,
}: {
  active: boolean
  label: string
  color: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-center rounded-lg border px-2 py-2 transition-colors ${
        active ? 'bg-[#0A1E2C]' : 'bg-[#0A1E2C]/40 border-[#38435C] hover:bg-[#0A1E2C]/70'
      }`}
      style={active ? { borderColor: color } : undefined}
    >
      <span
        className="block text-[11px] font-semibold leading-tight"
        style={{ color: active ? color : '#EBEBEB' }}
      >
        {label}
      </span>
    </button>
  )
}

const inputCls =
  'w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-2 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/50 focus:outline-none focus:border-[#95BBE2]/50'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-medium text-[#87919E] uppercase tracking-wider">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  )
}
