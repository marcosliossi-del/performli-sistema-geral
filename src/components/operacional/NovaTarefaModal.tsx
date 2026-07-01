'use client'

import type { ReactNode } from 'react'
import { useMemo, useState, useTransition } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { createOperacionalTask } from '@/app/actions/operacional'
import type { NovaTarefaContext } from '@/lib/dal'
import type { TaskType, TaskPriority } from '@prisma/client'
import {
  TYPE_OPTIONS, TYPE_LABELS, PRIORITY_OPTIONS, PRIORITY_LABELS, label,
} from './labels'
import { useModalA11y } from '@/lib/useModalA11y'

export function NovaTarefaModal({
  ctx, onClose,
}: {
  ctx: NovaTarefaContext
  onClose: () => void
}) {
  const [clientId, setClientId] = useState('')
  const [areaId, setAreaId] = useState('')
  const [popId, setPopId] = useState('')
  const [type, setType] = useState('SIMPLES')
  const [priority, setPriority] = useState('MEDIA')
  const [dueDate, setDueDate] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [checklist, setChecklist] = useState<string[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)

  const cliente = useMemo(() => ctx.clientes.find((c) => c.id === clientId) ?? null, [ctx.clientes, clientId])
  const popsDaArea = useMemo(
    () => (areaId ? ctx.pops.filter((p) => p.areaId === areaId) : ctx.pops),
    [ctx.pops, areaId],
  )

  function handleCreate() {
    setMsg(null)
    startTransition(async () => {
      const res = await createOperacionalTask({
        title,
        description: description || undefined,
        type: type as TaskType,
        priority: priority as TaskPriority,
        dueDate: dueDate || undefined,
        clientId: clientId || undefined,
        areaId: areaId || undefined,
        popId: popId || undefined,
        assigneeId: assigneeId || undefined,
        checklist: checklist.filter((c) => c.trim()),
      })
      if ('error' in res) setMsg(res.error)
      else onClose()
    })
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Nova tarefa"
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[#05141C] border border-[#38435C] rounded-xl z-50"
      >
        <div className="sticky top-0 bg-[#05141C] border-b border-[#38435C] px-5 py-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#EBEBEB]">Nova tarefa</h2>
          <button onClick={onClose} className="text-[#87919E] hover:text-[#EBEBEB]"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3">
          <Field label="Título *">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O que precisa ser feito?" className={inputCls} />
          </Field>

          <Field label="Cliente">
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputCls}>
              <option value="">— interno (sem cliente) —</option>
              {ctx.clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>

          {cliente && (
            <div className="text-[10px] text-[#87919E] bg-[#0A1E2C]/60 border border-[#38435C]/50 rounded-lg px-3 py-2">
              Gestor: <span className="text-[#EBEBEB]">{cliente.managerName ?? 'sem gestor'}</span> ·{' '}
              {cliente.openTasks} aberta{cliente.openTasks !== 1 ? 's' : ''} ·{' '}
              <span className={cliente.overdueTasks > 0 ? 'text-[#EF4444]' : ''}>{cliente.overdueTasks} atrasada{cliente.overdueTasks !== 1 ? 's' : ''}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Área">
              <select value={areaId} onChange={(e) => { setAreaId(e.target.value); setPopId('') }} className={inputCls}>
                <option value="">—</option>
                {ctx.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="POP">
              <select value={popId} onChange={(e) => setPopId(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {popsDaArea.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Tipo">
              <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{label(TYPE_LABELS, t)}</option>)}
              </select>
            </Field>
            <Field label="Prioridade">
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
                {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{label(PRIORITY_LABELS, p)}</option>)}
              </select>
            </Field>
            <Field label="Prazo">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label="Responsável">
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={inputCls}>
              <option value="">— eu mesmo —</option>
              {ctx.usuarios.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </Field>

          <Field label="Descrição">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
          </Field>

          <Field label="Checklist">
            <div className="space-y-1.5">
              {checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={item}
                    onChange={(e) => setChecklist((cl) => cl.map((c, j) => (j === i ? e.target.value : c)))}
                    placeholder={`Item ${i + 1}`}
                    className={`${inputCls} flex-1`}
                  />
                  <button onClick={() => setChecklist((cl) => cl.filter((_, j) => j !== i))} className="text-[#87919E] hover:text-[#EF4444]"><Trash2 size={14} /></button>
                </div>
              ))}
              <button onClick={() => setChecklist((cl) => [...cl, ''])} className="flex items-center gap-1 text-[11px] text-[#95BBE2] hover:underline">
                <Plus size={12} /> Adicionar item
              </button>
            </div>
          </Field>

          {msg && <p className="text-[11px] text-[#EF4444]">{msg}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="text-xs text-[#87919E] border border-[#38435C] rounded-lg px-3 py-1.5 hover:bg-[#38435C]/30">Cancelar</button>
            <button onClick={handleCreate} disabled={isPending} className="text-xs bg-[#95BBE2]/10 text-[#95BBE2] border border-[#95BBE2]/20 rounded-lg px-4 py-1.5 hover:bg-[#95BBE2]/20 disabled:opacity-50">
              Criar tarefa
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

const inputCls = 'w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-2 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/50 focus:outline-none focus:border-[#95BBE2]/50'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-medium text-[#87919E] uppercase tracking-wider">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  )
}
