'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import { CheckCircle2, XCircle, Clock } from 'lucide-react'
import { reviewCheckin } from '@/app/actions/checkin'

export type ReviewItem = {
  id: string
  clientName: string
  clientSlug: string
  managerName: string | null
  resultadoSemana: string | null
  oQueFoiFeito: string | null
  proximosPassos: string | null
  submittedAt: Date | null
}

export function CheckinReviewCard({ item }: { item: ReviewItem }) {
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handle(approved: boolean) {
    setMsg(null)
    startTransition(async () => {
      const res = await reviewCheckin(item.id, approved, approved ? undefined : note)
      if ('error' in res) setMsg(res.error)
    })
  }

  return (
    <Card className="p-4 border-l-4 border-l-[#EAB308] space-y-3">
      <div className="flex items-center justify-between">
        <Link href={`/clients/${item.clientSlug}`} className="text-sm font-semibold text-[#95BBE2] hover:underline">
          {item.clientName}
        </Link>
        <span className="flex items-center gap-1 text-[10px] text-[#87919E]">
          <Clock size={10} />
          {item.managerName ?? 'Sem gestor'}
          {item.submittedAt && ` · enviado ${new Date(item.submittedAt).toLocaleDateString('pt-BR')}`}
        </span>
      </div>

      <div className="space-y-2 text-xs">
        <Field label="Resultado da semana" value={item.resultadoSemana} />
        <Field label="O que foi feito" value={item.oQueFoiFeito} />
        <Field label="Próximos passos" value={item.proximosPassos} />
      </div>

      {rejecting && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Motivo da reprovação (o gestor verá para corrigir)"
          rows={2}
          className="w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-2 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/50 focus:outline-none focus:border-[#95BBE2]/50 resize-none"
        />
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => handle(true)}
          disabled={isPending}
          className="flex items-center gap-1.5 text-xs text-[#22C55E] border border-[#22C55E]/30 rounded-lg px-3 py-1.5 hover:bg-[#22C55E]/10 transition-colors disabled:opacity-50"
        >
          <CheckCircle2 size={13} /> Aprovar
        </button>
        {rejecting ? (
          <button
            onClick={() => handle(false)}
            disabled={isPending}
            className="flex items-center gap-1.5 text-xs text-[#EF4444] border border-[#EF4444]/30 rounded-lg px-3 py-1.5 hover:bg-[#EF4444]/10 transition-colors disabled:opacity-50"
          >
            <XCircle size={13} /> Confirmar reprovação
          </button>
        ) : (
          <button
            onClick={() => setRejecting(true)}
            disabled={isPending}
            className="flex items-center gap-1.5 text-xs text-[#87919E] border border-[#38435C] rounded-lg px-3 py-1.5 hover:bg-[#38435C]/30 transition-colors disabled:opacity-50"
          >
            <XCircle size={13} /> Reprovar
          </button>
        )}
      </div>
      {msg && <p className="text-[11px] text-[#EF4444]">{msg}</p>}
    </Card>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-[#87919E] uppercase tracking-wider">{label}</p>
      <p className="text-[#EBEBEB] whitespace-pre-wrap">{value || '—'}</p>
    </div>
  )
}
