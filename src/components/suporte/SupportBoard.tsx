'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import type { TaskStatus, SupportDirection } from '@prisma/client'
import { updateTaskStatus } from '@/app/actions/tasks'
import { timeAgo } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { GripVertical, User, ArrowRightLeft, AlarmClock } from 'lucide-react'

// Card serializável entregue pelo server component (page.tsx).
export type SupportCardData = {
  id: string
  title: string
  status: TaskStatus
  supportDirection: SupportDirection | null
  clientName: string | null
  clientSlug: string | null
  assigneeName: string | null
  updatedAt: string // ISO — usamos como PROXY do "tempo neste estágio"
}

// As 6 colunas do Hub de Suporte, na ordem operacional do atendimento.
const COLUMNS: { key: TaskStatus; label: string; color: string }[] = [
  { key: 'A_FAZER',            label: 'A fazer',            color: '#87919E' },
  { key: 'EM_ANDAMENTO',       label: 'Em andamento',       color: '#95BBE2' },
  { key: 'EM_VALIDACAO',       label: 'Validação interna',  color: '#A78BFA' },
  { key: 'AGUARDANDO_CLIENTE', label: 'Aguardando cliente', color: '#F59E0B' },
  { key: 'AJUSTES_SOLICITADOS',label: 'Em alteração & ajuste', color: '#F97316' },
  { key: 'CONCLUIDO',          label: 'Concluído',          color: '#22C55E' },
]

const COLUMN_KEYS = new Set<TaskStatus>(COLUMNS.map((c) => c.key))

// T-12: rótulos operacionais dos status que NÃO têm coluna própria mas podem
// aparecer numa demanda de suporte. Sem esta coluna catch-all eles somem do
// board (demanda engolida). Card fica arrastável para uma das colunas normais.
const OTHER_STATUS_LABEL: Partial<Record<TaskStatus, string>> = {
  AGUARDANDO_CS: 'Aguardando CS',
  AGUARDANDO_GESTOR: 'Aguardando gestor',
  BLOQUEADO: 'Bloqueado',
  ATRASADO: 'Atrasado',
}

function otherStatusLabel(status: TaskStatus): string {
  return OTHER_STATUS_LABEL[status] ?? status
}

const DAY_MS = 86_400_000

// SLA leve: aguardando cliente cobra em 3 dias; demais colunas alertam em 5.
function slaWarning(status: TaskStatus, updatedAt: string): string | null {
  if (status === 'CONCLUIDO') return null
  const days = (Date.now() - new Date(updatedAt).getTime()) / DAY_MS
  if (status === 'AGUARDANDO_CLIENTE') {
    return days > 3 ? 'Parado há mais de 3 dias — cobrar o cliente' : null
  }
  return days > 5 ? 'Parado há mais de 5 dias — retomar a demanda' : null
}

interface Props {
  initialCards: SupportCardData[]
}

