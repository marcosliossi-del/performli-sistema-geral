'use client'

import { useState } from 'react'
import { updateClient, deleteClient } from '@/app/actions/updateClient'
import { X, Trash2, AlertTriangle } from 'lucide-react'

interface ClientData {
  id: string
  name: string
  industry: string | null
  website: string | null
  notes: string | null
  email: string | null
  phone: string | null
  document: string | null
  contractValue: number | null
  contractStart: Date | null
}

interface Props {
  client: ClientData
  onClose: () => void
}

const industries = [
  'E-commerce', 'Moda', 'Cosméticos', 'Alimentação',
  'Saúde e Bem-estar', 'Educação', 'SaaS / Tecnologia',
  'Imóveis', 'Serviços', 'Outros',
]

export function EditClientModal({ client, onClose }: Props) {
  const [form, setForm] = useState({
    name: client.name,
    industry: client.industry ?? '',
    website: client.website ?? '',
    notes: client.notes ?? '',
    email: client.email ?? '',
    phone: client.phone ?? '',
    document: client.document ?? '',
    contractValue: client.contractValue?.toString() ?? '',
    contractStart: client.contractStart
      ? new Date(client.contractStart).toISOString().split('T')[0]
      : '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const result = await updateClient(client.id, {
        name: form.name,
        industry: form.industry || null,
        website: form.website || null,
        notes: form.notes || null,
        email: form.email || null,
        phone: form.phone || null,
        document: form.document || null,
        contractValue: form.contractValue ? parseFloat(form.contractValue) : null,
        contractStart: form.contractStart ? new Date(form.contractStart) : null,
      })
      if (result.error) {
        setError(result.error)
      } else {
        onClose()
        window.location.href = `/clients/${result.slug}`
      }
    } catch {
      setError('Erro ao salvar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    await deleteClient(client.id)
    // redirect happens server-side
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0A1E2C] border border-[#38435C] rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#38435C] flex-shrink-0">
          <h2 className="text-sm font-semibold text-[#EBEBEB]">Editar Cliente</h2>
          <button onClick={onClose} className="text-[#87919E] hover:text-[#EBEBEB] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs text-[#87919E]">Nome *</label>
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                required
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#87919E]">Segmento</label>
              <select
                value={form.industry}
                onChange={(e) => set('industry', e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              >
                <option value="">Selecionar</option>
                {industries.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#87919E]">Website</label>
              <input
                value={form.website}
                onChange={(e) => set('website', e.target.value)}
                type="url"
                placeholder="https://"
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#87919E]">E-mail</label>
              <input
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                type="email"
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#87919E]">Telefone</label>
              <input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#87919E]">CNPJ / CPF</label>
              <input
                value={form.document}
                onChange={(e) => set('document', e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#87919E]">Valor do Contrato (R$)</label>
              <input
                value={form.contractValue}
                onChange={(e) => set('contractValue', e.target.value)}
                type="number"
                step="0.01"
                min="0"
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#87919E]">Início do Contrato</label>
              <input
                value={form.contractStart}
                onChange={(e) => set('contractStart', e.target.value)}
                type="date"
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <label className="text-xs text-[#87919E]">Observações internas</label>
              <textarea
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50 resize-none"
              />
            </div>
          </div>

          {error && <p className="text-xs text-[#EF4444]">{error}</p>}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-[#38435C]">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-xs text-[#EF4444]/70 hover:text-[#EF4444] transition-colors"
              >
                <Trash2 size={13} />
                Excluir cliente
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <AlertTriangle size={13} className="text-[#EF4444]" />
                <span className="text-xs text-[#EF4444]">Confirmar exclusão?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs bg-[#EF4444] text-white px-2 py-1 rounded font-semibold disabled:opacity-50"
                >
                  {deleting ? '...' : 'Sim, excluir'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-[#87919E] hover:text-[#EBEBEB]"
                >
                  Cancelar
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-[#87919E] hover:text-[#EBEBEB] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm bg-[#95BBE2] text-[#0A1E2C] font-semibold rounded-lg hover:bg-[#95BBE2]/90 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
