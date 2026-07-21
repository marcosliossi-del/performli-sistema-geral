'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, ShieldAlert } from 'lucide-react'
import { createConversationChannel } from '@/app/actions/conversas'
import { toast } from '@/lib/toast'
import { Input } from '@/components/ui/input'

type ClientOption = { id: string; name: string; razaoSocial?: string | null }

/**
 * Modal ADMIN de conexão de canal WhatsApp Cloud. O accessToken é enviado uma
 * única vez e NUNCA é exibido de novo (o backend cifra e nunca retorna).
 */
export function ChannelModal({
  clients, onClose,
}: {
  clients: ClientOption[]
  onClose: () => void
}) {
  const router = useRouter()
  const [saving, startSave] = useTransition()
  const [form, setForm] = useState({
    clientId: '',
    phoneNumberId: '',
    wabaId: '',
    displayName: '',
    accessToken: '',
    verifyToken: '',
  })

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function submit() {
    if (!form.clientId) return toast('Escolha o cliente do canal.', 'err')
    if (!form.phoneNumberId.trim()) return toast('Informe o phoneNumberId.', 'err')
    if (!form.accessToken.trim()) return toast('Informe o token de acesso.', 'err')
    startSave(async () => {
      const res = await createConversationChannel(form.clientId, {
        phoneNumberId: form.phoneNumberId.trim(),
        wabaId: form.wabaId.trim() || undefined,
        displayName: form.displayName.trim() || undefined,
        accessToken: form.accessToken,
        verifyToken: form.verifyToken.trim() || undefined,
      })
      if (res.ok) {
        toast('Canal criado. Aguardando verificação do webhook na Meta.', 'ok')
        onClose()
        router.refresh()
      } else {
        toast(res.error, 'err')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-[#38435C] bg-[#0D2137] p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-[#EBEBEB]">Conectar canal WhatsApp</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-[#647488] hover:text-[#EBEBEB]">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Cliente">
            <select
              value={form.clientId}
              onChange={(e) => set('clientId', e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]"
            >
              <option value="">Selecione...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razaoSocial && c.razaoSocial.trim().toLowerCase() !== c.name.trim().toLowerCase()
                    ? `${c.name} — ${c.razaoSocial}`
                    : c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="phoneNumberId" hint="ID do número na WhatsApp Cloud API">
            <Input value={form.phoneNumberId} onChange={(e) => set('phoneNumberId', e.target.value)} placeholder="1234567890" />
          </Field>
          <Field label="wabaId" hint="Opcional — ID da conta WhatsApp Business">
            <Input value={form.wabaId} onChange={(e) => set('wabaId', e.target.value)} placeholder="Opcional" />
          </Field>
          <Field label="Nome de exibição" hint="Opcional">
            <Input value={form.displayName} onChange={(e) => set('displayName', e.target.value)} placeholder="Ex.: Loja X - Atendimento" />
          </Field>
          <Field label="Token de acesso">
            <Input type="password" value={form.accessToken} onChange={(e) => set('accessToken', e.target.value)} placeholder="Token permanente da Meta" />
            <div className="flex items-start gap-1.5 mt-1.5 text-[11px] text-[#F59E0B]">
              <ShieldAlert size={13} className="flex-shrink-0 mt-px" />
              <span>Por segurança, o token é cifrado e nunca mais é exibido. Guarde-o em local seguro.</span>
            </div>
          </Field>
          <Field label="verifyToken" hint="Opcional — usado no handshake do webhook">
            <Input value={form.verifyToken} onChange={(e) => set('verifyToken', e.target.value)} placeholder="Opcional" />
          </Field>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3 rounded-lg border border-[#38435C] text-sm text-[#a3b2c2] hover:text-[#EBEBEB]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="h-9 px-4 rounded-lg bg-gradient-to-b from-[#54e0ee] to-[#22c2d6] text-[#021015] text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Criando...' : 'Criar canal'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#a3b2c2] mb-1">
        {label}
        {hint && <span className="text-[#647488] font-normal"> — {hint}</span>}
      </label>
      {children}
    </div>
  )
}