export function SupportBoard({ initialCards }: Props) {
  const [cards, setCards] = useState<SupportCardData[]>(initialCards)
  const draggingId = useRef<string | null>(null)
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null)

  function handleDragStart(id: string) {
    draggingId.current = id
  }

  function handleDragOver(e: React.DragEvent, status: TaskStatus) {
    e.preventDefault()
    setDragOver(status)
  }

  function handleDragLeave() {
    setDragOver(null)
  }

  async function handleDrop(e: React.DragEvent, status: TaskStatus) {
    e.preventDefault()
    setDragOver(null)
    const id = draggingId.current
    draggingId.current = null
    if (!id) return
    const card = cards.find((c) => c.id === id)
    if (!card || card.status === status) return

    const previous = card.status
    // Optimistic: move o card e "reinicia" o tempo no estágio.
    setCards((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, status, updatedAt: new Date().toISOString() } : c,
      ),
    )

    const rollback = (msg: string) => {
      setCards((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, status: previous, updatedAt: card.updatedAt } : c,
        ),
      )
      toast(msg, 'err')
    }

    try {
      // updateTaskStatus normalmente retorna void; o guard de conclusão pode
      // LANÇAR com a mensagem operacional. Tratamos ambos os retornos.
      const r: unknown = await updateTaskStatus(id, status)
      if (
        r &&
        typeof r === 'object' &&
        'error' in r &&
        typeof (r as { error?: unknown }).error === 'string'
      ) {
        rollback((r as { error: string }).error)
      }
    } catch (err) {
      rollback(
        err instanceof Error && err.message
          ? err.message
          : 'Não foi possível mover a demanda. A mudança não foi salva.',
      )
    }
  }

  const byStatus = (status: TaskStatus) => cards.filter((c) => c.status === status)
  // T-12: tudo que não cai numa das 6 colunas vai para "Outros" (catch-all).
  const otherCards = cards.filter((c) => !COLUMN_KEYS.has(c.status))

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 flex-1 min-h-0">
      {COLUMNS.map((col) => {
        const colCards = byStatus(col.key)
        const isOver = dragOver === col.key
        return (
          <div
            key={col.key}
            className={`flex flex-col flex-shrink-0 w-72 rounded-xl border transition-all duration-150 ${
              isOver ? 'border-[#95BBE2]/50 bg-[#1B2B3A]/80' : 'border-[#38435C] bg-[#1B2B3A]/40'
            }`}
            onDragOver={(e) => handleDragOver(e, col.key)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.key)}
          >
            {/* Cabeçalho da coluna */}
            <div className="px-4 py-3 border-b border-[#38435C] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                <span className="text-sm font-semibold" style={{ color: col.color }}>
                  {col.label}
                </span>
              </div>
              <span className="text-xs text-[#87919E] bg-[#38435C]/60 px-2 py-0.5 rounded-full">
                {colCards.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2 p-3 overflow-y-auto flex-1">
              {colCards.length === 0 && (
                <div
                  className={`border border-dashed rounded-lg p-4 text-center transition-all ${
                    isOver ? 'border-[#95BBE2]/50 bg-[#95BBE2]/5' : 'border-[#38435C]'
                  }`}
                >
                  <p className="text-xs text-[#87919E]">Nada aqui</p>
                </div>
              )}
              {colCards.map((card) => (
                <SupportCard
                  key={card.id}
                  card={card}
                  onDragStart={() => handleDragStart(card.id)}
                />
              ))}
            </div>
          </div>
        )
      })}

      {/* T-12: coluna catch-all "Outros" — só renderiza quando há demanda em
          status sem coluna própria. Não aceita drop (não é um estado único);
          serve para tornar a demanda VISÍVEL e permitir arrastá-la de volta para
          uma coluna operacional. */}
      {otherCards.length > 0 && (
        <div className="flex flex-col flex-shrink-0 w-72 rounded-xl border border-dashed border-[#F59E0B]/40 bg-[#1B2B3A]/40">
          <div className="px-4 py-3 border-b border-[#38435C] flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#F59E0B' }} />
              <span className="text-sm font-semibold text-[#F59E0B]">Outros status</span>
            </div>
            <span className="text-xs text-[#87919E] bg-[#38435C]/60 px-2 py-0.5 rounded-full">
              {otherCards.length}
            </span>
          </div>
          <div className="flex flex-col gap-2 p-3 overflow-y-auto flex-1">
            <p className="text-[10px] text-[#87919E]/80 mb-1">
              Fora do fluxo padrão de suporte. Arraste para a coluna certa para retomar.
            </p>
            {otherCards.map((card) => (
              <SupportCard
                key={card.id}
                card={card}
                onDragStart={() => handleDragStart(card.id)}
                statusLabel={otherStatusLabel(card.status)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SupportCard({
  card,
  onDragStart,
  statusLabel,
}: {
  card: SupportCardData
  onDragStart: () => void
  statusLabel?: string
}) {
  const warning = slaWarning(card.status, card.updatedAt)
  const isClientToUs = card.supportDirection === 'CLIENTE_PARA_NOS'

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={`bg-[#0A1E2C] border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-[#95BBE2]/40 transition-all group ${
        warning ? 'border-[#F59E0B]/50' : 'border-[#38435C]'
      }`}
    >
      {statusLabel && (
        <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full mb-2 bg-[#F59E0B]/12 text-[#F59E0B]">
          {statusLabel}
        </span>
      )}
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-[#EBEBEB] line-clamp-2 flex-1">
          {card.title}
        </p>
        <GripVertical
          size={14}
          className="text-[#87919E] flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </div>

      {/* Direção da demanda */}
      {card.supportDirection && (
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full mb-2 ${
            isClientToUs
              ? 'bg-[#95BBE2]/12 text-[#95BBE2]'
              : 'bg-[#F59E0B]/12 text-[#F59E0B]'
          }`}
        >
          <ArrowRightLeft size={9} />
          {isClientToUs ? 'Cliente → Nós' : 'Nós → Cliente'}
        </span>
      )}

      {/* Cliente vinculado */}
      {card.clientName && (
        <div className="mb-1.5">
          {card.clientSlug ? (
            <Link
              href={`/clients/${card.clientSlug}`}
              className="text-xs text-[#95BBE2] hover:underline"
              onClick={(e) => e.stopPropagation()}
              draggable={false}
            >
              {card.clientName}
            </Link>
          ) : (
            <span className="text-xs text-[#87919E]">{card.clientName}</span>
          )}
        </div>
      )}

      {/* Responsável */}
      <div className="flex items-center gap-1.5 text-[10px] text-[#87919E]">
        <User size={10} className="flex-shrink-0" />
        <span className="truncate">{card.assigneeName ?? 'Sem responsável'}</span>
      </div>

      {/* Tempo no estágio (updatedAt é PROXY do tempo neste estágio) */}
      <p className="text-[10px] text-[#87919E]/70 mt-1.5 border-t border-[#38435C] pt-1.5">
        há {timeAgo(new Date(card.updatedAt))} neste estágio
      </p>

      {/* SLA leve — impacto de não agir */}
      {warning && (
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#F59E0B] mt-1.5">
          <AlarmClock size={10} className="flex-shrink-0" />
          <span>{warning}</span>
        </div>
      )}
    </div>
  )
}
