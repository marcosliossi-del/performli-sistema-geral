'use client'

import { useState } from 'react'
import { ClientInteractionItem } from '@/lib/dal'
import { deleteInteraction } from '@/app/actions/interactions'
import { AddInteractionModal } from './AddInteractionModal'
import { timeAgo } from '@/lib/utils'
import { Trash2, Phone, Video, Mail, MessageCircle, FileText, Send, FileSignature, Plus } from 'lucide-react'

const typeConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  LIGACAO:           { label: 'Ligação',           icon: Phone,         color: 'text-[#3B82F6]  bg-[#3B82F6]/10'  },
  REUNIAO:           { label: 'Reunião',            icon: Video,         color: 'text-[#8B5CF6]  bg-[#8B5CF6]/10'  },
  EMAIL:             { label: 'E-mail',             icon: Mail,          color: 'text-[#F59E0B]  bg-[#F59E0B]/10'  },
  WHATSAPP:          { label: 'WhatsApp',           icon: MessageCircle, color: 'text-[#22C55E]  bg-[#22C55E]/10'  },
  NOTA:              { label: 'Nota',               icon: FileText,      color: 'text-[#87919E]  bg-[#87919E]/10'  },
  PROPOSTA_ENVIADA:  { label: 'Proposta Enviada',   icon: Send,          color: 'text-[#95BBE2]  bg-[#95BBE2]/10'  },
  CONTRATO_ASSINADO: { label: 'Contrato Assinado',  icon: FileSignature, color: 'text-[#22C55E]  bg-[#22C55E]/10'  },
}

interface Props {
  clientId: string
  interactions: ClientInteractionItem[]
}

export function InteractionTimeline({ clientId, interactions: initial }: Props) {
  const [items, setItems] = useState(initial)
  const [showModal, setShowModal] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeleting(id)
    setItems((prev) => prev.filter((i) => i.id !== id))
    try {
      await deleteInteraction(id)
    } catch {
      setItems(initial)
    } finally {
      setDeleting(null)
    }
  }

  function handleAdded(item: ClientInteractionItem) {
    setItems((prev) => [item, ...prev])
    setShowModal(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#EBEBEB]">Histórico de Interações</h3>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 text-xs bg-[#95BBE2]/15 hover:bg-[#95BBE2]/25 text-[#95BBE2] px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus size={12} />
          Nova interação
        </button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-8 text-[#87919E] text-sm">
          Nenhuma interação registrada ainda.
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[15px] top-0 bottom-0 w-px bg-[#38435C]" />

          <div className="space-y-4">
            {items.map((item) => {
              const cfg = typeConfig[item.type] ?? typeConfig['NOTA']
              const Icon = cfg.icon
              const [iconColor, iconBg] = cfg.color.split('  ')
              return (
                <div key={item.id} className="flex gap-3 relative">
                  {/* Icon dot */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${iconBg}`}>
                    <Icon size={14} className={iconColor} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 bg-[#1B2B3A] border border-[#38435C] rounded-lg p-3 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-xs font-semibold ${iconColor}`}>{cfg.label}</span>
                        <span className="text-[10px] text-[#87919E]">· {item.userName}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] text-[#87919E]">{timeAgo(new Date(item.createdAt))}</span>
                        <button
                          onClick={() => handleDelete(item.id)}
                          disabled={deleting === item.id}
                          className="text-[#87919E] hover:text-[#EF4444] transition-colors opacity-0 group-hover:opacity-100"
                          aria-label="Excluir"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-[#EBEBEB] leading-relaxed">{item.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showModal && (
        <AddInteractionModal
          clientId={clientId}
          onClose={() => setShowModal(false)}
          onAdded={handleAdded}
        />
      )}
    </div>
  )
}
