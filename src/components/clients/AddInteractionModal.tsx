'use client'

import { useState } from 'react'
import { addInteraction } from '@/app/actions/interactions'
import { ClientInteractionItem } from '@/lib/dal'
import { InteractionType } from '@prisma/client'
import { X } from 'lucide-react'

const TYPES: { value: InteractionType; label: string }[] = [
  { value: 'LIGACAO',           label: 'Ligação'           },
  { value: 'REUNIAO',           label: 'Reunião'           },
  { value: 'EMAIL',             label: 'E-mail'            },
  { value: 'WHATSAPP',          label: 'WhatsApp'          },
  { value: 'NOTA',              label: 'Nota'              },
  { value: 'PROPOSTA_ENVIADA',  label: 'Proposta Enviada'  },
  { value: 'CONTRATO_ASSINADO', label: 'Contrato Assinado' },
]

interface Props {
  clientId: string
  onClose: () => void
  onAdded: (item: ClientInteractionItem) => void
}

export function AddInteractionModal({ clientId, onClose, onAdded }: Props) {
  const [type, setType] = useState<InteractionType>('NOTA')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim()) return
    setLoading(true)
    setError(null)
    try {
      const result = await addInteraction(clientId, type, description)
      if ('error' in result && result.error) {
        setError(result.error)
        return
      }
      // Optimistic item — server will revalidate path but we show immediately
      onAdded({
        id:          crypto.randomUUID(),
        type,
        description: description.trim(),
        createdAt:   new Date(),
        userName:    'Você',
      })
    } catch {
      setError('Erro ao salvar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0A1E2C] border border-[#38435C] rounded-xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#38435C]">
          <h2 className="text-sm font-semibold text-[#EBEBEB]">Nova Interação</h2>
          <button
            onClick={onClose}
            className="text-[#87919E] hover:text-[#EBEBEB] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Type selector */}
          <div>
            <label className="text-xs text-[#87919E] mb-2 block">Tipo</label>
            <div className="grid grid-cols-4 gap-1.5">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`text-[10px] py-1.5 px-1 rounded-lg border transition-all text-center ${
                    type === t.value
                      ? 'bg-[#95BBE2]/20 border-[#95BBE2]/50 text-[#95BBE2] font-semibold'
                      : 'border-[#38435C] text-[#87919E] hover:border-[#95BBE2]/30 hover:text-[#EBEBEB]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-[#87919E] mb-2 block">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Descreva o que aconteceu nessa interação..."
              className="w-full bg-[#1B2B3A] border border-[#38435C] rounded-lg px-3 py-2.5 text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2]/50 resize-none"
            />
          </div>

          {error && <p className="text-xs text-[#EF4444]">{error}</p>}

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-[#87919E] hover:text-[#EBEBEB] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !description.trim()}
              className="px-4 py-2 text-sm bg-[#95BBE2] text-[#0A1E2C] font-semibold rounded-lg hover:bg-[#95BBE2]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
