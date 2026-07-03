'use client'

/**
 * FASE 1.2 — Funil de prestação de contas semanal (últimas 8 semanas).
 * Cada linha responde: foi gerado? foi enviado ao cliente (por quem)? o cliente
 * respondeu? Enquanto não existir fonte de resposta do cliente no banco, a coluna
 * "Respondido" mostra "—" com tooltip explicativo (não um falso "não respondeu").
 */

import { useState, useTransition } from 'react'
import { Check, Send, Loader2, MailCheck } from 'lucide-react'
import { markWeeklyReportSent } from '@/app/actions/weeklyReports'

export type FunnelRow = {
  id: string
  weekStart: string        // 'YYYY-MM-DD' já normalizado em UTC pelo servidor
  generatedAt: string      // ISO
  sentAt: string | null
  sentByName: string | null
  deliveredAt: string | null
  firstReplyAt: string | null
}

type Props = {
  clientId: string
  clientSlug: string
  rows: FunnelRow[]
  fonteRespostaAusente: boolean
  canEdit: boolean
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/**
 * Rótulo da semana a partir do 'YYYY-MM-DD' canônico. Ancorado em 12:00Z e
 * formatado em UTC — o dia NUNCA recua no fuso do Brasil (weekStart é @db.Date
 * em UTC; getters locais deslocariam 1 dia em UTC-3).
 */
function weekLabel(dateStr: string): string {
  const start = new Date(`${dateStr}T12:00:00Z`)
  const end = new Date(start.getTime() + 6 * 86_400_000)
  const f = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
  return `${f(start)} a ${f(end)}`
}

export function WeeklyReportFunnel({ clientId, clientSlug, rows, fonteRespostaAusente, canEdit }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleMarkSent(weekStart: string, id: string) {
    setError(null)
    setPendingId(id)
    startTransition(async () => {
      // weekStart já chega como 'YYYY-MM-DD' canônico do servidor — sem
      // reconstrução local (getters locais recuariam 1 dia em UTC-3).
      const res = await markWeeklyReportSent(clientId, weekStart, clientSlug)
      if ('error' in res) setError(res.error)
      setPendingId(null)
    })
  }

  return (
    <div className="bg-[#0A1E2C] border border-[#38435C] rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#38435C]">
        <MailCheck size={15} className="text-[#95BBE2]" />
        <h3 className="text-sm font-semibold text-[#EBEBEB]">Prestação de contas — últimas 8 semanas</h3>
      </div>

      {error && <p className="px-4 pt-3 text-sm text-[#EF4444]">{error}</p>}

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[#87919E]">
          Nenhum relatório semanal gerado ainda para este cliente.
        </p>
      ) : (
        <div className="divide-y divide-[#38435C]/60">
          {/* header */}
          <div className="grid grid-cols-4 gap-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#87919E]">
            <span>Semana</span>
            <span>Gerado</span>
            <span>Enviado ao cliente</span>
            <span>Respondido</span>
          </div>

          {rows.map((r) => {
            const busy = isPending && pendingId === r.id
            return (
              <div key={r.id} className="grid grid-cols-4 gap-2 px-4 py-2.5 items-center text-sm">
                <span className="text-[#EBEBEB]">{weekLabel(r.weekStart)}</span>

                {/* Gerado */}
                <span className="flex items-center gap-1 text-[#87919E]">
                  <Check size={13} className="text-[#22C55E]" />
                  {fmtDate(r.generatedAt)}
                </span>

                {/* Enviado */}
                {r.sentAt ? (
                  <span className="flex items-center gap-1 text-[#87919E]">
                    <Check size={13} className="text-[#22C55E]" />
                    {fmtDate(r.sentAt)}
                    {r.sentByName && (
                      <span className="text-[10px] text-[#87919E]">· {r.sentByName}</span>
                    )}
                  </span>
                ) : !canEdit ? (
                  <span className="text-[#EF4444]/80 text-xs">Não enviado</span>
                ) : (
                  <button
                    onClick={() => handleMarkSent(r.weekStart, r.id)}
                    disabled={busy}
                    className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-[#95BBE2]/10 text-[#95BBE2] hover:bg-[#95BBE2]/20 text-xs transition-colors border border-[#95BBE2]/20 disabled:opacity-50 w-fit"
                    title="Confirmar que a prestação de contas foi enviada ao cliente"
                  >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    Marcar como enviado
                  </button>
                )}

                {/* Respondido */}
                {r.firstReplyAt ? (
                  <span className="flex items-center gap-1 text-[#87919E]">
                    <Check size={13} className="text-[#22C55E]" />
                    {fmtDate(r.firstReplyAt)}
                  </span>
                ) : fonteRespostaAusente ? (
                  <span
                    className="text-[#87919E] cursor-help"
                    title="Rastreamento de resposta aguarda integração de recebimento de mensagens do cliente"
                  >
                    —
                  </span>
                ) : (
                  <span className="text-[#87919E]">—</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
