'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { PipelineClient } from '@/lib/dal'
import { updatePipelineStage } from '@/app/actions/interactions'
import { PipelineStage } from '@prisma/client'
import { formatCurrency } from '@/lib/utils'
import { Phone, Mail, Tag, GripVertical } from 'lucide-react'

const STAGES: { key: PipelineStage; label: string; color: string; bg: string }[] = [
  { key: 'LEAD',        label: 'Lead',        color: 'text-[#87919E]',  bg: 'bg-[#87919E]/10 border-[#87919E]/20' },
  { key: 'PROPOSTA',    label: 'Proposta',    color: 'text-[#F59E0B]',  bg: 'bg-[#F59E0B]/10 border-[#F59E0B]/20' },
  { key: 'NEGOCIACAO',  label: 'Negociação',  color: 'text-[#3B82F6]',  bg: 'bg-[#3B82F6]/10 border-[#3B82F6]/20' },
  { key: 'ATIVO',       label: 'Ativo',       color: 'text-[#22C55E]',  bg: 'bg-[#22C55E]/10 border-[#22C55E]/20' },
  { key: 'CHURNED',     label: 'Churned',     color: 'text-[#EF4444]',  bg: 'bg-[#EF4444]/10 border-[#EF4444]/20' },
]

interface Props {
  initialClients: PipelineClient[]
}

export function PipelineBoard({ initialClients }: Props) {
  const [clients, setClients] = useState<PipelineClient[]>(initialClients)
  const draggingId = useRef<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null)

  function handleDragStart(clientId: string) {
    draggingId.current = clientId
  }

  function handleDragOver(e: React.DragEvent, stage: PipelineStage) {
    e.preventDefault()
    setDragOverStage(stage)
  }

  function handleDragLeave() {
    setDragOverStage(null)
  }

  async function handleDrop(e: React.DragEvent, stage: PipelineStage) {
    e.preventDefault()
    setDragOverStage(null)
    const id = draggingId.current
    if (!id) return
    const client = clients.find((c) => c.id === id)
    if (!client || client.pipelineStage === stage) return

    // Optimistic update
    setClients((prev) =>
      prev.map((c) => (c.id === id ? { ...c, pipelineStage: stage } : c))
    )

    try {
      await updatePipelineStage(id, stage)
    } catch {
      // Rollback
      setClients((prev) =>
        prev.map((c) => (c.id === id ? { ...c, pipelineStage: client.pipelineStage } : c))
      )
    }
  }

  const byStage = (stage: PipelineStage) =>
    clients.filter((c) => c.pipelineStage === stage)

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 flex-1 min-h-0">
      {STAGES.map((stage) => {
        const stageClients = byStage(stage.key)
        const isOver = dragOverStage === stage.key
        return (
          <div
            key={stage.key}
            className={`flex flex-col flex-shrink-0 w-72 rounded-xl border transition-all duration-150 ${
              isOver ? 'border-[#95BBE2]/50 bg-[#1B2B3A]/80' : 'border-[#38435C] bg-[#1B2B3A]/40'
            }`}
            onDragOver={(e) => handleDragOver(e, stage.key)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, stage.key)}
          >
            {/* Column header */}
            <div className="px-4 py-3 border-b border-[#38435C] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${stage.color.replace('text-', 'bg-')}`} />
                <span className={`text-sm font-semibold ${stage.color}`}>{stage.label}</span>
              </div>
              <span className="text-xs text-[#87919E] bg-[#38435C]/60 px-2 py-0.5 rounded-full">
                {stageClients.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2 p-3 overflow-y-auto flex-1">
              {stageClients.length === 0 && (
                <div className={`border border-dashed rounded-lg p-4 text-center transition-all ${
                  isOver ? `${stage.bg} border-current` : 'border-[#38435C]'
                }`}>
                  <p className="text-xs text-[#87919E]">Soltar aqui</p>
                </div>
              )}
              {stageClients.map((client) => (
                <ClientCard
                  key={client.id}
                  client={client}
                  onDragStart={() => handleDragStart(client.id)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ClientCard({
  client,
  onDragStart,
}: {
  client: PipelineClient
  onDragStart: () => void
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="bg-[#0A1E2C] border border-[#38435C] rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-[#95BBE2]/40 transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <Link
          href={`/clients/${client.slug}`}
          className="text-sm font-semibold text-[#EBEBEB] hover:text-[#95BBE2] transition-colors line-clamp-2 flex-1"
          onClick={(e) => e.stopPropagation()}
        >
          {client.name}
        </Link>
        <GripVertical size={14} className="text-[#87919E] flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {client.industry && (
        <p className="text-xs text-[#87919E] mb-2">{client.industry}</p>
      )}

      {client.contractValue && (
        <p className="text-xs font-semibold text-[#22C55E] mb-2">
          {formatCurrency(client.contractValue)}
        </p>
      )}

      <div className="flex flex-col gap-1">
        {client.email && (
          <div className="flex items-center gap-1.5 text-[10px] text-[#87919E]">
            <Mail size={10} className="flex-shrink-0" />
            <span className="truncate">{client.email}</span>
          </div>
        )}
        {client.phone && (
          <div className="flex items-center gap-1.5 text-[10px] text-[#87919E]">
            <Phone size={10} className="flex-shrink-0" />
            <span>{client.phone}</span>
          </div>
        )}
      </div>

      {client.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {client.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-[#38435C]/80 text-[#87919E]"
            >
              <Tag size={8} />
              {tag}
            </span>
          ))}
          {client.tags.length > 3 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#38435C]/80 text-[#87919E]">
              +{client.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {client.primaryManager && (
        <p className="text-[10px] text-[#87919E] mt-2 border-t border-[#38435C] pt-1.5">
          {client.primaryManager}
        </p>
      )}
    </div>
  )
}
