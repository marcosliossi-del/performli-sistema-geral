'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import { HeartPulse, CheckCircle2, Send, BellRing } from 'lucide-react'
import { registerProactiveAction } from '@/app/actions/antiChurn'
import type { AntiChurnQueueRow } from '@/lib/dal'

function riskColor(score: number | null): string {
  if (score == null) return 'text-[#87919E]'
  if (score >= 60) return 'text-[#EF4444]'
  if (score >= 40) return 'text-[#EAB308]'
  return 'text-[#22C55E]'
}

function ClientRow({ row, canEdit }: { row: AntiChurnQueueRow; canEdit: boolean }) {
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleRegister() {
    setMsg(null)
    startTransition(async () => {
      const res = await registerProactiveAction(row.id, note)
      if ('error' in res) {
        setMsg(res.error)
      } else {
        setMsg('Ação registrada.')
        setNote('')
        setOpen(false)
      }
    })
  }

  const interacao =
    row.daysSinceInteraction == null
      ? 'sem interação registrada'
      : `último contato há ${row.daysSinceInteraction} dia${row.daysSinceInteraction !== 1 ? 's' : ''}`

  return (
    <div className="py-2.5 px-3 rounded-lg bg-[#0A1E2C]/40 border border-[#38435C]/50 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link href={`/clients/${row.slug}`} className="text-xs font-medium text-[#95BBE2] hover:underline truncate">
              {row.name}
            </Link>
            {row.isSilent && (
              <span className="flex items-center gap-1 text-[9px] text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/20 rounded px-1.5 py-0.5">
                <BellRing size={9} /> silencioso
              </span>
            )}
          </div>
          <p className="text-[10px] text-[#87919E]">
            {row.manager ?? 'Sem gestor'} · {interacao}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <p className={`text-sm font-bold leading-none ${riskColor(row.riskScore)}`}>
              {row.riskScore ?? '—'}
            </p>
            <p className="text-[9px] text-[#87919E]">risco</p>
          </div>
          {canEdit && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="text-[10px] text-[#95BBE2] border border-[#95BBE2]/30 rounded px-2 py-1 hover:bg-[#95BBE2]/10 transition-colors"
            >
              Registrar ação
            </button>
          )}
        </div>
      </div>

      {open && canEdit && (
        <div className="flex items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="O que você fez? (liguei, alinhei expectativa, enviei plano...)"
            className="flex-1 bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-1.5 text-[11px] text-[#EBEBEB] placeholder:text-[#87919E]/50 focus:outline-none focus:border-[#95BBE2]/50"
          />
          <button
            onClick={handleRegister}
            disabled={isPending}
            className="flex items-center gap-1 text-[10px] bg-[#95BBE2]/10 text-[#95BBE2] border border-[#95BBE2]/20 rounded-lg px-2.5 py-1.5 hover:bg-[#95BBE2]/20 transition-colors disabled:opacity-50"
          >
            <Send size={11} /> Salvar
          </button>
        </div>
      )}
      {msg && <p className="text-[10px] text-[#95BBE2]">{msg}</p>}
    </div>
  )
}

/**
 * CSX-13 — Fila de ação anti-churn proativo. Clientes em risco priorizados,
 * com sinal de silêncio e registro de ação proativa inline.
 */
export function AntiChurnQueue({ rows, canEdit }: { rows: AntiChurnQueueRow[]; canEdit: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <HeartPulse size={15} className="text-[#EF4444]" />
          <h3 className="text-sm font-semibold text-[#EBEBEB]">Fila de ação proativa</h3>
        </div>
        {rows.length > 0 && (
          <span className="text-[11px] text-[#87919E]">{rows.length} cliente{rows.length > 1 ? 's' : ''} pedindo ação</span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <CheckCircle2 size={28} className="text-[#22C55E] mb-2" />
          <p className="text-[#EBEBEB] text-sm font-medium">Nenhum cliente exigindo ação proativa</p>
          <p className="text-[#87919E] text-xs mt-0.5">Risco de churn sob controle.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <ClientRow key={r.id} row={r} canEdit={canEdit} />
          ))}
        </div>
      )}
    </Card>
  )
}
