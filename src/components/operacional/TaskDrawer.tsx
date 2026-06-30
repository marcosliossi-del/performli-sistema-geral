'use client'

import type { ReactNode } from 'react'
import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { X, Send, Square, CheckSquare, Clock, User as UserIcon, ShieldCheck, RotateCcw } from 'lucide-react'
import { updateTaskStatus } from '@/app/actions/tasks'
import {
  addTaskComment, toggleChecklistItem, loadTaskDetail,
  submitTaskForValidation, decideTaskValidation, type TaskDetail,
} from '@/app/actions/operacional'
import type { OperacionalTask } from '@/lib/dal'
import type { TaskStatus } from '@prisma/client'
import {
  STATUS_LABELS, STATUS_OPTIONS, PRIORITY_LABELS, TYPE_LABELS, label,
} from './labels'

export function TaskDrawer({
  task, canEdit, onClose,
}: {
  task: OperacionalTask | null
  canEdit: boolean
  onClose: () => void
}) {
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [comment, setComment] = useState('')
  const [evidence, setEvidence] = useState('')
  const [rejectNote, setRejectNote] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!task) { setDetail(null); return }
    setLoading(true)
    setEvidence('')
    setRejectNote('')
    setActionError(null)
    loadTaskDetail(task.id).then((d) => { setDetail(d); setEvidence(d?.evidence ?? ''); setLoading(false) })
  }, [task])

  if (!task) return null

  function handleStatus(status: string) {
    startTransition(() => updateTaskStatus(task!.id, status as TaskStatus))
  }
  function handleComment() {
    if (!comment.trim()) return
    startTransition(async () => {
      await addTaskComment(task!.id, comment)
      setComment('')
      const d = await loadTaskDetail(task!.id)
      setDetail(d)
    })
  }
  function handleToggle(itemId: string, done: boolean) {
    startTransition(async () => {
      await toggleChecklistItem(itemId, done)
      const d = await loadTaskDetail(task!.id)
      setDetail(d)
    })
  }
  function handleSubmitValidation() {
    setActionError(null)
    startTransition(async () => {
      const r = await submitTaskForValidation(task!.id, evidence)
      if ('error' in r) { setActionError(r.error); return }
      const d = await loadTaskDetail(task!.id)
      setDetail(d)
    })
  }
  function handleDecide(approved: boolean) {
    setActionError(null)
    startTransition(async () => {
      const r = await decideTaskValidation(task!.id, approved, approved ? undefined : rejectNote)
      if ('error' in r) { setActionError(r.error); return }
      setRejectNote('')
      const d = await loadTaskDetail(task!.id)
      setDetail(d)
    })
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-[#05141C] border-l border-[#38435C] z-50 overflow-y-auto">
        <div className="sticky top-0 bg-[#05141C] border-b border-[#38435C] px-5 py-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#EBEBEB]">{task.title}</p>
            <p className="text-[11px] text-[#87919E] mt-0.5">
              {task.popCode ? `${task.popCode} · ` : ''}{label(TYPE_LABELS, task.type)}
            </p>
          </div>
          <button onClick={onClose} className="text-[#87919E] hover:text-[#EBEBEB]"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Meta title="Cliente">
              {task.clientSlug ? <Link href={`/clients/${task.clientSlug}`} className="text-[#95BBE2] hover:underline">{task.clientName}</Link> : <span className="text-[#87919E]">Interno</span>}
            </Meta>
            <Meta title="Responsável"><span className="text-[#EBEBEB] flex items-center gap-1"><UserIcon size={11} />{task.assigneeName}</span></Meta>
            <Meta title="Prioridade"><span className="text-[#EBEBEB]">{label(PRIORITY_LABELS, task.priority)}</span></Meta>
            <Meta title="Prazo"><span className="text-[#EBEBEB] flex items-center gap-1"><Clock size={11} />{task.dueDate ? new Date(task.dueDate).toLocaleDateString('pt-BR') : '—'}</span></Meta>
            {task.areaName && <Meta title="Área"><span className="text-[#EBEBEB]">{task.areaName}</span></Meta>}
          </div>

          {/* Status */}
          <div>
            <p className="text-[10px] font-medium text-[#87919E] uppercase tracking-wider mb-1">Status</p>
            {canEdit ? (
              <select
                value={task.status}
                onChange={(e) => handleStatus(e.target.value)}
                disabled={isPending}
                className="w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-2 text-xs text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              >
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{label(STATUS_LABELS, s)}</option>)}
              </select>
            ) : (
              <span className="text-xs text-[#EBEBEB]">{label(STATUS_LABELS, task.status)}</span>
            )}
          </div>

          {loading && <p className="text-[11px] text-[#87919E]">Carregando…</p>}

          {/* Checklist */}
          {detail && detail.checklist.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-[#87919E] uppercase tracking-wider mb-1">Checklist</p>
              <div className="space-y-1">
                {detail.checklist.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => canEdit && handleToggle(it.id, !it.done)}
                    disabled={!canEdit || isPending}
                    className="flex items-center gap-2 text-xs text-left w-full disabled:opacity-60"
                  >
                    {it.done ? <CheckSquare size={14} className="text-[#22C55E]" /> : <Square size={14} className="text-[#87919E]" />}
                    <span className={it.done ? 'line-through text-[#87919E]' : 'text-[#EBEBEB]'}>
                      {it.label}{it.required && !it.done && <span className="text-[#EF4444]"> *</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Validação da CS (OPE-06 / CSX-10) */}
          {detail && (detail.canSubmit || detail.canValidate || detail.status === 'AGUARDANDO_CS' || detail.status === 'EM_VALIDACAO' || detail.evidence) && (
            <div className="border border-[#38435C] rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-[#95BBE2]" />
                <p className="text-[10px] font-medium text-[#87919E] uppercase tracking-wider">Validação da CS</p>
              </div>

              {/* Evidência */}
              <div>
                <p className="text-[10px] text-[#87919E] mb-1">Evidência do que foi feito</p>
                {detail.canSubmit ? (
                  <textarea
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value)}
                    rows={3}
                    placeholder="Resultado do check-in, link do relatório, próxima ação definida…"
                    className="w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-1.5 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/50 focus:outline-none focus:border-[#95BBE2]/50"
                  />
                ) : (
                  <p className="text-xs text-[#EBEBEB] whitespace-pre-wrap">{detail.evidence || '—'}</p>
                )}
              </div>

              {detail.canSubmit && (
                <>
                  {detail.requiredOpen > 0 && (
                    <p className="text-[11px] text-[#EAB308]">Faltam {detail.requiredOpen} item(ns) obrigatório(s) do checklist.</p>
                  )}
                  <button
                    onClick={handleSubmitValidation}
                    disabled={isPending}
                    className="w-full text-xs text-[#95BBE2] border border-[#95BBE2]/30 rounded-lg px-3 py-2 hover:bg-[#95BBE2]/10 disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <Send size={13} /> Enviar para validação da CS
                  </button>
                </>
              )}

              {detail.canValidate && (detail.status === 'AGUARDANDO_CS' || detail.status === 'EM_VALIDACAO') && (
                <div className="space-y-2 pt-1">
                  <input
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="Motivo (obrigatório p/ solicitar ajustes)"
                    className="w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-1.5 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/50 focus:outline-none focus:border-[#95BBE2]/50"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDecide(true)}
                      disabled={isPending}
                      className="flex-1 text-xs text-[#22C55E] border border-[#22C55E]/30 rounded-lg px-3 py-2 hover:bg-[#22C55E]/10 disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <CheckSquare size={13} /> Aprovar
                    </button>
                    <button
                      onClick={() => handleDecide(false)}
                      disabled={isPending}
                      className="flex-1 text-xs text-[#F59E0B] border border-[#F59E0B]/30 rounded-lg px-3 py-2 hover:bg-[#F59E0B]/10 disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw size={13} /> Solicitar ajustes
                    </button>
                  </div>
                </div>
              )}

              {actionError && <p className="text-[11px] text-[#EF4444]">{actionError}</p>}

              {/* Histórico de decisões */}
              {detail.approvals.filter((a) => a.decidedAt).length > 0 && (
                <div className="space-y-1 pt-1">
                  {detail.approvals.filter((a) => a.decidedAt).map((a) => (
                    <p key={a.id} className="text-[10px] text-[#87919E]">
                      {a.approved ? <span className="text-[#22C55E]">✓ Aprovado</span> : <span className="text-[#F59E0B]">↺ Ajustes solicitados</span>}
                      {' '}por {a.approverName}{a.note ? ` · ${a.note}` : ''}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Comentários */}
          <div>
            <p className="text-[10px] font-medium text-[#87919E] uppercase tracking-wider mb-1">Comentários</p>
            {canEdit && (
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Escreva um comentário…"
                  className="flex-1 bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-1.5 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/50 focus:outline-none focus:border-[#95BBE2]/50"
                />
                <button onClick={handleComment} disabled={isPending} className="text-[#95BBE2] border border-[#95BBE2]/30 rounded-lg px-2.5 py-1.5 hover:bg-[#95BBE2]/10 disabled:opacity-50">
                  <Send size={13} />
                </button>
              </div>
            )}
            <div className="space-y-2">
              {detail?.comments.map((c) => (
                <div key={c.id} className="text-xs">
                  <p className="text-[#EBEBEB] whitespace-pre-wrap">{c.body}</p>
                  <p className="text-[10px] text-[#87919E]">{c.authorName} · {new Date(c.createdAt).toLocaleString('pt-BR')}</p>
                </div>
              ))}
              {detail && detail.comments.length === 0 && <p className="text-[11px] text-[#87919E]">Sem comentários.</p>}
            </div>
          </div>

          {/* Atividade */}
          {detail && detail.activities.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-[#87919E] uppercase tracking-wider mb-1">Atividade</p>
              <div className="space-y-1">
                {detail.activities.map((a) => (
                  <p key={a.id} className="text-[10px] text-[#87919E]">
                    {a.actorName} · {describeActivity(a.action, a.fromValue, a.toValue)} · {new Date(a.createdAt).toLocaleString('pt-BR')}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function describeActivity(action: string, from: string | null, to: string | null): string {
  switch (action) {
    case 'status_changed': return `status: ${label(STATUS_LABELS, from ?? '')} → ${label(STATUS_LABELS, to ?? '')}`
    case 'created': return 'criou a tarefa'
    case 'created_by_recurrence': return 'gerada por recorrência'
    case 'commented': return 'comentou'
    case 'submitted_for_validation': return 'enviou para validação da CS'
    case 'validation_approved': return 'aprovou a validação'
    case 'validation_changes_requested': return 'solicitou ajustes'
    default: return action
  }
}

function Meta({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-[#87919E] uppercase tracking-wider">{title}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}
