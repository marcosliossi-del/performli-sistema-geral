'use client'

import { useState } from 'react'
import { MessageCircle, Clock, Timer, DollarSign, Plus, Users } from 'lucide-react'
import type { SupervisionData } from '@/lib/conversas/dal'
import { AutoRefresh } from './AutoRefresh'
import { LastUpdated } from './LastUpdated'
import { ChannelModal } from './ChannelModal'
import { EmptyState } from '@/components/ui/EmptyState'
import { fmtBRL } from '@/lib/conversas/format'

type ClientOption = { id: string; name: string }

interface Props {
  data: SupervisionData
  clients: ClientOption[]
  canConfigureChannel: boolean
}

function fmtMin(min: number | null): string {
  if (min == null) return '—'
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m > 0 ? `${h}h${m}` : `${h}h`
}

export function SupervisionView({ data, clients, canConfigureChannel }: Props) {
  const [channelOpen, setChannelOpen] = useState(false)

  const totalOpen = data.attendants.reduce((s, a) => s + a.openConversations, 0) + data.unassignedOpen
  const totalPending = data.attendants.reduce((s, a) => s + a.pendingConversations, 0)
  const avgFirst = (() => {
    const vals = data.attendants.map((a) => a.avgFirstResponseMin7d).filter((v): v is number => v != null)
    if (vals.length === 0) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  })()

  const cards = [
    { icon: MessageCircle, label: 'Conversas em aberto', value: String(totalOpen), color: '#54e0ee',
      sub: data.unassignedOpen > 0 ? `${data.unassignedOpen} sem atendente` : 'todas atribuídas' },
    { icon: Clock, label: 'Aguardando resposta', value: String(totalPending), color: '#F59E0B',
      sub: totalPending > 0 ? 'clientes esperando' : 'nada pendente' },
    { icon: Timer, label: '1ª resposta (7d)', value: fmtMin(avgFirst), color: '#8B5CF6',
      sub: 'tempo médio da equipe' },
    { icon: DollarSign, label: 'Receita ganha (30d)', value: fmtBRL(data.monetization.wonValue30d), color: '#22C55E',
      sub: `${data.monetization.wonCount30d} ganhos · ${data.monetization.winRate != null ? Math.round(data.monetization.winRate * 100) + '% conversão' : 'sem fechamentos'}` },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <AutoRefresh />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <LastUpdated at={data.lastUpdated} />
        {canConfigureChannel && (
          <button
            type="button"
            onClick={() => setChannelOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#38435C] text-sm text-[#EBEBEB] hover:bg-[#38435C]"
          >
            <Plus size={15} /> Conectar canal WhatsApp
          </button>
        )}
      </div>

      {/* Cards de topo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-[#38435C] bg-[#0D2137] p-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${c.color}18` }}>
                <c.icon size={15} style={{ color: c.color }} />
              </div>
              <p className="text-xs text-[#87919E]">{c.label}</p>
            </div>
            <p className="text-2xl font-bold text-[#EBEBEB] mt-2">{c.value}</p>
            <p className="text-[11px] text-[#647488] mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabela por atendente */}
      <div className="rounded-xl border border-[#38435C] bg-[#0D2137] overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-[#38435C] flex items-center gap-2">
          <Users size={15} className="text-[#95BBE2]" />
          <h3 className="text-sm font-semibold text-[#EBEBEB]">Atendimento por vendedor</h3>
        </div>
        {data.attendants.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Users size={20} />}
              title="Nenhum atendimento registrado ainda"
              description="Assim que os vendedores começarem a responder conversas, o desempenho de cada um aparece aqui."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-[#647488] border-b border-[#38435C]">
                  <th className="text-left font-medium px-4 py-2">Atendente</th>
                  <th className="text-right font-medium px-3 py-2">Abertas</th>
                  <th className="text-right font-medium px-3 py-2">Aguardando</th>
                  <th className="text-right font-medium px-3 py-2">1ª resp. 7d</th>
                  <th className="text-right font-medium px-3 py-2">1ª resp. 30d</th>
                  <th className="text-right font-medium px-4 py-2">Msgs 7d</th>
                </tr>
              </thead>
              <tbody>
                {data.attendants.map((a) => (
                  <tr key={a.userId} className="border-b border-[#38435C]/50 last:border-0">
                    <td className="px-4 py-2.5 text-[#EBEBEB] font-medium">{a.name}</td>
                    <td className="px-3 py-2.5 text-right text-[#EBEBEB]">{a.openConversations}</td>
                    <td className="px-3 py-2.5 text-right text-[#F59E0B]">{a.pendingConversations}</td>
                    <td className="px-3 py-2.5 text-right text-[#a3b2c2]">{fmtMin(a.avgFirstResponseMin7d)}</td>
                    <td className="px-3 py-2.5 text-right text-[#a3b2c2]">{fmtMin(a.avgFirstResponseMin30d)}</td>
                    <td className="px-4 py-2.5 text-right text-[#a3b2c2]">{a.messagesSent7d}</td>
                  </tr>
                ))}
                {data.unassignedOpen > 0 && (
                  <tr className="border-t border-[#38435C]">
                    <td className="px-4 py-2.5 text-[#F59E0B] font-medium">Sem atendente (fila)</td>
                    <td className="px-3 py-2.5 text-right text-[#F59E0B]">{data.unassignedOpen}</td>
                    <td colSpan={4} className="px-4 py-2.5 text-right text-[11px] text-[#647488]">
                      conversas não distribuídas — atribua um responsável
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Leads por estágio */}
      <div className="rounded-xl border border-[#38435C] bg-[#0D2137] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#38435C]">
          <h3 className="text-sm font-semibold text-[#EBEBEB]">Leads no funil por estágio</h3>
        </div>
        {data.pipeline.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nenhum lead em aberto no funil"
              description="Os leads em aberto aparecem aqui agrupados por estágio, com o valor total em cada etapa."
            />
          </div>
        ) : (
          <div className="divide-y divide-[#38435C]/50">
            {data.pipeline.map((s) => (
              <div key={s.stageId} className="flex items-center gap-3 px-4 py-2.5">
                <p className="text-sm text-[#EBEBEB] flex-1 truncate">{s.stageName}</p>
                <span className="text-xs text-[#a3b2c2]">{s.leadCount} {s.leadCount === 1 ? 'lead' : 'leads'}</span>
                <span className="text-xs font-semibold text-[#22C55E] w-28 text-right">{fmtBRL(s.totalValue)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {channelOpen && <ChannelModal clients={clients} onClose={() => setChannelOpen(false)} />}
    </div>
  )
}
