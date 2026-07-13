'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Send, Check, CheckCheck, Clock, AlertTriangle, User } from 'lucide-react'
import type { ThreadData } from '@/lib/conversas/dal'
import {
  sendConversationMessage,
  assignConversation,
  setConversationStatus,
  markConversationRead,
} from '@/app/actions/conversas'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import {
  fmtTime,
  fmtDay,
  windowLabel,
  contactLabel,
  leadStatusLabel,
  fmtBRL,
} from '@/lib/conversas/format'

type StaffOption = { id: string; name: string }

interface Props {
  thread: ThreadData
  staff: StaffOption[]
  currentUserId: string
  canReply: boolean
  /** href de retorno (mobile / lista) — remove o conversationId da URL. */
  backHref: string
}

const STATUS_OPTIONS: { value: 'OPEN' | 'PENDING' | 'CLOSED'; label: string }[] = [
  { value: 'OPEN', label: 'Em aberto' },
  { value: 'PENDING', label: 'Aguardando' },
  { value: 'CLOSED', label: 'Encerrada' },
]

function DeliveryIcon({ status }: { status: string }) {
  switch (status) {
    case 'READ': return <CheckCheck size={13} className="text-[#54e0ee]" />
    case 'DELIVERED': return <CheckCheck size={13} className="text-[#647488]" />
    case 'SENT': return <Check size={13} className="text-[#647488]" />
    case 'FAILED': return <AlertTriangle size={13} className="text-[#ff5e6a]" />
    default: return <Clock size={13} className="text-[#647488]" />
  }
}

