import Link from 'next/link'
import { MessagesSquare, MessageCircle, Users, ArrowRight } from 'lucide-react'
import { requireSession, getClientChannels } from '@/lib/dal'
import type { ClientChannelSummary } from '@/lib/dal'
import { timeAgo } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function CanaisPage() {
  const session = await requireSession()
  const channels = await getClientChannels(session.userId, session.role)

  const comAtividade = channels.filter((c) => c.lastMessage).length
  const silenciosos = channels.length - comAtividade

  return (
    <div className="flex flex-col gap-5 p-5 min-h-screen">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <MessagesSquare size={20} className="text-[#54e0ee]" />
          <h1 className="text-xl font-bold text-[#EBEBEB]">Central de Comunicação</h1>
        </div>
        <p className="text-sm text-[#87919E] mt-0.5">
          Um canal interno por cliente — concentra o alinhamento da equipe (gestor, CS e admin) em um só lugar.
        </p>
      </div>

      {/* KPI strip */}
      <div className="flex flex-wrap gap-6 card px-5 py-4">
        <Kpi label="Canais" value={channels.length} />
        <Kpi label="Com conversa" value={comAtividade} accent="#34c97a" />
        <Kpi label="Sem mensagem" value={silenciosos} accent={silenciosos > 0 ? '#e3ad45' : '#647488'} />
      </div>

      {/* Lista de canais */}
      {channels.length === 0 ? (
        <div className="card p-10 text-center">
          <MessagesSquare size={28} className="text-[#38435C] mx-auto mb-2" />
          <p className="text-[#EBEBEB] font-medium">Nenhum canal disponível</p>
          <p className="text-[#87919E] text-sm mt-1">Você verá aqui os canais dos clientes sob sua responsabilidade.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {channels.map((ch) => <ChannelCard key={ch.clientId} ch={ch} />)}
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, accent = '#EBEBEB' }: { label: string; value: number; accent?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[#87919E] mb-0.5">{label}</p>
      <p className="text-2xl font-bold tabular" style={{ color: accent }}>{value}</p>
    </div>
  )
}

function ChannelCard({ ch }: { ch: ClientChannelSummary }) {
  const initials = ch.clientName.charAt(0).toUpperCase()
  return (
    <Link
      href={`/clients/${ch.clientSlug}#chat`}
      className="card ak-lift p-4 flex flex-col gap-3 group"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#0A1E2C] flex items-center justify-center text-[#95BBE2] font-bold shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#EBEBEB] truncate">{ch.clientName}</p>
          <p className="text-[11px] text-[#87919E] truncate flex items-center gap-1">
            <Users size={10} />
            {ch.primaryManager ?? 'Sem gestor principal'}
            {ch.participants.length > 1 && <span className="text-[#576070]">· +{ch.participants.length - 1}</span>}
          </p>
        </div>
        <span className="text-[10px] text-[#576070] flex items-center gap-1 shrink-0">
          <MessageCircle size={11} /> {ch.messageCount}
        </span>
      </div>

      {ch.lastMessage ? (
        <div className="rounded-lg bg-[#0A1E2C]/60 border border-[#38435C]/60 px-3 py-2">
          <p className="text-[12px] text-[#EBEBEB] line-clamp-2">{ch.lastMessage.content}</p>
          <p className="text-[10px] text-[#87919E] mt-1">
            {ch.lastMessage.authorName} · {timeAgo(new Date(ch.lastMessage.createdAt))}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-[#38435C]/60 px-3 py-2">
          <p className="text-[11px] text-[#647488]">Nenhuma mensagem ainda — abra o canal para iniciar o alinhamento.</p>
        </div>
      )}

      <span className="text-[11px] text-[#54e0ee] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 self-end">
        Abrir canal <ArrowRight size={11} />
      </span>
    </Link>
  )
}
