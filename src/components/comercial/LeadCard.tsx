'use client'

import { useState } from 'react'
import { Building2, Phone, Mail, DollarSign, Calendar, MoreVertical, Flame, Tag } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { Lead } from './types'
import { HOT_STATUSES } from './types'

function getSourceColor(source: string | null): string {
  if (!source) return '#87919E'
  if (source === 'WhatsApp') return '#25D366'
  const lower = source.toLowerCase()
  if (lower.includes('facebook') || lower.includes('meta') || lower.includes('instagram')) return '#1877F2'
  if (lower.includes('google')) return '#EA4335'
  return '#87919E'
}

interface Props {
  lead: Lead
  onEdit:   (lead: Lead) => void
  onDelete: (id: string) => void
}

export function LeadCard({ lead, onEdit, onDelete }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isHot = HOT_STATUSES.includes(lead.status)

  const sourceColor = getSourceColor(lead.source)

  const daysInStage = Math.floor(
    (Date.now() - new Date(lead.updatedAt).getTime()) / (1000 * 60 * 60 * 24),
  )

  return (
    <div className="bg-[#0A1E2C] border border-[#38435C] rounded-lg p-3 cursor-grab active:cursor-grabbing select-none group relative">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {isHot && <Flame size={12} className="text-[#F59E0B] flex-shrink-0" />}
          <span className="text-sm font-semibold text-[#EBEBEB] truncate">{lead.name}</span>
        </div>
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-[#87919E] hover:text-[#EBEBEB] flex-shrink-0"
        >
          <MoreVertical size={14} />
        </button>
      </div>

      {/* Dropdown */}
      {menuOpen && (
        <div
          className="absolute right-2 top-8 z-20 bg-[#0D2137] border border-[#38435C] rounded-lg shadow-xl py-1 min-w-[130px]"
          onMouseLeave={() => setMenuOpen(false)}
        >
          <button
            onClick={() => { setMenuOpen(false); onEdit(lead) }}
            className="w-full text-left px-3 py-1.5 text-xs text-[#EBEBEB] hover:bg-[#38435C]/40 transition-colors"
          >
            Editar lead
          </button>
          <button
            onClick={() => { setMenuOpen(false); onDelete(lead.id) }}
            className="w-full text-left px-3 py-1.5 text-xs text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors"
          >
            Remover
          </button>
        </div>
      )}

      {/* Source badge + UTM campaign */}
      {(lead.source || lead.utmCampaign) && (
        <div className="mb-2 space-y-1">
          {lead.source && (
            <span
              className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{
                color: sourceColor,
                border: `1px solid ${sourceColor}40`,
                background: `${sourceColor}18`,
              }}
            >
              {lead.source}
            </span>
          )}
          {lead.utmCampaign && (
            <div className="flex items-center gap-1">
              <Tag size={9} className="text-[#87919E] flex-shrink-0" />
              <span className="text-[10px] text-[#87919E] truncate">{lead.utmCampaign}</span>
            </div>
          )}
        </div>
      )}

      {/* Company */}
      {lead.company && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <Building2 size={11} className="text-[#87919E] flex-shrink-0" />
          <span className="text-xs text-[#87919E] truncate">{lead.company}</span>
        </div>
      )}

      {/* Contact info */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
        {lead.phone && (
          <div className="flex items-center gap-1">
            <Phone size={10} className="text-[#87919E]" />
            <span className="text-xs text-[#87919E]">{lead.phone}</span>
          </div>
        )}
        {lead.email && (
          <div className="flex items-center gap-1 min-w-0">
            <Mail size={10} className="text-[#87919E] flex-shrink-0" />
            <span className="text-xs text-[#87919E] truncate">{lead.email}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-[#38435C]/50">
        {lead.value ? (
          <div className="flex items-center gap-1">
            <DollarSign size={11} className="text-[#22C55E]" />
            <span className="text-xs font-semibold text-[#22C55E]">{formatCurrency(lead.value)}</span>
          </div>
        ) : (
          <span className="text-xs text-[#87919E]">Sem valor</span>
        )}

        <div className="flex items-center gap-2">
          {lead.expectedCloseAt && (
            <div className="flex items-center gap-1">
              <Calendar size={10} className="text-[#87919E]" />
              <span className="text-xs text-[#87919E]">
                {new Date(lead.expectedCloseAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
              </span>
            </div>
          )}
          <span className="text-xs text-[#87919E]">há {daysInStage} dia{daysInStage !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  )
}
