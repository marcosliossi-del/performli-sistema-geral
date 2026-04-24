'use client'

import { useState, useCallback, useMemo } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { Plus, X, ChevronRight, Activity } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { LeadCard } from './LeadCard'
import { NewLeadDialog } from './NewLeadDialog'
import { ActivityFeed } from './ActivityFeed'
import type { Lead, LeadStatus, Activity as ActivityType } from './types'
import { KANBAN_STAGES, STAGE_CONFIG } from './types'

interface Props {
  initialLeads: Lead[]
}

export function LeadKanban({ initialLeads }: Props) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [detailLead, setDetailLead] = useState<Lead | null>(null)
  const [sourceFilter, setSourceFilter] = useState<string | null>(null)
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null)

  const uniqueSources = useMemo(
    () => Array.from(new Set(leads.map(l => l.source).filter((s): s is string => s != null))),
    [leads],
  )

  const uniqueCampaigns = useMemo(
    () => Array.from(new Set(leads.map(l => l.utmCampaign).filter((c): c is string => c != null))),
    [leads],
  )

  const visibleLeads = useMemo(
    () => leads.filter(l => {
      if (sourceFilter   && l.source      !== sourceFilter)   return false
      if (campaignFilter && l.utmCampaign !== campaignFilter) return false
      return true
    }),
    [leads, sourceFilter, campaignFilter],
  )

  const byStage = useCallback(
    (status: LeadStatus) => visibleLeads.filter(l => l.status === status),
    [visibleLeads],
  )

  async function onDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const newStatus = destination.droppableId as LeadStatus

    setLeads(prev =>
      prev.map(l => (l.id === draggableId ? { ...l, status: newStatus } : l)),
    )

    try {
      const res = await fetch(`/api/comercial/leads/${draggableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const orig = initialLeads.find(l => l.id === draggableId)
        if (orig) setLeads(prev => prev.map(l => (l.id === draggableId ? orig : l)))
      }
    } catch {
      const orig = leads.find(l => l.id === draggableId)
      if (orig) setLeads(prev => prev.map(l => (l.id === draggableId ? orig : l)))
    }
  }

  function handleSave(saved: Lead) {
    setLeads(prev => {
      const idx = prev.findIndex(l => l.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next
      }
      return [saved, ...prev]
    })
    if (detailLead?.id === saved.id) setDetailLead(saved)
  }

  function handleDelete(id: string) {
    fetch(`/api/comercial/leads/${id}`, { method: 'DELETE' })
    setLeads(prev => prev.filter(l => l.id !== id))
    if (detailLead?.id === id) setDetailLead(null)
  }

  function handleActivity(activity: ActivityType) {
    if (!detailLead) return
    setLeads(prev =>
      prev.map(l =>
        l.id === detailLead.id
          ? { ...l, activities: [activity, ...l.activities] }
          : l,
      ),
    )
    setDetailLead(prev => prev ? { ...prev, activities: [activity, ...prev.activities] } : prev)
  }

  function openEdit(lead: Lead) {
    setEditingLead(lead)
    setDialogOpen(true)
  }

  function openNew() {
    setEditingLead(null)
    setDialogOpen(true)
  }

  const filtersActive = sourceFilter !== null || campaignFilter !== null
  const pillBase = 'text-xs rounded-full px-3 py-1 cursor-pointer transition-colors'
  const pillInactive = `${pillBase} bg-[#38435C]/40 text-[#87919E] hover:bg-[#38435C]/70`
  const pillActive = `${pillBase} bg-[#95BBE2]/20 text-[#95BBE2] border border-[#95BBE2]/40`

  return (
    <>
      {/* Filter bar */}
      <div className="mb-4 space-y-2">
        {/* Row 1 — Source */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={sourceFilter === null ? pillActive : pillInactive}
            onClick={() => setSourceFilter(null)}
          >
            Todas
          </button>
          {uniqueSources.map(src => (
            <button
              key={src}
              className={sourceFilter === src ? pillActive : pillInactive}
              onClick={() => setSourceFilter(prev => prev === src ? null : src)}
            >
              {src}
            </button>
          ))}
          {filtersActive && (
            <span className="text-xs text-[#87919E] ml-2">
              {visibleLeads.length} lead{visibleLeads.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Row 2 — Campaign (only if any lead has utmCampaign) */}
        {uniqueCampaigns.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              className={campaignFilter === null ? pillActive : pillInactive}
              onClick={() => setCampaignFilter(null)}
            >
              Todas campanhas
            </button>
            {uniqueCampaigns.map(camp => (
              <button
                key={camp}
                className={campaignFilter === camp ? pillActive : pillInactive}
                onClick={() => setCampaignFilter(prev => prev === camp ? null : camp)}
              >
                {camp}
              </button>
            ))}
          </div>
        )}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 min-h-[calc(100vh-200px)]">
          {KANBAN_STAGES.map(status => {
            const cfg = STAGE_CONFIG[status]
            const stageleads = byStage(status)
            const total = stageleads.reduce((s, l) => s + (l.value ?? 0), 0)

            return (
              <div
                key={status}
                className="flex-shrink-0 w-72 flex flex-col"
              >
                {/* Column header */}
                <div className={`rounded-xl border ${cfg.border} ${cfg.bg} px-3 py-2.5 mb-2`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold" style={{ color: cfg.color }}>
                        {cfg.label}
                      </span>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-white/10 text-[#87919E]">
                        {stageleads.length}
                      </span>
                    </div>
                    {total > 0 && (
                      <span className="text-[10px] text-[#87919E]">{formatCurrency(total)}</span>
                    )}
                  </div>
                </div>

                {/* Cards */}
                <Droppable droppableId={status}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 space-y-2 rounded-xl p-2 transition-colors min-h-[80px] ${
                        snapshot.isDraggingOver ? 'bg-[#38435C]/20' : ''
                      }`}
                    >
                      {stageleads.map((lead, index) => (
                        <Draggable key={lead.id} draggableId={lead.id} index={index}>
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              className={snap.isDragging ? 'opacity-80 rotate-1' : ''}
                              onClick={() => setDetailLead(lead)}
                            >
                              <LeadCard
                                lead={lead}
                                onEdit={openEdit}
                                onDelete={handleDelete}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            )
          })}

          {/* Add column */}
          <div className="flex-shrink-0 w-12 flex items-start justify-center pt-3">
            <button
              onClick={openNew}
              className="w-8 h-8 rounded-full bg-[#38435C]/40 hover:bg-[#38435C]/70 flex items-center justify-center text-[#87919E] hover:text-[#EBEBEB] transition-colors"
              title="Novo lead"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </DragDropContext>

      {/* New / Edit dialog */}
      <NewLeadDialog
        open={dialogOpen}
        lead={editingLead}
        onClose={() => setDialogOpen(false)}
        onSave={lead => { handleSave(lead); setDialogOpen(false) }}
      />

      {/* Lead detail slide-over */}
      {detailLead && (
        <div className="fixed inset-0 z-40 flex" onClick={() => setDetailLead(null)}>
          <div className="flex-1" />
          <div
            className="w-full max-w-md bg-[#0D2137] border-l border-[#38435C] h-full overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Slide-over header */}
            <div className="sticky top-0 bg-[#0D2137] border-b border-[#38435C] px-5 py-4 z-10">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-[#EBEBEB] truncate">{detailLead.name}</h3>
                  {detailLead.company && (
                    <p className="text-xs text-[#87919E] mt-0.5">{detailLead.company}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => openEdit(detailLead)}
                    className="text-xs text-[#95BBE2] hover:text-[#EBEBEB] transition-colors px-2 py-1 border border-[#38435C] rounded-lg"
                  >
                    Editar
                  </button>
                  <button onClick={() => setDetailLead(null)} className="text-[#87919E] hover:text-[#EBEBEB] transition-colors">
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Status badge */}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${STAGE_CONFIG[detailLead.status].border} ${STAGE_CONFIG[detailLead.status].bg}`}
                  style={{ color: STAGE_CONFIG[detailLead.status].color }}
                >
                  {STAGE_CONFIG[detailLead.status].label}
                </span>
                {detailLead.value != null && (
                  <span className="text-xs font-semibold text-[#22C55E]">{formatCurrency(detailLead.value)}</span>
                )}
                {detailLead.probability != null && (
                  <span className="text-xs text-[#87919E]">{detailLead.probability}% prob.</span>
                )}
              </div>
            </div>

            {/* Details */}
            <div className="px-5 py-4 space-y-4">
              {/* Quick info */}
              {(detailLead.email || detailLead.phone || detailLead.source || detailLead.expectedCloseAt) && (
                <div className="bg-[#38435C]/20 border border-[#38435C] rounded-xl p-3 space-y-2">
                  {detailLead.email && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[#87919E] w-16">E-mail</span>
                      <span className="text-xs text-[#EBEBEB]">{detailLead.email}</span>
                    </div>
                  )}
                  {detailLead.phone && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[#87919E] w-16">Telefone</span>
                      <span className="text-xs text-[#EBEBEB]">{detailLead.phone}</span>
                    </div>
                  )}
                  {detailLead.source && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[#87919E] w-16">Origem</span>
                      <span className="text-xs text-[#EBEBEB]">{detailLead.source}</span>
                    </div>
                  )}
                  {detailLead.expectedCloseAt && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[#87919E] w-16">Previsão</span>
                      <span className="text-xs text-[#EBEBEB]">
                        {new Date(detailLead.expectedCloseAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {detailLead.notes && (
                <div>
                  <p className="text-[10px] text-[#87919E] mb-1.5 uppercase tracking-wider">Notas</p>
                  <p className="text-xs text-[#EBEBEB] leading-relaxed bg-[#38435C]/20 border border-[#38435C] rounded-xl p-3">
                    {detailLead.notes}
                  </p>
                </div>
              )}

              {/* Move to next stage shortcut */}
              {KANBAN_STAGES.indexOf(detailLead.status) < KANBAN_STAGES.length - 1 && (
                <button
                  onClick={async () => {
                    const nextIdx = KANBAN_STAGES.indexOf(detailLead.status) + 1
                    const nextStatus = KANBAN_STAGES[nextIdx]
                    const res = await fetch(`/api/comercial/leads/${detailLead.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: nextStatus }),
                    })
                    if (res.ok) {
                      const updated = await res.json()
                      handleSave(updated)
                      setDetailLead(updated)
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-[#38435C] text-xs text-[#87919E] hover:text-[#EBEBEB] hover:border-[#95BBE2] transition-colors"
                >
                  <ChevronRight size={14} />
                  Avançar para {STAGE_CONFIG[KANBAN_STAGES[KANBAN_STAGES.indexOf(detailLead.status) + 1]].label}
                </button>
              )}

              {/* Activity feed */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Activity size={13} className="text-[#87919E]" />
                  <p className="text-[10px] text-[#87919E] uppercase tracking-wider">Atividades</p>
                </div>
                <ActivityFeed lead={detailLead} onActivity={handleActivity} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
