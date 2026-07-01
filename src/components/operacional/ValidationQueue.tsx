'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { CheckSquare, RotateCcw, Clock, User as UserIcon, ShieldCheck, FileText } from 'lucide-react'
import { decideTaskValidation } from '@/app/actions/operacional'
import type { ValidationQueueItem } from '@/lib/dal'
import { toast } from '@/lib/toast'

export function ValidationQueue({ items, canDecide }: { items: ValidationQueueItem[]; canDecide: boolean }) {
  const [list, setList] = useState(items)
  const [openId, setOpenId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function decide(id: string, approved: boolean) {
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      const r = await decideTaskValidation(id, approved, approved ? undefined : note)
      setBusyId(null)
      if ('error' in r) { setError(r.error); toast(r.error, 'err'); return }
      setList((prev) => prev.filter((it) => it.id !== id))
      setOpenId(null)
      setNote('')
      toast(approved ? 'Check-in aprovado' : 'Ajustes solicitados', approved ? 'ok' : 'info')
    })
  }

  if (list.length === 0) {
    return (
      <div className="rounded-xl border border-[#1F2937] bg-[#0F1623] p-8 text-center">
        <ShieldCheck size={28} className="text-[#22C55E] mx-auto mb-2" />
        <p className="text-[#EBEBEB] font-medium">Nada aguardando validação</p>
        <p className="text-[#87919E] text-sm mt-1">Quando um gestor enviar um check-in ou prestação de contas, ele aparece aqui.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {list.map((it) => {
        const open = openId === it.id
        const busy = busyId === it.id && isPending
        const checklistOk = it.checklistTotal === 0 || it.checklistDone === it.checklistTotal
        return (
          <div key={it.id} className={`rounded-xl border bg-[#0F1623] ${it.waitingDays >= 3 ? 'border-[#EF4444]/40' : 'border-[#1F2937]'}`}>
            <button
              onClick={() => setOpenId(open ? null : it.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[#EBEBEB] text-sm font-medium truncate">{it.title}</p>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#87919E]">
                  {it.popCode && <span className="text-[#95BBE2]">{it.popCode}</span>}
                  {it.clientName && <span>· {it.clientName}</span>}
                  <span className="flex items-center gap-1">· <UserIcon size={10} />{it.assigneeName}</span>
                </div>
              </div>
              <span className={`text-[11px] shrink-0 ${it.waitingDays >= 3 ? 'text-[#EF4444]' : 'text-[#87919E]'}`}>
                {it.waitingDays === 0 ? 'hoje' : `há ${it.waitingDays}d`}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${checklistOk ? 'text-[#22C55E] border-[#22C55E]/30' : 'text-[#EAB308] border-[#EAB308]/30'}`}>
                checklist {it.checklistDone}/{it.checklistTotal}
              </span>
            </button>

            {open && (
              <div className="px-4 pb-4 pt-1 space-y-3 border-t border-[#1F2937]">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[#576070] mb-1 flex items-center gap-1"><FileText size={11} /> Evidência</p>
                  <p className="text-xs text-[#EBEBEB] whitespace-pre-wrap">{it.evidence || '— (sem evidência registrada)'}</p>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-[#87919E]">
                  {it.dueDate && <span className="flex items-center gap-1"><Clock size={11} /> prazo {new Date(it.dueDate).toLocaleDateString('pt-BR')}</span>}
                  {it.clientSlug && <Link href={`/clients/${it.clientSlug}`} className="text-[#95BBE2] hover:underline">ver cliente →</Link>}
                </div>

                {canDecide ? (
                  <div className="space-y-2">
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Motivo (obrigatório p/ solicitar ajustes)"
                      className="w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-1.5 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/50 focus:outline-none focus:border-[#95BBE2]/50"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => decide(it.id, true)}
                        disabled={busy}
                        className="flex-1 text-xs text-[#22C55E] border border-[#22C55E]/30 rounded-lg px-3 py-2 hover:bg-[#22C55E]/10 disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        <CheckSquare size={13} /> Aprovar
                      </button>
                      <button
                        onClick={() => decide(it.id, false)}
                        disabled={busy}
                        className="flex-1 text-xs text-[#F59E0B] border border-[#F59E0B]/30 rounded-lg px-3 py-2 hover:bg-[#F59E0B]/10 disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        <RotateCcw size={13} /> Solicitar ajustes
                      </button>
                    </div>
                    {error && busyId === it.id && <p className="text-[11px] text-[#EF4444]">{error}</p>}
                  </div>
                ) : (
                  <p className="text-[11px] text-[#87919E]">Apenas a CS pode validar — você está acompanhando.</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
