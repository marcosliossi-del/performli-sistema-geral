'use client'

import { useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import { ClipboardList, Check } from 'lucide-react'
import { updateFichaCs } from '@/app/actions/fichaCs'
import { toast } from '@/lib/toast'

type Nps = 'PROMOTOR' | 'NEUTRO' | 'DETRATOR'
type Rel = 'OTIMO' | 'BOM' | 'REGULAR' | 'RUIM' | 'PESSIMO'
type Curva = 'A' | 'B' | 'C'

const NPS_OPTS: Nps[] = ['PROMOTOR', 'NEUTRO', 'DETRATOR']
const REL_OPTS: Rel[] = ['OTIMO', 'BOM', 'REGULAR', 'RUIM', 'PESSIMO']
const CURVA_OPTS: Curva[] = ['A', 'B', 'C']
const REL_LABEL: Record<Rel, string> = { OTIMO: 'Ótimo', BOM: 'Bom', REGULAR: 'Regular', RUIM: 'Ruim', PESSIMO: 'Péssimo' }
const NPS_LABEL: Record<Nps, string> = { PROMOTOR: 'Promotor', NEUTRO: 'Neutro', DETRATOR: 'Detrator' }

export function FichaCsPanel({
  clientId, canEdit, initial,
}: {
  clientId: string
  canEdit: boolean
  initial: { nps: string | null; relacionamento: string | null; curva: string | null; feedbackNegativo: number; atualizadoEm: string | null }
}) {
  const [nps, setNps] = useState<string>(initial.nps ?? '')
  const [rel, setRel] = useState<string>(initial.relacionamento ?? '')
  const [curva, setCurva] = useState<string>(initial.curva ?? '')
  const [fb, setFb] = useState<number>(initial.feedbackNegativo)
  const [isPending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const r = await updateFichaCs(clientId, {
        nps: (nps || null) as Nps | null,
        relacionamento: (rel || null) as Rel | null,
        curva: (curva || null) as Curva | null,
        feedbackNegativo: fb,
      })
      if ('error' in r) { toast(r.error, 'err'); return }
      toast('Ficha de CS atualizada')
    })
  }

  const selectCls = 'w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-2.5 py-2 text-xs text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50 disabled:opacity-60'

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardList size={16} className="text-[#95BBE2]" />
        <h3 className="text-sm font-semibold text-[#EBEBEB]">Ficha de CS</h3>
        {initial.atualizadoEm && (
          <span className="text-[10px] text-[#576070] ml-auto">Atualizada em {new Date(initial.atualizadoEm).toLocaleDateString('pt-BR')}</span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Relacionamento">
          <select value={rel} onChange={(e) => setRel(e.target.value)} disabled={!canEdit} className={selectCls}>
            <option value="">—</option>
            {REL_OPTS.map((o) => <option key={o} value={o}>{REL_LABEL[o]}</option>)}
          </select>
        </Field>
        <Field label="NPS">
          <select value={nps} onChange={(e) => setNps(e.target.value)} disabled={!canEdit} className={selectCls}>
            <option value="">—</option>
            {NPS_OPTS.map((o) => <option key={o} value={o}>{NPS_LABEL[o]}</option>)}
          </select>
        </Field>
        <Field label="Curva">
          <select value={curva} onChange={(e) => setCurva(e.target.value)} disabled={!canEdit} className={selectCls}>
            <option value="">—</option>
            {CURVA_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Feedback neg. (semana)">
          <select value={String(fb)} onChange={(e) => setFb(Number(e.target.value))} disabled={!canEdit} className={selectCls}>
            {[0, 1, 2].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
      </div>

      {canEdit && (
        <button
          onClick={save}
          disabled={isPending}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#021015] bg-gradient-to-b from-[#54e0ee] to-[#22c2d6] rounded-lg px-3.5 py-2 disabled:opacity-60"
        >
          <Check size={13} /> Salvar ficha
        </button>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[9.5px] uppercase tracking-wider text-[#87919E] mb-1 font-semibold">{label}</p>
      {children}
    </div>
  )
}
