'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  X, ExternalLink, ArrowLeft, Eye, EyeOff, LifeBuoy, Link2, Plus, Search,
} from 'lucide-react'
import type { TaskStatus, TaskPriority, SupportCategory, TaskOrigin } from '@prisma/client'
import { cn, timeAgo } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { useModalA11y } from '@/lib/useModalA11y'
import {
  updateTaskFields, updateTaskStatus, assignTask, unassignTask, toggleWatcher, addTaskDependency,
} from '@/app/actions/tasks'
import { addTaskComment, toggleChecklistItem } from '@/app/actions/operacional'
import type { TaskPanelResult, PanelComment, PanelDependency, PanelUser } from '@/lib/tasks/panel'
import { StatusBadge, type StatusValue } from './StatusBadge'
import { PriorityFlag } from './PriorityFlag'
import { AssigneeAvatars } from './AssigneeAvatars'
import { DueDateChip } from './DueDateChip'
import { ChecklistBlock } from './ChecklistBlock'
import { CommentThread } from './CommentThread'
import { ActivityFeed } from './ActivityFeed'
import { InlineEdit } from './InlineEdit'
import { RecurrenceEditor } from './RecurrenceEditor'
import type { RecurrenceRule } from '@/lib/tasks/recurrence'

// Ordem operacional dos status (mesmo enum legado, D-004).
const STATUS_ORDER: TaskStatus[] = [
  'A_FAZER', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE', 'AGUARDANDO_GESTOR', 'AGUARDANDO_CS',
  'EM_VALIDACAO', 'AJUSTES_SOLICITADOS', 'BLOQUEADO', 'ATRASADO', 'CONCLUIDO', 'CANCELADO',
]
const STATUS_OPTIONS: StatusValue[] = STATUS_ORDER.map((s) => ({ kind: 'legacy', status: s }))

const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  TRAFEGO: 'Tráfego',
  DEMANDA_DA_AGENCIA: 'Demanda da agência',
  SUCESSO_DO_CLIENTE: 'Sucesso do cliente',
}

const ORIGIN_LABELS: Record<TaskOrigin, string> = {
  MANUAL: 'Criada manualmente',
  TEMPLATE: 'Criada por template',
  RECORRENCIA: 'Gerada por recorrência',
  AUTOMACAO: 'Gerada por automação',
  ALERTA: 'Gerada por alerta',
  IA: 'Gerada por IA',
  WHATSAPP: 'Recebida por WhatsApp',
}

const CLOSED_STATUS = new Set<TaskStatus>(['CONCLUIDO', 'CANCELADO'])

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
function dateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}

// ── Textarea que cresce com o conteúdo ─────────────────────────────────────────
function AutoTextarea({
  value, onChange, onBlur, placeholder, disabled,
}: {
  value: string
  onChange: (v: string) => void
  onBlur: () => void
  placeholder?: string
  disabled?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])
  useEffect(() => { resize() }, [resize, value])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => { onChange(e.target.value); resize() }}
      onBlur={onBlur}
      placeholder={placeholder}
      disabled={disabled}
      rows={2}
      className="w-full resize-none rounded-lg border border-[var(--ak-hair)] bg-surface px-3 py-2 text-[13px] leading-relaxed text-text-hi outline-none placeholder:text-text-low focus:border-[var(--ak-brand)] disabled:opacity-70"
    />
  )
}

