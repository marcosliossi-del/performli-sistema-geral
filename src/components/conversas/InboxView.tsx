'use client'

import { useRouter } from 'next/navigation'
import { Inbox as InboxIcon, MessageSquare } from 'lucide-react'
import type { ConversationInboxPage, ThreadData } from '@/lib/conversas/dal'
import { ThreadPanel } from './ThreadPanel'
import { AutoRefresh } from './AutoRefresh'
import { LastUpdated } from './LastUpdated'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils'
import { fmtRelative, windowLabel, statusLabel, contactLabel } from '@/lib/conversas/format'

type StaffOption = { id: string; name: string }
type ClientOption = { id: string; name: string }

export interface InboxFilters {
  clientId: string
  status: string
  mine: boolean
}

interface Props {
  inbox: ConversationInboxPage
  thread: ThreadData | null
  selectedId: string | null
  clients: ClientOption[]
  staff: StaffOption[]
  currentUserId: string
  canReply: boolean
  filters: InboxFilters
}

/** Monta a querystring da visão inbox preservando filtros. */
function inboxHref(filters: InboxFilters, conversationId?: string): string {
  const p = new URLSearchParams()
  p.set('view', 'inbox')
  if (filters.clientId) p.set('clientId', filters.clientId)
  if (filters.status) p.set('status', filters.status)
  if (filters.mine) p.set('mine', '1')
  if (conversationId) p.set('conversationId', conversationId)
  return `/conversas?${p.toString()}`
}

export function InboxView({
  inbox, thread, selectedId, clients, staff, currentUserId, canReply, filters,
}: Props) {
  const router = useRouter()

  function updateFilter(patch: Partial<InboxFilters>) {
    router.push(inboxHref({ ...filters, ...patch }))
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <AutoRefresh />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select
          value={filters.clientId}
          onChange={(e) => updateFilter({ clientId: e.target.value })}
          className="h-9 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] px-2.5 focus:outline-none focus:border-[#95BBE2]"
        >
          <option value="">Todos os clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) => updateFilter({ status: e.target.value })}
          className="h-9 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] px-2.5 focus:outline-none focus:border-[#95BBE2]"
        >
          <option value="">Todos os status</option>
          <option value="OPEN">Em aberto</option>
          <option value="PENDING">Aguardando</option>
          <option value="CLOSED">Encerradas</option>
        </select>
        <button
          type="button"
          onClick={() => updateFilter({ mine: !filters.mine })}
          className={cn(
            'h-9 rounded-lg px-3 text-sm font-medium border transition-colors',
            filters.mine
              ? 'border-[#95BBE2] bg-[#95BBE2]/15 text-[#95BBE2]'
              : 'border-[#38435C] text-[#a3b2c2] hover:text-[#EBEBEB]',
          )}
        >
          Minhas conversas
        </button>
        <div className="ml-auto">
          <LastUpdated at={inbox.lastUpdated} />
        </div>
      </div>

      {/* Layout lista | thread */}
      <div className="flex flex-1 min-h-0 gap-3">
        {/* Lista */}
        <div
          className={cn(
            'w-full lg:w-[360px] flex-shrink-0 flex-col rounded-xl border border-[#38435C] bg-[#0D2137] overflow-hidden',
            selectedId ? 'hidden lg:flex' : 'flex',
          )}
        >
          <div className="flex-1 overflow-y-auto">
            {inbox.items.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<InboxIcon size={20} />}
                  title="Nenhuma conversa por aqui"
                  description="Quando um cliente enviar mensagem pelo WhatsApp, a conversa aparece aqui para atendimento."
                />
              </div>
            ) : (
              inbox.items.map((it) => {
                const win = windowLabel(it.window)
                const isActive = it.id === selectedId
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => router.push(inboxHref(filters, it.id))}
                    className={cn(
                      'w-full text-left px-3.5 py-3 border-b border-[#38435C]/60 transition-colors',
                      isActive ? 'bg-[#95BBE2]/10' : 'hover:bg-white/[0.03]',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#EBEBEB] truncate flex-1">
                        {contactLabel(it.contact)}
                      </p>
                      {it.lastMessageAt && (
                        <span
                          // suppressHydrationWarning: fmtRelative usa new Date() e
                          // pode divergir do SSR na virada de minuto (QA, menor)
                          className="text-[10px] text-[#647488] flex-shrink-0"
                          suppressHydrationWarning
                        >
                          {fmtRelative(it.lastMessageAt)}
                        </span>
                      )}
                      {it.unreadCount > 0 && (
                        <span className="flex-shrink-0 min-w-[18px] text-center text-[10px] font-bold text-[#021015] bg-[#54e0ee] rounded-full px-1.5 py-0.5">
                          {it.unreadCount > 99 ? '99+' : it.unreadCount}
                        </span>
                      )}
                    </div>
                    {it.lastMessage && (
                      <p className="text-xs text-[#87919E] truncate mt-0.5">
                        {it.lastMessage.direction === 'OUT' && <span className="text-[#647488]">Você: </span>}
                        {it.lastMessage.preview}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="text-[10px] text-[#a3b2c2] bg-white/[0.06] rounded px-1.5 py-0.5">
                        {statusLabel(it.status)}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] rounded px-1.5 py-0.5',
                          win.tone === 'closed' && 'bg-[#647488]/20 text-[#87919E]',
                          win.tone === 'warn' && 'bg-[#F59E0B]/15 text-[#F59E0B]',
                          win.tone === 'ok' && 'bg-[#22C55E]/15 text-[#22C55E]',
                        )}
                      >
                        {win.text}
                      </span>
                      <span className="text-[10px] text-[#647488] ml-auto">
                        {it.assignee ? it.assignee.name : 'Sem atendente'}
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Thread */}
        <div
          className={cn(
            'flex-1 min-h-0 rounded-xl border border-[#38435C] bg-[#0D2137] overflow-hidden',
            selectedId ? 'flex' : 'hidden lg:flex',
          )}
        >
          {thread ? (
            <ThreadPanel
              thread={thread}
              staff={staff}
              currentUserId={currentUserId}
              canReply={canReply}
              backHref={inboxHref(filters)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-6">
              <EmptyState
                icon={<MessageSquare size={20} />}
                title="Selecione uma conversa"
                description="Escolha uma conversa à esquerda para ver o histórico e responder ao cliente."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
