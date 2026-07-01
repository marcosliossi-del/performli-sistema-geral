'use client'

import type { ReactNode } from 'react'
import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  X, Send, Square, CheckSquare, User as UserIcon, ShieldCheck,
  RotateCcw, Eye, Tag as TagIcon, Paperclip,
} from 'lucide-react'
import { updateTaskStatus, updateTaskFields } from '@/app/actions/tasks'
import {
  addTaskComment, toggleChecklistItem, loadTaskDetail,
  submitTaskForValidation, decideTaskValidation, type TaskDetail,
} from '@/app/actions/operacional'
import type { OperacionalTask } from '@/lib/dal'
import type { TaskStatus, TaskPriority, SupportCategory } from '@prisma/client'
import { toast } from '@/lib/toast'
import {
  STATUS_LABELS, STATUS_COLORS, STATUS_OPTIONS, PRIORITY_LABELS, PRIORITY_COLORS, PRIORITY_OPTIONS, TYPE_LABELS, label,
} from './labels'
import { useModalA11y } from '@/lib/useModalA11y'

type Tab = 'comentarios' | 'atividade' | 'anexos'

export type TaskUser = { id: string; name: string }

// Campos que a edição inline pode devolver ao board pai (atualização otimista).
export type TaskPatch = {
  title?: string
  status?: TaskStatus
  priority?: TaskPriority
  assigneeName?: string
  dueDate?: string | null
  category?: SupportCategory | null
}

const CATEGORY_OPTIONS: { value: SupportCategory; label: string }[] = [
  { value: 'TRAFEGO', label: 'Tráfego' },
  { value: 'DEMANDA_DA_AGENCIA', label: 'Demanda da Agência' },
  { value: 'SUCESSO_DO_CLIENTE', label: 'Sucesso do Cliente' },
]

// Date → 'yyyy-mm-dd' local para <input type=date>.
function toDateInput(d: Date | null | undefined): string {
  if (!d) return ''
  const x = new Date(d)
  const mm = String(x.getMonth() + 1).padStart(2, '0')
  const dd = String(x.getDate()).padStart(2, '0')
  return `${x.getFullYear()}-${mm}-${dd}`
}

