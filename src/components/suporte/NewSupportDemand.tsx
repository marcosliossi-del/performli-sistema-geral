'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { X, Plus } from 'lucide-react'
import { createSupportDemand } from '@/app/actions/suporte'
import { toast } from '@/lib/toast'
import { useModalA11y } from '@/lib/useModalA11y'

type ClientOption = { id: string; name: string }

export function NewSupportDemand({ clients }: { clients: ClientOption[] }) {
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
      {open && <NewSupportDemandModal clients={clients} onClose={() => setOpen(false)} />}
    </>
  )
}

function NewSupportDemandModal({
  clients,
  onClose,
}: {
  clients: ClientOption[]
  onClose: () => void
}) {
  const router = useRouter()
  const [clientId, setClientId] = useState('')
  const [title, setTitle] = useState('')
  const [direction, setDirection] =
    useState<'CLIENTE_PARA_NOS' | 'NOS_PARA_CLIENTE'>('CLIENTE_PARA_NOS')
  const [description, setDescription] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)

  function handleCreate() {
    setMsg(null)
    if (!clientId) {
      setMsg('Selecione o cliente da demanda.')
      return
    }
    startTransition(async () => {
      const res = await createSupportDemand({
        clientId,
        title,
        direction,
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
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Nova demanda de suporte"
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[#05141C] border border-[#38435C] rounded-xl z-50"
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

          <Field label="O que o cliente precisa? *">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Ajustar criativo da campanha de inverno"
              className={inputCls}
            />
          </Field>

          <Field label="Direção da demanda *">
            <div className="grid grid-cols-2 gap-2">
              <DirectionOption
                active={direction === 'CLIENTE_PARA_NOS'}
                label="Cliente → Nós"
                hint="O cliente pediu algo"
                color="#95BBE2"
                onClick={() => setDirection('CLIENTE_PARA_NOS')}
              />
              <DirectionOption
                active={direction === 'NOS_PARA_CLIENTE'}
                label="Nós → Cliente"
                hint="Precisamos de algo do cliente"
                color="#F59E0B"
                onClick={() => setDirection('NOS_PARA_CLIENTE')}
              />
            </div>
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
              disabled={isPending}
              className="text-xs bg-[#95BBE2]/10 text-[#95BBE2] border border-[#95BBE2]/20 rounded-lg px-4 py-1.5 hover:bg-[#95BBE2]/20 disabled:opacity-50"
            >
              Criar demanda
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function DirectionOption({
  active,
  label,
  hint,
  color,
  onClick,
}: {
  active: boolean
  label: string
  hint: string
  color: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border px-3 py-2 transition-colors ${
        active ? 'bg-[#0A1E2C]' : 'bg-[#0A1E2C]/40 border-[#38435C] hover:bg-[#0A1E2C]/70'
      }`}
      style={active ? { borderColor: color } : undefined}
    >
      <span className="block text-xs font-semibold" style={{ color: active ? color : '#EBEBEB' }}>
        {label}
      </span>
      <span className="block text-[10px] text-[#87919E] mt-0.5">{hint}</span>
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
