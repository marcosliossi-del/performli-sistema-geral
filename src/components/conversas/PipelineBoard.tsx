'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Kanban, Clock, User, Pencil, Check, X, ChevronDown } from 'lucide-react'
import type { PipelineBoardData } from '@/lib/conversas/dal'
import { moveLeadStage, upsertLeadValue, createDefaultPipeline } from '@/app/actions/conversas'
import { AutoRefresh } from './AutoRefresh'
import { LastUpdated } from './LastUpdated'
import { EmptyState } from '@/components/ui/EmptyState'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { fmtBRL, contactLabel } from '@/lib/conversas/format'

type ClientOption = { id: string; name: string }

interface Props {
  board: PipelineBoardData | null
  clients: ClientOption[]
  selectedClientId: string
  canEdit: boolean
  canCreatePipeline: boolean
}

export function PipelineBoard({
  board, clients, selectedClientId, canEdit, canCreatePipeline,
}: Props) {
  const router = useRouter()
  const [, startAction] = useTransition()

  function selectClient(clientId: string) {
    router.push(`/conversas?view=pipeline${clientId ? `&clientId=${clientId}` : ''}`)
  }

  function handleCreateDefault() {
    startAction(async () => {
      const res = await createDefaultPipeline(selectedClientId)
      if (res.ok) {
        toast('Funil padrão criado.', 'ok')
        router.refresh()
      } else {
        toast(res.error, 'err')
      }
    })
  }

  function handleMove(leadId: string, stageId: string, isLost: boolean) {
    let lostReason: string | undefined
    if (isLost) {
      const reason = window.prompt('Por que este lead foi perdido? (motivo para o histórico)')
      if (reason === null) return
      lostReason = reason.trim() || undefined
    }
    startAction(async () => {
      const res = await moveLeadStage(leadId, stageId, lostReason)
      if (res.ok) {
        toast('Lead movido no funil.', 'ok')
        router.refresh()
      } else {
        toast(res.error, 'err')
      }
    })
  }

  function handleValue(leadId: string, value: number | null) {
    startAction(async () => {
      const res = await upsertLeadValue(leadId, value)
      if (res.ok) {
        toast('Valor do lead atualizado.', 'ok')
        router.refresh()
      } else {
        toast(res.error, 'err')
      }
    })
  }

  const clientSelector = (
    <select
      value={selectedClientId}
      onChange={(e) => selectClient(e.target.value)}
      className="h-9 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] px-2.5 focus:outline-none focus:border-[#95BBE2]"
    >
      <option value="">Selecione um cliente...</option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  )

  // Sem cliente selecionado.
  if (!selectedClientId) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="mb-3">{clientSelector}</div>
        <EmptyState
          icon={<Kanban size={20} />}
          title="Escolha um cliente para ver o funil"
          description="Cada cliente tem seu próprio funil de leads vindos do WhatsApp. Selecione um cliente acima."
        />
      </div>
    )
  }

  // Cliente sem pipeline.
  if (!board || !board.pipeline) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="mb-3">{clientSelector}</div>
        <EmptyState
          icon={<Kanban size={20} />}
          title="Este cliente ainda não tem funil"
          description={
            canCreatePipeline
              ? 'Crie o funil padrão (Novo → Em atendimento → Qualificado → Proposta → Ganhou/Perdeu) para organizar os leads deste cliente.'
              : 'O funil ainda não foi criado. Peça a um administrador ou supervisor para criar o funil padrão deste cliente.'
          }
          action={
            canCreatePipeline ? (
              <button
                type="button"
                onClick={handleCreateDefault}
                className="inline-flex items-center text-xs font-semibold text-[#021015] bg-gradient-to-b from-[#54e0ee] to-[#22c2d6] rounded-lg px-3.5 py-2"
              >
                Criar funil padrão
              </button>
            ) : undefined
          }
        />
      </div>
    )
  }

  const stages = board.stages
  const totalLeads = stages.reduce((s, st) => s + st.leads.length, 0)

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <AutoRefresh />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {clientSelector}
        <span className="text-sm text-[#87919E]">
          {board.pipeline.name} · {totalLeads} {totalLeads === 1 ? 'lead' : 'leads'}
        </span>
        <div className="ml-auto">
          <LastUpdated at={board.lastUpdated} />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-x-auto">
        <div className="flex gap-3 h-full pb-2" style={{ minWidth: 'min-content' }}>
          {stages.map((stage) => (
            <div
              key={stage.id}
              className="w-[280px] flex-shrink-0 flex flex-col rounded-xl border border-[#38435C] bg-[#0D2137] max-h-full"
            >
              <div className="px-3 py-2.5 border-b border-[#38435C] flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: stage.color ?? '#647488' }}
                />
                <p className="text-sm font-semibold text-[#EBEBEB] truncate flex-1">{stage.name}</p>
                <span className="text-[11px] text-[#647488]">{stage.leads.length}</span>
              </div>
              {stage.totalValue > 0 && (
                <div className="px-3 py-1.5 border-b border-[#38435C]/60 text-[11px] text-[#22C55E]">
                  {fmtBRL(stage.totalValue)} em aberto
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {stage.leads.length === 0 && (
                  <p className="text-[11px] text-[#647488] text-center py-4">Sem leads aqui</p>
                )}
                {stage.leads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    stages={stages}
                    currentStageId={stage.id}
                    canEdit={canEdit}
                    onMove={handleMove}
                    onValue={handleValue}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function LeadCard({
  lead, stages, currentStageId, canEdit, onMove, onValue,
}: {
  lead: PipelineBoardData['stages'][number]['leads'][number]
  stages: PipelineBoardData['stages']
  currentStageId: string
  canEdit: boolean
  onMove: (leadId: string, stageId: string, isLost: boolean) => void
  onValue: (leadId: string, value: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(lead.value != null ? String(lead.value) : '')
  const [menuOpen, setMenuOpen] = useState(false)

  function saveValue() {
    const trimmed = draft.trim().replace(',', '.')
    if (trimmed === '') {
      onValue(lead.id, null)
    } else {
      const n = Number(trimmed)
      if (Number.isNaN(n) || n < 0) {
        toast('Informe um valor numérico válido.', 'err')
        return
      }
      onValue(lead.id, n)
    }
    setEditing(false)
  }

  return (
    <div className="rounded-lg border border-[#38435C] bg-[#0A1E2C] p-2.5">
      <p className="text-sm font-medium text-[#EBEBEB] truncate">{contactLabel(lead)}</p>
      {lead.contactPhone && (
        <p className="text-[11px] text-[#647488] truncate">{lead.contactPhone}</p>
      )}

      {/* Valor */}
      <div className="flex items-center gap-1.5 mt-1.5">
        {editing ? (
          <>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveValue()
                if (e.key === 'Escape') setEditing(false)
              }}
              placeholder="0,00"
              className="w-24 h-7 rounded bg-[#0D2137] border border-[#38435C] text-xs text-[#EBEBEB] px-2 focus:outline-none focus:border-[#95BBE2]"
            />
            <button type="button" onClick={saveValue} aria-label="Salvar valor" className="text-[#22C55E]">
              <Check size={14} />
            </button>
            <button type="button" onClick={() => setEditing(false)} aria-label="Cancelar" className="text-[#647488]">
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <span className="text-xs font-semibold text-[#22C55E]">{fmtBRL(lead.value)}</span>
            {canEdit && (
              <button
                type="button"
                onClick={() => { setDraft(lead.value != null ? String(lead.value) : ''); setEditing(true) }}
                aria-label="Editar valor"
                className="text-[#647488] hover:text-[#EBEBEB]"
              >
                <Pencil size={12} />
              </button>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2 mt-2 text-[10px] text-[#647488]">
        <span className="inline-flex items-center gap-1">
          <Clock size={11} />
          {lead.daysInStage === 0 ? 'hoje' : `${lead.daysInStage}d no estágio`}
        </span>
        {lead.source && <span className="truncate">· {lead.source}</span>}
      </div>
      <div className="flex items-center gap-1 mt-1 text-[10px] text-[#647488]">
        <User size={11} />
        {lead.owner ? lead.owner.name : 'Sem responsável'}
      </div>

      {/* Mover de estágio */}
      {canEdit && (
        <div className="relative mt-2">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="w-full inline-flex items-center justify-between gap-1 text-[11px] text-[#a3b2c2] border border-[#38435C] rounded px-2 py-1 hover:text-[#EBEBEB]"
          >
            Mover para... <ChevronDown size={12} />
          </button>
          {menuOpen && (
            <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-[#38435C] bg-[#0D2137] shadow-lg overflow-hidden">
              {stages
                .filter((s) => s.id !== currentStageId)
                .map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { setMenuOpen(false); onMove(lead.id, s.id, s.isLost) }}
                    className="w-full text-left text-[11px] text-[#EBEBEB] px-2.5 py-1.5 hover:bg-white/[0.05]"
                  >
                    {s.name}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