export function TaskDrawer({
  task, canEdit, users = [], onClose, onPatch,
}: {
  task: OperacionalTask | null
  canEdit: boolean
  users?: TaskUser[]
  onClose: () => void
  onPatch?: (taskId: string, patch: TaskPatch) => void
}) {
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [comment, setComment] = useState('')
  const [evidence, setEvidence] = useState('')
  const [rejectNote, setRejectNote] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('comentarios')
  const [statusResetKey, setStatusResetKey] = useState(0)
  const [isPending, startTransition] = useTransition()
  const dialogRef = useModalA11y<HTMLElement>(onClose)

  // Campos editáveis inline (estilo ClickUp) — estado local com autosave.
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const dialogRefKey = task?.id

  useEffect(() => {
    if (!task) { setDetail(null); return }
    setLoading(true)
    setEvidence('')
    setRejectNote('')
    setActionError(null)
    setTab('comentarios')
    setEditTitle(task.title)
    setEditDesc('')
    loadTaskDetail(task.id).then((d) => {
      setDetail(d)
      setEvidence(d?.evidence ?? '')
      if (d) { setEditTitle(d.meta.title); setEditDesc(d.meta.description ?? '') }
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogRefKey])

  if (!task) return null

  async function reload() {
    const d = await loadTaskDetail(task!.id)
    setDetail(d)
  }
  function handleStatus(status: string) {
    if (status === 'CONCLUIDO' && requiredOpen > 0) {
      toast('Conclua os itens obrigatórios do checklist antes de concluir a tarefa', 'err')
      setStatusResetKey((k) => k + 1) // devolve o select ao valor atual
      return
    }
    startTransition(async () => {
      await updateTaskStatus(task!.id, status as TaskStatus)
      onPatch?.(task!.id, { status: status as TaskStatus })
      await reload()
    })
  }

  // Autosave de um campo. Em erro: toast + recarrega (reverte a UI ao servidor).
  function saveFields(
    patch: Parameters<typeof updateTaskFields>[1],
    parentPatch: TaskPatch,
  ) {
    startTransition(async () => {
      const r = await updateTaskFields(task!.id, patch)
      if (r && 'error' in r) {
        toast(r.error, 'err')
        await reload()
        const d = await loadTaskDetail(task!.id)
        if (d) { setEditTitle(d.meta.title); setEditDesc(d.meta.description ?? '') }
        return
      }
      onPatch?.(task!.id, parentPatch)
      await reload()
    })
  }
  function saveTitle() {
    const v = editTitle.trim()
    if (v === (m?.title ?? task!.title)) return
    if (v.length < 3) { toast('O título precisa de pelo menos 3 caracteres.', 'err'); setEditTitle(m?.title ?? task!.title); return }
    saveFields({ title: v }, { title: v })
  }
  function saveDesc() {
    const v = editDesc
    if ((v.trim() || null) === (m?.description ?? null)) return
    saveFields({ description: v.trim() ? v : null }, {})
  }
  function saveAssignee(userId: string) {
    if (userId === m?.assignedTo) return
    const name = users.find((u) => u.id === userId)?.name
    saveFields({ assignedTo: userId }, name ? { assigneeName: name } : {})
  }
  function saveDue(value: string) {
    const iso = value ? new Date(`${value}T12:00:00`).toISOString() : null
    saveFields({ dueDate: iso }, { dueDate: iso })
  }
  function savePriority(value: string) {
    saveFields({ priority: value as TaskPriority }, { priority: value as TaskPriority })
  }
  function saveCategory(value: string) {
    const cat = value ? (value as SupportCategory) : null
    saveFields({ supportCategory: cat }, { category: cat })
  }
  function handleComment() {
    if (!comment.trim()) return
    startTransition(async () => { await addTaskComment(task!.id, comment); setComment(''); await reload(); toast('Comentário adicionado') })
  }
  function handleToggle(itemId: string, done: boolean) {
    startTransition(async () => { await toggleChecklistItem(itemId, done); await reload() })
  }
  function handleSubmitValidation() {
    setActionError(null)
    startTransition(async () => {
      const r = await submitTaskForValidation(task!.id, evidence)
      if ('error' in r) { setActionError(r.error); toast(r.error, 'err'); return }
      await reload()
      toast('Enviado para validação da CS')
    })
  }
  function handleDecide(approved: boolean) {
    setActionError(null)
    startTransition(async () => {
      const r = await decideTaskValidation(task!.id, approved, approved ? undefined : rejectNote)
      if ('error' in r) { setActionError(r.error); toast(r.error, 'err'); return }
      setRejectNote('')
      await reload()
      toast(approved ? 'Validação aprovada' : 'Ajustes solicitados', approved ? 'ok' : 'info')
    })
  }
  function handleComplete() {
    startTransition(async () => {
      await updateTaskStatus(task!.id, 'CONCLUIDO' as TaskStatus)
      onPatch?.(task!.id, { status: 'CONCLUIDO' as TaskStatus })
      await reload()
      toast('Tarefa concluída')
    })
  }

  const m = detail?.meta
  const status = detail?.status ?? task.status
  const requiredOpen = detail?.requiredOpen ?? 0
  const isValidating = !!detail?.canValidate && (status === 'AGUARDANDO_CS' || status === 'EM_VALIDACAO')
  const isOverdue = m?.dueDate != null && new Date(m.dueDate).getTime() < Date.now() && status !== 'CONCLUIDO' && status !== 'CANCELADO'
  const fmtDate = (d: Date | null | undefined) => (d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')

  return (
    <>
      <div className="ak-scrim fixed inset-0 bg-black/55 z-40" onClick={onClose} />
      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Tarefa: ${task.title}`}
        className="ak-drawer ak-glass-strong fixed right-0 top-0 h-screen w-full max-w-[580px] border-l border-[#38435C] z-50 flex flex-col shadow-[-20px_0_60px_rgba(0,0,0,0.4)]"
      >
        {/* ── Topo: breadcrumb + título + controles ── */}
        <div className="px-5 py-4 border-b border-[#38435C]">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[11px] text-[#87919E] flex items-center gap-1.5 flex-wrap">
              {m?.areaName && <span>{m.areaName}</span>}
              {m?.listName && <><span className="text-[#576070]">▸</span><span>{m.listName}</span></>}
              {(task.popCode || m?.popCode) && <><span className="text-[#576070]">▸</span><span className="text-[#95BBE2]">{task.popCode ?? m?.popCode}</span></>}
            </div>
            <button onClick={onClose} className="text-[#87919E] hover:text-[#EBEBEB] shrink-0"><X size={18} /></button>
          </div>
          {canEdit ? (
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
                if (e.key === 'Escape') { setEditTitle(m?.title ?? task.title); e.currentTarget.blur() }
              }}
              disabled={isPending}
              aria-label="Título da tarefa"
              className="w-full bg-transparent text-[17px] font-bold text-[#EBEBEB] leading-snug mt-2 rounded-md px-1 -ml-1 py-0.5 hover:bg-white/[0.04] focus:bg-[#0A1E2C] focus:outline-none focus:ring-1 focus:ring-[#95BBE2]/50"
            />
          ) : (
            <h2 className="text-[17px] font-bold text-[#EBEBEB] leading-snug mt-2">{task.title}</h2>
          )}
          <div className="flex items-center gap-2.5 mt-3 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${STATUS_COLORS[status] ?? 'text-[#87919E] border-[#38435C]'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />{label(STATUS_LABELS, status)}
            </span>
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${PRIORITY_COLORS[task.priority] ?? 'text-[#87919E]'}`}>
              {label(PRIORITY_LABELS, task.priority)}
            </span>
            {task.clientName && (
              task.clientSlug
                ? <Link href={`/clients/${task.clientSlug}`} className="text-[11px] text-[#95BBE2] hover:underline">{task.clientName}</Link>
                : <span className="text-[11px] text-[#87919E]">{task.clientName}</span>
            )}
          </div>
        </div>

        {/* ── Corpo: 2 colunas ── */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-[1fr_190px]">
          {/* Coluna principal */}
          <div className="p-5 md:border-r border-[#38435C]/50 space-y-1">
            {loading && <p className="text-[11px] text-[#87919E]">Carregando…</p>}

            {canEdit ? (
              <>
                <Sec>Descrição</Sec>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  onBlur={saveDesc}
                  rows={3}
                  disabled={isPending}
                  placeholder="Descreva o que precisa ser feito, o contexto e o resultado esperado."
                  className="w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-2 text-[12.5px] text-[#EBEBEB] leading-relaxed placeholder:text-[#87919E]/60 focus:outline-none focus:border-[#95BBE2]/50 resize-y"
                />
              </>
            ) : m?.description ? (
              <>
                <Sec>Descrição</Sec>
                <p className="text-[12.5px] text-[#9fb0c0] leading-relaxed whitespace-pre-wrap">{m.description}</p>
              </>
            ) : null}

            {/* Checklist obrigatório */}
            {detail && detail.checklist.length > 0 && (
              <>
                <Sec>Checklist obrigatório</Sec>
                <div>
                  {detail.checklist.map((it) => {
                    const reqEmpty = it.required && !it.done
                    return (
                      <button
                        key={it.id}
                        onClick={() => canEdit && handleToggle(it.id, !it.done)}
                        disabled={!canEdit || isPending}
                        className="flex items-center gap-2.5 py-2 w-full text-left text-[12.5px] border-b border-[#38435C]/40 disabled:opacity-70"
                      >
                        {it.done
                          ? <CheckSquare size={16} className="text-[#22C55E] shrink-0" />
                          : <Square size={16} className={`shrink-0 ${reqEmpty ? 'text-[#EF4444]' : 'text-[#87919E]'}`} />}
                        <span className={it.done ? 'line-through text-[#87919E]' : reqEmpty ? 'text-[#EF4444]' : 'text-[#EBEBEB]'}>
                          {it.label}
                        </span>
                        {reqEmpty && <span className="ml-auto text-[9px] font-semibold text-[#EF4444] bg-[#EF4444]/10 px-1.5 py-0.5 rounded">obrigatório</span>}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {/* Evidência de conclusão */}
            <Sec>Evidência de conclusão</Sec>
            {detail?.canSubmit ? (
              <textarea
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                rows={3}
                placeholder="Anexe o print do dashboard ou cole o resumo do check-in. Obrigatório para tarefas críticas."
                className="w-full bg-[#0A1E2C] border border-dashed border-[#38435C] rounded-lg px-3 py-2.5 text-[12px] text-[#EBEBEB] placeholder:text-[#87919E]/60 focus:outline-none focus:border-[#95BBE2]/50"
              />
            ) : (
              <div className="bg-[#0A1E2C] border border-dashed border-[#38435C] rounded-lg px-3 py-2.5 text-[11.5px] text-[#9fb0c0] whitespace-pre-wrap">
                {detail?.evidence || 'Sem evidência registrada.'}
              </div>
            )}

            {/* Histórico de decisões da CS */}
            {detail && detail.approvals.filter((a) => a.decidedAt).length > 0 && (
              <div className="mt-3 space-y-1">
                {detail.approvals.filter((a) => a.decidedAt).map((a) => (
                  <p key={a.id} className="text-[10px] text-[#87919E]">
                    {a.approved ? <span className="text-[#22C55E]">✓ Aprovado</span> : <span className="text-[#F59E0B]">↺ Ajustes solicitados</span>}
                    {' '}por {a.approverName}{a.note ? ` · ${a.note}` : ''}
                  </p>
                ))}
              </div>
            )}

            {/* Abas */}
            <div className="flex gap-1 mt-5 border-b border-[#38435C]/50">
              <TabBtn active={tab === 'comentarios'} onClick={() => setTab('comentarios')}>Comentários</TabBtn>
              <TabBtn active={tab === 'atividade'} onClick={() => setTab('atividade')}>Atividade</TabBtn>
              <TabBtn active={tab === 'anexos'} onClick={() => setTab('anexos')}>Anexos</TabBtn>
            </div>

            {tab === 'comentarios' && (
              <div className="pt-3">
                {canEdit && (
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleComment()}
                      placeholder="Escreva um comentário…"
                      className="flex-1 bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-1.5 text-[12px] text-[#EBEBEB] placeholder:text-[#87919E]/50 focus:outline-none focus:border-[#95BBE2]/50"
                    />
                    <button onClick={handleComment} disabled={isPending} className="text-[#95BBE2] border border-[#95BBE2]/30 rounded-lg px-2.5 py-1.5 hover:bg-[#95BBE2]/10 disabled:opacity-50"><Send size={13} /></button>
                  </div>
                )}
                <div className="space-y-2.5">
                  {detail?.comments.map((c) => (
                    <div key={c.id} className="text-[12px]">
                      <p className="text-[#EBEBEB] whitespace-pre-wrap">{c.body}</p>
                      <p className="text-[10px] text-[#87919E] mt-0.5">{c.authorName} · {new Date(c.createdAt).toLocaleString('pt-BR')}</p>
                    </div>
                  ))}
                  {detail && detail.comments.length === 0 && <p className="text-[11px] text-[#87919E]">Sem comentários.</p>}
                </div>
              </div>
            )}

            {tab === 'atividade' && (
              <div className="pt-3 space-y-1.5">
                {detail?.activities.map((a) => (
                  <p key={a.id} className="text-[11px] text-[#87919E]">
                    <span className="text-[#9fb0c0]">{a.actorName}</span> {describeActivity(a.action, a.fromValue, a.toValue)}
                    <span className="text-[#576070] font-mono"> · {new Date(a.createdAt).toLocaleString('pt-BR')}</span>
                  </p>
                ))}
                {detail && detail.activities.length === 0 && <p className="text-[11px] text-[#87919E]">Sem atividade.</p>}
              </div>
            )}

            {tab === 'anexos' && (
              <div className="pt-4 text-center">
                <Paperclip size={20} className="text-[#576070] mx-auto mb-1.5" />
                <p className="text-[11px] text-[#87919E]">Nenhum anexo nesta tarefa.</p>
              </div>
            )}
          </div>

          {/* Coluna lateral */}
          <div className="p-4 space-y-3.5 bg-[#0A1E2C]/30">
            {canEdit && (
              <Field k="Status">
                <select
                  key={statusResetKey}
                  value={status}
                  onChange={(e) => handleStatus(e.target.value)}
                  disabled={isPending || status === 'CONCLUIDO'}
                  title={status === 'CONCLUIDO' ? 'Tarefa concluída. Reabra pelo fluxo de conclusão.' : undefined}
                  className="w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-2 py-1.5 text-[11px] text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50 disabled:opacity-60"
                >
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{label(STATUS_LABELS, s)}</option>)}
                </select>
              </Field>
            )}
            <Field k="Responsável">
              {canEdit && users.length > 0 ? (
                <select
                  value={m?.assignedTo ?? ''}
                  onChange={(e) => saveAssignee(e.target.value)}
                  disabled={isPending}
                  className="w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-2 py-1.5 text-[11px] text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
                >
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              ) : (
                <span className="flex items-center gap-1.5"><UserIcon size={11} />{m?.assigneeName ?? task.assigneeName}</span>
              )}
            </Field>
            {canEdit && (
              <Field k="Prioridade">
                <select
                  value={m?.priority ?? task.priority}
                  onChange={(e) => savePriority(e.target.value)}
                  disabled={isPending}
                  className="w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-2 py-1.5 text-[11px] text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
                >
                  {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{label(PRIORITY_LABELS, p)}</option>)}
                </select>
              </Field>
            )}
            {canEdit && m?.isSupport && (
              <Field k="Categoria">
                <select
                  value={m?.supportCategory ?? ''}
                  onChange={(e) => saveCategory(e.target.value)}
                  disabled={isPending}
                  className="w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-2 py-1.5 text-[11px] text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
                >
                  <option value="">Sem categoria</option>
                  {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
            )}
            {m?.watcherNames && m.watcherNames.length > 0 && (
              <Field k="Observadores"><span className="flex items-center gap-1.5"><Eye size={11} />{m.watcherNames.join(' · ')}</span></Field>
            )}
            {m?.requesterName && <Field k="Solicitante">{m.requesterName}</Field>}
            <Field k="Data do pedido">{fmtDate(m?.requestedAt ?? task.requestedAt)}</Field>
            {m?.startDate && <Field k="Início">{fmtDate(m.startDate)}</Field>}
            <Field k="Prazo">
              {canEdit ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={toDateInput(m?.dueDate ?? task.dueDate)}
                    onChange={(e) => saveDue(e.target.value)}
                    disabled={isPending}
                    className={`bg-[#0A1E2C] border rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:border-[#95BBE2]/50 ${isOverdue ? 'border-[#EF4444]/50 text-[#EF4444]' : 'border-[#38435C] text-[#EBEBEB]'}`}
                  />
                  {(m?.dueDate ?? task.dueDate) && (
                    <button onClick={() => saveDue('')} disabled={isPending} title="Limpar prazo" className="text-[#87919E] hover:text-[#EF4444] disabled:opacity-50"><X size={13} /></button>
                  )}
                </div>
              ) : (
                <span className={isOverdue ? 'text-[#EF4444]' : ''}>{fmtDate(m?.dueDate ?? task.dueDate)}{isOverdue ? ' (atrasado)' : ''}</span>
              )}
            </Field>
            {m?.slaHours != null && (
              <Field k="SLA"><span className={`font-mono ${m.slaBreached ? 'text-[#EF4444]' : 'text-[#9fb0c0]'}`}>{m.slaHours}h{m.slaBreached ? ' · estourado' : ''}</span></Field>
            )}
            <Field k="Área">{m?.areaName ?? task.areaName ?? '—'}</Field>
            <Field k="Tipo">{label(TYPE_LABELS, m?.type ?? task.type)}</Field>
            {m?.tags && m.tags.length > 0 && (
              <Field k="Tags">
                <span className="flex items-center gap-1.5 flex-wrap">
                  <TagIcon size={10} />{m.tags.join(' · ')}
                </span>
              </Field>
            )}
          </div>
        </div>

        {/* ── Rodapé: avisos + ações ── */}
        <div className="px-5 py-3.5 border-t border-[#38435C] flex items-center gap-2.5 ak-glass-strong">
          {requiredOpen > 0 && (
            <span className="text-[11px] text-[#EF4444] mr-auto">⚠ {requiredOpen} {requiredOpen === 1 ? 'campo obrigatório pendente' : 'campos obrigatórios pendentes'}</span>
          )}
          {actionError && <span className="text-[11px] text-[#EF4444] mr-auto">{actionError}</span>}
          {requiredOpen === 0 && !actionError && <span className="mr-auto" />}

          {isValidating ? (
            <>
              <input
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Motivo p/ ajustes"
                className="w-36 bg-[#0A1E2C] border border-[#38435C] rounded-lg px-2.5 py-1.5 text-[11px] text-[#EBEBEB] placeholder:text-[#87919E]/50 focus:outline-none focus:border-[#95BBE2]/50"
              />
              <button onClick={() => handleDecide(false)} disabled={isPending} className="text-[12px] text-[#F59E0B] border border-[#F59E0B]/30 rounded-lg px-3 py-2 hover:bg-[#F59E0B]/10 disabled:opacity-50 flex items-center gap-1.5"><RotateCcw size={13} /> Ajustes</button>
              <button onClick={() => handleDecide(true)} disabled={isPending} className="text-[12px] font-semibold text-[#021015] bg-gradient-to-b from-[#46d98a] to-[#22C55E] rounded-lg px-3.5 py-2 disabled:opacity-50 flex items-center gap-1.5"><CheckSquare size={13} /> Aprovar</button>
            </>
          ) : detail?.canSubmit ? (
            <>
              <button onClick={handleSubmitValidation} disabled={isPending} className="text-[12px] text-[#95BBE2] border border-[#95BBE2]/30 rounded-lg px-3 py-2 hover:bg-[#95BBE2]/10 disabled:opacity-50 flex items-center gap-1.5"><Send size={13} /> Enviar para CS</button>
              <button
                onClick={handleComplete}
                disabled={isPending || requiredOpen > 0}
                className={`text-[12px] font-semibold rounded-lg px-3.5 py-2 flex items-center gap-1.5 ${requiredOpen > 0 ? 'bg-[#38435C] text-[#87919E] cursor-not-allowed' : 'text-[#021015] bg-gradient-to-b from-[#46d98a] to-[#22C55E]'}`}
              >
                <CheckSquare size={13} /> Concluir
              </button>
            </>
          ) : canEdit && status !== 'CONCLUIDO' && status !== 'CANCELADO' ? (
            <button
              onClick={handleComplete}
              disabled={isPending || requiredOpen > 0}
              className={`text-[12px] font-semibold rounded-lg px-3.5 py-2 flex items-center gap-1.5 ${requiredOpen > 0 ? 'bg-[#38435C] text-[#87919E] cursor-not-allowed' : 'text-[#021015] bg-gradient-to-b from-[#46d98a] to-[#22C55E]'}`}
            >
              <CheckSquare size={13} /> Concluir
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[#22C55E]"><ShieldCheck size={13} /> {label(STATUS_LABELS, status)}</span>
          )}
        </div>
      </aside>
    </>
  )
}

function Sec({ children }: { children: ReactNode }) {
  return <p className="text-[10px] font-semibold text-[#87919E] uppercase tracking-wider mt-5 first:mt-0 mb-2">{children}</p>
}
function Field({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[9.5px] font-semibold text-[#87919E] uppercase tracking-wider mb-1">{k}</p>
      <div className="text-[12px] text-[#EBEBEB]">{children}</div>
    </div>
  )
}
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`px-3 py-2 text-[11.5px] font-medium border-b-2 -mb-px transition-colors ${active ? 'text-[#95BBE2] border-[#95BBE2]' : 'text-[#87919E] border-transparent hover:text-[#EBEBEB]'}`}>
      {children}
    </button>
  )
}

function describeActivity(action: string, from: string | null, to: string | null): string {
  switch (action) {
    case 'status_changed': return `mudou status: ${label(STATUS_LABELS, from ?? '')} → ${label(STATUS_LABELS, to ?? '')}`
    case 'field_changed': {
      // fromValue/toValue chegam como "campo: valor" — renderiza legível.
      const sep = (to ?? '').indexOf(': ')
      const field = sep >= 0 ? (to ?? '').slice(0, sep) : 'campo'
      const oldV = from ? (from.indexOf(': ') >= 0 ? from.slice(from.indexOf(': ') + 2) : from) : ''
      const newV = to ? (sep >= 0 ? to.slice(sep + 2) : to) : ''
      return `alterou ${field} de "${oldV}" para "${newV}"`
    }
    case 'created': return 'criou a tarefa'
    case 'created_by_recurrence': return 'gerada por recorrência'
    case 'commented': return 'comentou'
    case 'submitted_for_validation': return 'enviou para validação da CS'
    case 'validation_approved': return 'aprovou a validação'
    case 'validation_changes_requested': return 'solicitou ajustes'
    default: return action
  }
}