export function ThreadPanel({ thread, staff, currentUserId, canReply, backHref }: Props) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [sending, startSend] = useTransition()
  const [, startAction] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)
  const win = windowLabel(thread.window)

  // Marca lida ao abrir (uma vez por conversa). Silencioso — não bloqueia UX.
  const markedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!canReply) return
    if (markedRef.current === thread.conversation.id) return
    if (thread.conversation.unreadCount === 0) {
      markedRef.current = thread.conversation.id
      return
    }
    markedRef.current = thread.conversation.id
    markConversationRead(thread.conversation.id).then(() => router.refresh())
  }, [thread.conversation.id, thread.conversation.unreadCount, canReply, router])

  // Rola para a última mensagem quando a thread muda.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thread.messages.length, thread.conversation.id])

  function handleSend() {
    const value = text.trim()
    if (!value || sending) return
    startSend(async () => {
      const res = await sendConversationMessage(thread.conversation.id, value)
      if (res.ok) {
        setText('')
        toast('Mensagem enviada.', 'ok')
        router.refresh()
      } else {
        toast(res.error ?? 'Não foi possível enviar a mensagem.', 'err')
      }
    })
  }

  function handleAssign(userId: string) {
    startAction(async () => {
      const res = await assignConversation(thread.conversation.id, userId || null)
      if (res.ok) {
        toast('Atendente atualizado.', 'ok')
        router.refresh()
      } else {
        toast(res.error, 'err')
      }
    })
  }

  function handleStatus(status: 'OPEN' | 'PENDING' | 'CLOSED') {
    startAction(async () => {
      const res = await setConversationStatus(thread.conversation.id, status)
      if (res.ok) {
        toast('Status atualizado.', 'ok')
        router.refresh()
      } else {
        toast(res.error, 'err')
      }
    })
  }

  // Agrupa por dia para os separadores.
  let lastDay = ''

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#38435C] flex-shrink-0">
        <a
          href={backHref}
          className="lg:hidden text-[#87919E] hover:text-[#EBEBEB]"
          aria-label="Voltar para a lista"
        >
          <ArrowLeft size={18} />
        </a>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#EBEBEB] truncate">
            {contactLabel(thread.contact)}
          </p>
          <p className="text-[11px] text-[#647488] truncate">
            {thread.contact.phone ?? 'sem telefone'}
            {thread.lead && (
              <>
                {' • '}
                <span className="text-[#95BBE2]">
                  {thread.lead.stageName ?? 'Funil'} · {leadStatusLabel(thread.lead.status)}
                  {thread.lead.value != null && ` · ${fmtBRL(thread.lead.value)}`}
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Barra de ações (atendente + status) */}
      {canReply && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-[#38435C] bg-[#0A1E2C]/40 flex-shrink-0">
          <div className="inline-flex items-center gap-1.5">
            <User size={13} className="text-[#647488]" />
            <select
              value={thread.conversation.assignee?.id ?? ''}
              onChange={(e) => handleAssign(e.target.value)}
              className="h-8 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-xs text-[#EBEBEB] px-2 focus:outline-none focus:border-[#95BBE2]"
            >
              <option value="">Sem atendente</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id === currentUserId ? `${s.name} (eu)` : s.name}
                </option>
              ))}
            </select>
          </div>
          <select
            value={thread.conversation.status}
            onChange={(e) => handleStatus(e.target.value as 'OPEN' | 'PENDING' | 'CLOSED')}
            className="h-8 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-xs text-[#EBEBEB] px-2 focus:outline-none focus:border-[#95BBE2]"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Mensagens */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-2">
        {thread.messages.length === 0 && (
          <p className="text-center text-xs text-[#647488] py-8">
            Nenhuma mensagem nesta conversa ainda.
          </p>
        )}
        {thread.messages.map((m) => {
          const day = fmtDay(m.createdAt)
          const showDay = day !== lastDay
          lastDay = day
          const out = m.direction === 'OUT'
          return (
            <div key={m.id}>
              {showDay && (
                <div className="flex justify-center my-3">
                  <span className="text-[10px] text-[#647488] bg-[#0D2137] border border-[#38435C] rounded-full px-2.5 py-0.5">
                    {day}
                  </span>
                </div>
              )}
              <div className={cn('flex', out ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[78%] rounded-2xl px-3 py-2 text-[13px] leading-snug',
                    out
                      ? 'bg-[#95BBE2]/15 text-[#EBEBEB] rounded-br-sm'
                      : 'bg-[#0D2137] border border-[#38435C] text-[#EBEBEB] rounded-bl-sm',
                  )}
                >
                  {m.body ? (
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  ) : (
                    <p className="italic text-[#87919E]">[{m.type.toLowerCase()}]</p>
                  )}
                  <div className={cn('flex items-center gap-1 mt-1', out ? 'justify-end' : 'justify-start')}>
                    <span className="text-[10px] text-[#647488]">{fmtTime(m.createdAt)}</span>
                    {m.sentByBot && <span className="text-[10px] text-[#647488]">· bot</span>}
                    {out && <DeliveryIcon status={m.status} />}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Composer */}
      <div className="border-t border-[#38435C] p-3 flex-shrink-0">
        {!canReply ? (
          <p className="text-xs text-[#87919E] text-center py-2">
            Seu perfil tem acesso somente de leitura nesta conversa.
          </p>
        ) : thread.window.open ? (
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              rows={1}
              placeholder="Escreva uma mensagem..."
              className="flex-1 resize-none max-h-32 rounded-xl bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#647488] px-3 py-2 focus:outline-none focus:border-[#95BBE2]"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !text.trim()}
              className="h-10 w-10 flex items-center justify-center rounded-xl bg-gradient-to-b from-[#54e0ee] to-[#22c2d6] text-[#021015] disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              aria-label="Enviar mensagem"
            >
              <Send size={16} />
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-2.5">
            <p className="text-xs text-[#F59E0B] font-medium">
              {win.text} — aguarde o cliente responder ou use um template (em breve)
            </p>
            <p className="text-[11px] text-[#87919E] mt-0.5">
              O WhatsApp só permite mensagem livre nas 24h após a última resposta do cliente.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
