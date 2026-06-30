'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import { Send, AlertTriangle } from 'lucide-react'
import { submitCheckin } from '@/app/actions/checkin'
import type { CheckinStatusValue } from '@/lib/dal'

const STATUS_BADGE: Record<CheckinStatusValue, { label: string; cls: string }> = {
  PENDENTE:   { label: 'Pendente',  cls: 'text-[#EAB308] bg-[#EAB308]/10 border-[#EAB308]/20' },
  PREENCHIDO: { label: 'Em revisão', cls: 'text-[#95BBE2] bg-[#95BBE2]/10 border-[#95BBE2]/20' },
  APROVADO:   { label: 'Aprovado',  cls: 'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20' },
  REPROVADO:  { label: 'Reprovado', cls: 'text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/20' },
}

export type FillItem = {
  clientId: string
  clientName: string
  clientSlug: string
  status: CheckinStatusValue
  resultadoSemana: string | null
  oQueFoiFeito: string | null
  proximosPassos: string | null
  reviewNote: string | null
}

export function CheckinFillCard({ item }: { item: FillItem }) {
  const [resultadoSemana, setResultado] = useState(item.resultadoSemana ?? '')
  const [oQueFoiFeito, setFeito] = useState(item.oQueFoiFeito ?? '')
  const [proximosPassos, setPassos] = useState(item.proximosPassos ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const badge = STATUS_BADGE[item.status]
  const locked = item.status === 'APROVADO'

  function handleSubmit() {
    setMsg(null)
    startTransition(async () => {
      const res = await submitCheckin(item.clientId, { resultadoSemana, oQueFoiFeito, proximosPassos })
      setMsg('error' in res ? res.error : 'Check-in enviado para validação da CS.')
    })
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Link href={`/clients/${item.clientSlug}`} className="text-sm font-semibold text-[#95BBE2] hover:underline">
          {item.clientName}
        </Link>
        <span className={`text-[10px] rounded px-2 py-0.5 border ${badge.cls}`}>{badge.label}</span>
      </div>

      {item.status === 'REPROVADO' && item.reviewNote && (
        <div className="flex items-start gap-2 text-[11px] text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-lg px-3 py-2">
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
          <span>Reprovado pela CS: {item.reviewNote}</span>
        </div>
      )}

      {locked ? (
        <p className="text-[11px] text-[#22C55E]">Check-in aprovado pela CS — nada a fazer esta semana.</p>
      ) : (
        <div className="space-y-2">
          <FillField label="Resultado da semana" value={resultadoSemana} onChange={setResultado} placeholder="O que aconteceu nas métricas?" />
          <FillField label="O que foi feito" value={oQueFoiFeito} onChange={setFeito} placeholder="Ações executadas na conta" />
          <FillField label="Próximos passos" value={proximosPassos} onChange={setPassos} placeholder="Plano para a próxima semana" />
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="flex items-center gap-1.5 text-xs bg-[#95BBE2]/10 text-[#95BBE2] border border-[#95BBE2]/20 rounded-lg px-3 py-1.5 hover:bg-[#95BBE2]/20 transition-colors disabled:opacity-50"
          >
            <Send size={12} /> {item.status === 'PENDENTE' ? 'Enviar check-in' : 'Reenviar para validação'}
          </button>
        </div>
      )}
      {msg && <p className="text-[11px] text-[#95BBE2]">{msg}</p>}
    </Card>
  )
}

function FillField({
  label, value, onChange, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string
}) {
  return (
    <div>
      <label className="text-[10px] font-medium text-[#87919E] uppercase tracking-wider">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="mt-1 w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-2 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/50 focus:outline-none focus:border-[#95BBE2]/50 resize-none"
      />
    </div>
  )
}