// ── Chrome do slide-over (overlay + painel lateral, Esc/click-fora fecham) ──────
function SlideOver({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useModalA11y<HTMLElement>(onClose)
  return (
    <>
      <div className="ak-scrim lg-overlay fixed inset-0 z-40 bg-black/55" onClick={onClose} aria-hidden />
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Painel da tarefa"
        className="ak-drawer lg-glass-strong fixed right-0 top-0 z-50 flex h-screen w-full max-w-[640px] flex-col border-l border-[var(--ak-hair)] shadow-[-20px_0_60px_rgba(0,0,0,0.4)]"
      >
        {children}
      </aside>
    </>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-low">{children}</p>
  )
}

// ── Seletor de dependência (busca nas tarefas do mesmo cliente) ─────────────────
function DependencyPicker({
  candidates, existingIds, onAdd,
}: {
  candidates: PanelDependency[]
  existingIds: Set<string>
  onAdd: (dep: PanelDependency) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const filtered = candidates
    .filter((c) => !existingIds.has(c.id))
    .filter((c) => (q ? c.title.toLowerCase().includes(q) : true))
    .slice(0, 8)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-[12px] text-info hover:underline"
      >
        <Plus size={13} aria-hidden /> Adicionar dependência
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-[var(--ak-hair)] bg-surface p-2">
      <div className="flex items-center gap-2 rounded-lg bg-surface-raised px-2 py-1.5">
        <Search size={13} className="text-text-low" aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar tarefa que bloqueia esta…"
          className="w-full bg-transparent text-xs text-text-hi outline-none placeholder:text-text-low"
        />
        <button type="button" onClick={() => setOpen(false)} aria-label="Fechar busca" className="text-text-low hover:text-text-hi">
          <X size={13} aria-hidden />
        </button>
      </div>
      <ul className="mt-1 max-h-52 overflow-auto">
        {filtered.length === 0 && (
          <li className="px-2 py-2 text-xs text-text-low">
            {candidates.length === 0 ? 'Sem outras tarefas do mesmo cliente.' : 'Nenhuma tarefa encontrada.'}
          </li>
        )}
        {filtered.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onAdd(c)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-raised"
            >
              <StatusBadge value={{ kind: 'legacy', status: c.status }} size="sm" />
              <span className="flex-1 truncate text-xs text-text-hi">{c.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function DependencyList({ label, deps }: { label: string; deps: PanelDependency[] }) {
  if (deps.length === 0) return null
  return (
    <div className="space-y-1.5">
      <span className="text-[11px] font-medium text-text-mid">{label}</span>
      <ul className="space-y-1">
        {deps.map((d) => (
          <li key={d.id}>
            <Link
              href={`/t/${d.id}`}
              className="flex items-center gap-2 rounded-lg border border-[var(--ak-hair)] px-2 py-1.5 hover:bg-surface-raised"
            >
              <StatusBadge value={{ kind: 'legacy', status: d.status }} size="sm" />
              <span className="flex-1 truncate text-xs text-text-hi">{d.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Conteúdo do painel (todo o estado otimista vive aqui) ───────────────────────
function PanelSections({
  result, variant, onRequestClose,
}: {
  result: TaskPanelResult
  variant: 'page' | 'slideover'
  onRequestClose: () => void
}) {
  const { data, users, candidates, currentUser, canEdit, canEditStatusOnly } = result
  // GESTOR_TRAFEGO move de coluna (status), mas não edita campos/atribui.
  const canChangeStatus = canEdit || canEditStatusOnly

  const [title, setTitle] = useState(data.title)
  const [status, setStatus] = useState<TaskStatus>(data.status)
  const [priority, setPriority] = useState<TaskPriority | null>(data.priority)
  const [assignees, setAssignees] = useState<PanelUser[]>(() => {
    const seen = new Set<string>()
    const list: PanelUser[] = []
    if (data.assignee) { list.push(data.assignee); seen.add(data.assignee.id) }
    for (const a of data.auxAssignees) if (!seen.has(a.id)) { list.push(a); seen.add(a.id) }
    return list
  })
  const [watching, setWatching] = useState(data.watcherIds.includes(currentUser.id))
  const [dueDate, setDueDate] = useState<string | null>(data.dueDate)
  const [startDate, setStartDate] = useState<string | null>(data.startDate)
  const [recurrence, setRecurrence] = useState<RecurrenceRule | null>(data.recurrenceRule)
  const [description, setDescription] = useState<string | null>(data.description)
  const [descDraft, setDescDraft] = useState(data.description ?? '')
  const [comments, setComments] = useState<PanelComment[]>(data.comments)
  const [blockedBy, setBlockedBy] = useState<PanelDependency[]>(data.blockedBy)
  const [blocking] = useState<PanelDependency[]>(data.blocking)
  const [tab, setTab] = useState<'comentarios' | 'atividade'>('comentarios')

  const overdue = !!dueDate && !CLOSED_STATUS.has(status) && new Date(dueDate).getTime() < Date.now()

  // Salva um campo com aplicação otimista + rollback + toast.
  async function commit(
    apply: () => void,
    revert: () => void,
    run: () => Promise<{ ok: true } | { error: string }>,
    okMsg?: string,
  ) {
    apply()
    try {
      const res = await run()
      if ('error' in res) { revert(); toast(res.error, 'err'); return }
      if (okMsg) toast(okMsg)
    } catch (e) {
      revert()
      toast(e instanceof Error ? e.message : 'Não foi possível salvar.', 'err')
    }
  }

  // Título (InlineEdit reverte sozinho quando onSave lança).
  async function saveTitle(next: string) {
    const res = await updateTaskFields(data.id, { title: next })
    if ('error' in res) throw new Error(res.error)
    setTitle(next)
  }

  // Status (bloqueio do guard vem como { error } — relança para o StatusBadge
  // capturar e mostrar o motivo operacional).
  async function saveStatus(next: StatusValue) {
    if (next.kind !== 'legacy') return
    const r = await updateTaskStatus(data.id, next.status)
    if ('error' in r) throw new Error(r.error)
    setStatus(next.status)
  }

  // Prioridade (allowClear=false → next nunca é null).
  async function savePriority(next: TaskPriority | null) {
    if (next === null) return
    const res = await updateTaskFields(data.id, { priority: next })
    if ('error' in res) throw new Error(res.error)
    setPriority(next)
  }

  // Responsáveis (M:N).
  async function toggleAssignee(userId: string, willAssign: boolean) {
    const res = willAssign ? await assignTask(data.id, userId) : await unassignTask(data.id, userId)
    if ('error' in res) throw new Error(res.error)
    if (willAssign) {
      const u = users.find((x) => x.id === userId)
      if (u) setAssignees((prev) => (prev.some((p) => p.id === userId) ? prev : [...prev, u]))
    } else {
      setAssignees((prev) => prev.filter((p) => p.id !== userId))
    }
  }

  // Seguir / deixar de seguir (otimista).
  async function toggleFollow() {
    const prev = watching
    setWatching(!prev)
    try {
      const res = await toggleWatcher(data.id, currentUser.id)
      if ('error' in res) { setWatching(prev); toast(res.error, 'err') }
    } catch {
      setWatching(prev)
      toast('Não foi possível atualizar o seguir.', 'err')
    }
  }

  function saveDue(next: string | null) {
    const prev = dueDate
    void commit(() => setDueDate(next), () => setDueDate(prev), () => updateTaskFields(data.id, { dueDate: next }))
  }
  function saveStart(next: string | null) {
    const prev = startDate
    void commit(() => setStartDate(next), () => setStartDate(prev), () => updateTaskFields(data.id, { startDate: next }))
  }
  function saveDescription() {
    const next = descDraft.trim() || null
    if (next === (description ?? null)) return
    const prev = description
    void commit(
      () => setDescription(next),
      () => { setDescription(prev); setDescDraft(prev ?? '') },
      () => updateTaskFields(data.id, { description: next }),
    )
  }

  // Comentário (otimista com append; lança em erro para o CommentThread).
  async function submitComment(body: string) {
    const temp: PanelComment = {
      id: `tmp-${Date.now()}`, author: currentUser, body, createdAt: new Date().toISOString(),
    }
    setComments((prev) => [temp, ...prev])
    try {
      const res = await addTaskComment(data.id, body)
      if ('error' in res) { setComments((prev) => prev.filter((c) => c.id !== temp.id)); throw new Error(res.error) }
      // Substitui o otimista pelo registro real (id do banco).
      const real: PanelComment = {
        id: res.comment.id,
        author: { id: res.comment.authorId, name: res.comment.authorName },
        body: res.comment.body,
        createdAt: res.comment.createdAt,
      }
      setComments((prev) => prev.map((c) => (c.id === temp.id ? real : c)))
    } catch (e) {
      setComments((prev) => prev.filter((c) => c.id !== temp.id))
      throw e
    }
  }

  // Dependência: a candidata BLOQUEIA esta tarefa (candidate → this).
  async function addDependency(dep: PanelDependency) {
    try {
      const res = await addTaskDependency(dep.id, data.id)
      if ('error' in res) { toast(res.error, 'err'); return }
      setBlockedBy((prev) => (prev.some((b) => b.id === dep.id) ? prev : [...prev, dep]))
      toast('Dependência adicionada')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível adicionar a dependência.', 'err')
    }
  }

  async function toggleChecklist(itemId: string, done: boolean) {
    const res = await toggleChecklistItem(itemId, done)
    if ('error' in res) throw new Error(res.error)
  }

  const currentStatusValue: StatusValue = { kind: 'legacy', status }
  const blockedIds = new Set(blockedBy.map((b) => b.id))

  return (
    <>
      {/* ── Header ── */}
      <header className="border-b border-[var(--ak-hair)] px-5 py-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-[11px] text-text-low">
            {variant === 'page' && (
              <button type="button" onClick={onRequestClose} className="inline-flex items-center gap-1 hover:text-text-hi">
                <ArrowLeft size={13} aria-hidden /> Voltar
              </button>
            )}
            {data.client ? (
              <Link
                href={`/clients/${data.client.slug}`}
                className="truncate text-info hover:underline"
                title={data.client.razaoSocial ?? undefined}
              >
                {data.client.name}
              </Link>
            ) : (
              <span>Tarefa interna</span>
            )}
            {data.isSupport && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--ak-hair)] px-2 py-0.5 text-[10px] text-text-mid">
                <LifeBuoy size={11} aria-hidden />
                Suporte{data.supportCategory ? ` · ${SUPPORT_CATEGORY_LABELS[data.supportCategory]}` : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {variant === 'slideover' && (
              <Link
                href={`/t/${data.id}`}
                className="inline-flex items-center gap-1 text-[11px] text-text-low hover:text-text-hi"
              >
                Abrir painel completo <ExternalLink size={12} aria-hidden />
              </Link>
            )}
            {variant === 'slideover' && (
              <button type="button" onClick={onRequestClose} aria-label="Fechar painel" className="text-text-low hover:text-text-hi">
                <X size={18} aria-hidden />
              </button>
            )}
          </div>
        </div>

        {/* Título */}
        {canEdit ? (
          <InlineEdit value={title} onSave={saveTitle} as="heading" ariaLabel="Editar título da tarefa" />
        ) : (
          <h1 className="px-1.5 text-lg font-semibold text-text-hi">{title}</h1>
        )}

        {/* Linha de controles */}
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          {canChangeStatus ? (
            <StatusBadge interactive value={currentStatusValue} options={STATUS_OPTIONS} onChange={saveStatus} />
          ) : (
            <StatusBadge value={currentStatusValue} />
          )}
          {canEdit ? (
            <PriorityFlag interactive priority={priority} allowClear={false} onChange={savePriority} />
          ) : (
            <PriorityFlag priority={priority} />
          )}
          {canEdit ? (
            <AssigneeAvatars interactive assignees={assignees} options={users} onToggle={toggleAssignee} />
          ) : (
            <AssigneeAvatars assignees={assignees} />
          )}
          {canEdit && (
            <button
              type="button"
              onClick={toggleFollow}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]',
                watching
                  ? 'border-[var(--ak-brand)]/40 text-info'
                  : 'border-[var(--ak-hair)] text-text-mid hover:bg-surface-raised',
              )}
            >
              {watching ? <Eye size={12} aria-hidden /> : <EyeOff size={12} aria-hidden />}
              {watching ? 'Seguindo' : 'Seguir'}
            </button>
          )}
        </div>

        {!canEdit && canEditStatusOnly && (
          <p className="mt-2 text-[11px] text-text-low">Seu perfil altera apenas o status da tarefa.</p>
        )}

        {/* Datas */}
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <div>
            <SectionTitle>Início</SectionTitle>
            {canEdit ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={dateInputValue(startDate)}
                  onChange={(e) => saveStart(e.target.value ? e.target.value : null)}
                  className="h-8 rounded-lg border border-[var(--ak-hair)] bg-surface px-2 text-[12px] text-text-hi outline-none focus:border-[var(--ak-brand)]"
                />
                {startDate && (
                  <button type="button" onClick={() => saveStart(null)} aria-label="Limpar início" className="text-text-low hover:text-danger">
                    <X size={13} aria-hidden />
                  </button>
                )}
              </div>
            ) : (
              <span className="text-[13px] text-text-hi">{startDate ? fmtDateTime(startDate).slice(0, 10) : '—'}</span>
            )}
          </div>
          <div>
            <SectionTitle>Vencimento</SectionTitle>
            {canEdit ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={dateInputValue(dueDate)}
                  onChange={(e) => saveDue(e.target.value ? e.target.value : null)}
                  className={cn(
                    'h-8 rounded-lg border bg-surface px-2 text-[12px] text-text-hi outline-none focus:border-[var(--ak-brand)]',
                    overdue ? 'border-danger/60' : 'border-[var(--ak-hair)]',
                  )}
                />
                {dueDate && (
                  <button type="button" onClick={() => saveDue(null)} aria-label="Limpar vencimento" className="text-text-low hover:text-danger">
                    <X size={13} aria-hidden />
                  </button>
                )}
              </div>
            ) : (
              <DueDateChip dueDate={dueDate} recurring={!!recurrence} />
            )}
          </div>
          {canEdit && (
            <div className="pb-1">
              <DueDateChip dueDate={dueDate} recurring={!!recurrence} />
            </div>
          )}
        </div>
      </header>

      {/* ── Corpo rolável ── */}
      <div className={cn('flex-1 space-y-6 overflow-y-auto px-5 py-5', variant === 'page' && 'flex-none')}>
        {/* Recorrência */}
        <RecurrenceEditor taskId={data.id} rule={recurrence} canEdit={canEdit} onSaved={setRecurrence} />

        {/* Descrição */}
        <section>
          <SectionTitle>Descrição</SectionTitle>
          {canEdit ? (
            <AutoTextarea
              value={descDraft}
              onChange={setDescDraft}
              onBlur={saveDescription}
              placeholder="Adicionar descrição…"
            />
          ) : description ? (
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-mid">{description}</p>
          ) : (
            <p className="text-[13px] text-text-low">Sem descrição.</p>
          )}
        </section>

        {/* Checklist */}
        {data.checklist.length > 0 && (
          <section>
            <ChecklistBlock
              items={data.checklist.map((c) => ({ id: c.id, name: c.label, done: c.done }))}
              onToggle={canEdit ? toggleChecklist : async () => { throw new Error('Sem permissão para alterar.') }}
              title="Checklist"
            />
          </section>
        )}

        {/* Dependências */}
        <section className="space-y-2.5">
          <div className="flex items-center gap-1.5">
            <Link2 size={13} className="text-text-low" aria-hidden />
            <SectionTitle>Dependências</SectionTitle>
          </div>
          <DependencyList label="Bloqueada por" deps={blockedBy} />
          <DependencyList label="Bloqueia" deps={blocking} />
          {blockedBy.length === 0 && blocking.length === 0 && (
            <p className="text-[12px] text-text-low">Nenhuma dependência.</p>
          )}
          {canEdit && (
            <DependencyPicker candidates={candidates} existingIds={blockedIds} onAdd={addDependency} />
          )}
        </section>

        {/* Abas: Comentários | Atividade */}
        <section>
          <div className="mb-3 flex gap-1 border-b border-[var(--ak-hair)]">
            <button
              type="button"
              onClick={() => setTab('comentarios')}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-[12px] font-medium',
                tab === 'comentarios' ? 'border-[var(--ak-brand)] text-info' : 'border-transparent text-text-low hover:text-text-hi',
              )}
            >
              Comentários
            </button>
            <button
              type="button"
              onClick={() => setTab('atividade')}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-[12px] font-medium',
                tab === 'atividade' ? 'border-[var(--ak-brand)] text-info' : 'border-transparent text-text-low hover:text-text-hi',
              )}
            >
              Atividade
            </button>
          </div>
          {tab === 'comentarios' ? (
            <CommentThread
              comments={comments}
              currentUser={currentUser}
              onSubmit={canEdit ? submitComment : undefined}
            />
          ) : (
            <ActivityFeed activities={data.activities} />
          )}
        </section>
      </div>

      {/* ── Rodapé: metadados (regra UX #10) ── */}
      <footer className="border-t border-[var(--ak-hair)] px-5 py-3 text-[11px] text-text-low">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>{ORIGIN_LABELS[data.origin]}</span>
          {data.requestedAt && <span>Pedido em {fmtDateTime(data.requestedAt)}</span>}
          <span>Criada em {fmtDateTime(data.createdAt)}</span>
          <span>Atualizada {timeAgo(new Date(data.updatedAt))}</span>
          {data.requiresEvidence && <span className="text-warning">Exige evidência</span>}
          {data.requiresReview && <span className="text-warning">Exige validação</span>}
        </div>
      </footer>
    </>
  )
}

// ── Componente público: decide o chrome (slide-over vs página cheia) ────────────
export function TaskPanel({
  result, variant,
}: {
  result: TaskPanelResult
  variant: 'page' | 'slideover'
}) {
  const router = useRouter()
  const close = useCallback(() => router.back(), [router])

  if (variant === 'slideover') {
    return (
      <SlideOver onClose={close}>
        <PanelSections result={result} variant="slideover" onRequestClose={close} />
      </SlideOver>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--ak-hair)] bg-surface">
      <PanelSections result={result} variant="page" onRequestClose={close} />
    </div>
  )
}
