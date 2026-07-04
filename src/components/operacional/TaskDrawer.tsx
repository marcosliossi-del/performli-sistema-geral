'use client'

import type { ReactNode } from 'react'
import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  X, Send, Square, CheckSquare, User as UserIcon, ShieldCheck,
  RotateCcw, Eye, Tag as TagIcon, Paperclip, ExternalLink,
} from 'lucide-react'
import { updateTaskStatus } from '@/app/actions/tasks'
import {
  addTaskComment, toggleChecklistItem, loadTaskDetail,
  submitTaskForValidation, decideTaskValidation, type TaskDetail,
} from '@/app/actions/operacional'
import type { OperacionalTask } from '@/lib/dal'
import type { TaskStatus } from '@prisma/client'
import { toast } from '@/lib/toast'
import {
  STATUS_LABELS, STATUS_COLORS, STATUS_OPTIONS, PRIORITY_LABELS, PRIORITY_COLORS, TYPE_LABELS, label,
} from './labels'
import { useModalA11y } from '@/lib/useModalA11y'

type Tab = 'comentarios' | 'atividade' | 'anexos'

export function TaskDrawer({
  task, canEdit, canEditStatusOnly = false, currentUser, onClose,
}: {
  task: OperacionalTask | null
  canEdit: boolean
  /** GESTOR_TRAFEGO: só muda status, sem editar campos. */
  canEditStatusOnly?: boolean
  currentUser: { id: string; name: string }
  onClose: () => void
}) {
  // GESTOR_TRAFEGO move de coluna (status), mas não edita campos/checklist.
  const canChangeStatus = canEdit || canEditStatusOnly
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [comment, setComment] = useState('')
  const [evidence, setEvidence] = useState('')
  const [completionNotes, setCompletionNotes] = useState('')
  const [rejectNote, setRejectNote] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('comentarios')
  const [statusResetKey, setStatusResetKey] = useState(0)
  const [isPending, startTransition] = useTransition()
  const dialogRef = useModalA11y<HTMLElement>(onClose)

  useEffect(() => {
    if (!task) { setDetail(null); return }
    setLoading(true)
    setEvidence('')
    setCompletionNotes('')
    setRejectNote('')
    setActionError(null)
    setTab('comentarios')
    loadTaskDetail(task.id).then((d) => {
      setDetail(d)
      setEvidence(d?.evidence ?? '')
      setCompletionNotes(d?.completionNotes ?? '')
      setLoading(false)
    })
  }, [task])

  if (!task) return null

  async function reload() {
    const d = await loadTaskDetail(task!.id)
    setDetail(d)
  }
  function handleStatus(status: string) {
    if (status === 'CONCLUIDO') {
      // Concluir passa pelo mesmo fluxo do botão (envia "o que foi feito" +
      // evidência e valida os obrigatórios) — nunca vira dead-end.
      setStatusResetKey((k) => k + 1) // devolve o select ao valor atual
      handleComplete()
      return
    }
    startTransition(async () => {
      try {
        const r = await updateTaskStatus(task!.id, status as TaskStatus)
        if ('error' in r) {
          toast(r.error, 'err')
          setStatusResetKey((k) => k + 1)
          return
        }
        await reload()
      } catch (e) {
        toast(e instanceof Error && e.message ? e.message : 'Não foi possível alterar o status da tarefa.', 'err')
        setStatusResetKey((k) => k + 1)
      }
    })
  }
  function handleComment() {
    const body = comment.trim()
    if (!body || !detail) return
    // Append otimista: responde instantâneo e reconcilia o registro real
    // (id do banco) em background. ROLLBACK remove o otimista no caminho {error}.
    const tempId = `tmp-${Date.now()}`
    const optimistic = { id: tempId, body, authorName: currentUser.name, createdAt: new Date() }
    setDetail((d) => (d ? { ...d, comments: [...d.comments, optimistic] } : d))
    setComment('')
    startTransition(async () => {
      const r = await addTaskComment(task!.id, body)
      if ('error' in r) {
        setDetail((d) => (d ? { ...d, comments: d.comments.filter((c) => c.id !== tempId) } : d))
        setComment(body)
        toast(r.error, 'err')
        return
      }
      setDetail((d) => (d
        ? {
            ...d,
            comments: d.comments.map((c) => (c.id === tempId
              ? { id: r.comment.id, body: r.comment.body, authorName: r.comment.authorName, createdAt: new Date(r.comment.createdAt) }
              : c)),
          }
        : d))
      toast('Comentário adicionado')
    })
  }
  function handleToggle(itemId: string, done: boolean) {
    if (!detail) return
    // Patch local do item + recálculo dos obrigatórios pendentes (resposta
    // instantânea); confirma em background e ROLLBACK ao estado anterior no erro.
    const prev = detail
    setDetail((d) => {
      if (!d) return d
      const checklist = d.checklist.map((it) => (it.id === itemId ? { ...it, done } : it))
      const requiredOpen = checklist.filter((it) => it.required && !it.done).length
      return { ...d, checklist, requiredOpen }
    })
    startTransition(async () => {
      const r = await toggleChecklistItem(itemId, done)
      if ('error' in r) { setDetail(prev); toast(r.error, 'err') }
    })
  }
  function handleSubmitValidation() {
    setActionError(null)
    startTransition(async () => {
      const r = await submitTaskForValidation(task!.id, evidence, completionNotes)
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
    if (requiredOpen > 0) {
      toast('Conclua os itens obrigatórios do checklist antes de concluir a tarefa', 'err')
      return
    }
    const notes = completionNotes.trim()
    // "O que foi feito" é OPCIONAL — não bloqueia a conclusão de nenhuma tarefa.
    setActionError(null)
    startTransition(async () => {
      try {
        const r = await updateTaskStatus(task!.id, 'CONCLUIDO' as TaskStatus, {
          completionNotes: notes,
          evidence: evidence.trim(),
        })
        if ('error' in r) { setActionError(r.error); toast(r.error, 'err'); return }
        await reload()
        toast('Tarefa concluída')
      } catch (e) {
        toast(e instanceof Error && e.message ? e.message : 'Não foi possível concluir a tarefa.', 'err')
      }
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
      <div className="ak-scrim lg-overlay fixed inset-0 bg-black/55 z-40" onClick={onClose} />
      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Tarefa: ${task.title}`}
        className="ak-drawer lg-glass-strong fixed right-0 top-0 h-screen w-full max-w-[580px] border-l border-[#38435C] z-50 flex flex-col shadow-[-20px_0_60px_rgba(0,0,0,0.4)]"
      >
        {/* ── Topo: breadcrumb + título + controles ── */}
        <div className="px-5 py-4 border-b border-[#38435C]">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[11px] text-[#87919E] flex items-center gap-1.5 flex-wrap">
              {m?.areaName && <span>{m.areaName}</span>}
              {m?.listName && <><span className="text-[#576070]">▸</span><span>{m.listName}</span></>}
              {(task.popCode || m?.popCode) && <><span className="text-[#576070]">▸</span><span className="text-[#95BBE2]">{task.popCode ?? m?.popCode}</span></>}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link href={`/t/${task.id}`} className="text-[11px] text-[#95BBE2] hover:underline inline-flex items-center gap-1">
                Abrir painel completo <ExternalLink size={12} />
              </Link>
              <button onClick={onClose} className="text-[#87919E] hover:text-[#EBEBEB]"><X size={18} /></button>
            </div>
          </div>
          <h2 className="text-[17px] font-bold text-[#EBEBEB] leading-snug mt-2">{task.title}</h2>
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

            {m?.formType && m?.clientSlug && (
              <div className="mb-3 rounded-lg border border-[#95BBE2]/40 bg-[#95BBE2]/10 p-3">
                <p className="text-[12px] text-[#EBEBEB] font-semibold mb-1.5">
                  {m.formType === 'CHECKIN_MENSAL' ? 'Check-in mensal do cliente' : 'Check-in semanal do cliente'}
                </p>
                <p className="text-[11px] text-[#9fb0c0] mb-2.5">
                  Preencha as 6 etapas e gere o relatório. Ao gerar, ele é postado no chat do cliente
                  mencionando a CS para validação e envio.
                </p>
                <Link
                  href={`/clients/${m.clientSlug}#sec-visao-geral`}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0A1E2C] bg-[#95BBE2] rounded-lg px-3 py-1.5 hover:bg-[#95BBE2]/90"
                >
                  Abrir formulário de check-in <ExternalLink size={12} />
                </Link>
              </div>
            )}

            {m?.description && (
              <>
                <Sec>Descrição</Sec>
                <p className="text-[12.5px] text-[#9fb0c0] leading-relaxed whitespace-pre-wrap">{m.description}</p>
              </>
            )}

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

            {/* O que foi feito (completionNotes) — OPCIONAL, nunca bloqueia a conclusão */}
            {detail?.canSubmit && (
              <>
                <Sec>O que foi feito (opcional)</Sec>
                <textarea
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  rows={2}
                  placeholder="Resuma o que foi entregue nesta tarefa. Obrigatório para tarefas críticas."
                  className="w-full bg-[#0A1E2C] border border-dashed border-[#38435C] rounded-lg px-3 py-2.5 text-[12px] text-[#EBEBEB] placeholder:text-[#87919E]/60 focus:outline-none focus:border-[#95BBE2]/50"
                />
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
            {!detail?.canSubmit && detail?.completionNotes && (
              <>
                <Sec>O que foi feito</Sec>
                <div className="bg-[#0A1E2C] border border-dashed border-[#38435C] rounded-lg px-3 py-2.5 text-[11.5px] text-[#9fb0c0] whitespace-pre-wrap">
                  {detail.completionNotes}
                </div>
              </>
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
            {canChangeStatus && (
              <Field k="Status">
                <select
                  key={statusResetKey}
                  value={status}
                  onChange={(e) => handleStatus(e.target.value)}
                  disabled={isPending}
                  className="w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-2 py-1.5 text-[11px] text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
                >
                  {/* T-27: se o estado atual não é escolhível (ex.: ATRASADO,
                      automático), ainda assim precisa aparecer selecionado — como
                      opção desabilitada — para o select não mostrar valor vazio.
                      O usuário move para os demais status normalmente. */}
                  {!STATUS_OPTIONS.includes(status) && (
                    <option value={status} disabled>{label(STATUS_LABELS, status)} (atual)</option>
                  )}
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{label(STATUS_LABELS, s)}</option>)}
                </select>
                {!canEdit && canEditStatusOnly && (
                  <p className="text-[10px] text-[#87919E] mt-1">Seu perfil altera apenas o status da tarefa.</p>
                )}
              </Field>
            )}
            <Field k="Responsável"><span className="flex items-center gap-1.5"><UserIcon size={11} />{m?.assigneeName ?? task.assigneeName}</span></Field>
            {m?.watcherNames && m.watcherNames.length > 0 && (
              <Field k="Observadores"><span className="flex items-center gap-1.5"><Eye size={11} />{m.watcherNames.join(' · ')}</span></Field>
            )}
            {m?.requesterName && <Field k="Solicitante">{m.requesterName}</Field>}
            <Field k="Data do pedido">{fmtDate(m?.requestedAt ?? task.requestedAt)}</Field>
            {m?.startDate && <Field k="Início">{fmtDate(m.startDate)}</Field>}
            <Field k="Prazo"><span className={isOverdue ? 'text-[#EF4444]' : ''}>{fmtDate(m?.dueDate ?? task.dueDate)}{isOverdue ? ' (atrasado)' : ''}</span></Field>
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
        <div className="px-5 py-3.5 border-t border-[#38435C] flex items-center gap-2.5 lg-glass-strong">
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
          ) : canChangeStatus && status !== 'CONCLUIDO' && status !== 'CANCELADO' ? (
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
    case 'created': return 'criou a tarefa'
    case 'created_by_recurrence': return 'gerada por recorrência'
    case 'commented': return 'comentou'
    case 'submitted_for_validation': return 'enviou para validação da CS'
    case 'validation_approved': return 'aprovou a validação'
    case 'validation_changes_requested': return 'solicitou ajustes'
    default: return action
  }
}
