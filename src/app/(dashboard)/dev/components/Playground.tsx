'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import type { CustomFieldType } from '@prisma/client'
import { toast } from '@/lib/toast'
import {
  ActivityFeed,
  AssigneeAvatars,
  ChecklistBlock,
  CommentThread,
  ConfirmDialog,
  CustomFieldInput,
  DueDateChip,
  InlineEdit,
  PriorityFlag,
  StatusBadge,
  TagChip,
  TaskCard,
  TaskRow,
} from '@/components/tasks'
import type { AssigneeUser, StatusValue, TaskVM } from '@/components/tasks'

// ─── util ──────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const ok = async () => {
  await sleep(700)
  toast('Salvo', 'ok')
}
const fail = async () => {
  await sleep(500)
  throw new Error('Falha simulada: sem conexão com o servidor.')
}
const never = () => new Promise<void>(() => {}) // pending permanente (demo visual)

// ─── mock data ───────────────────────────────────────────────────────────────
const users: AssigneeUser[] = [
  { id: 'u1', name: 'Marcos Liossi' },
  { id: 'u2', name: 'Pablo Enrico' },
  { id: 'u3', name: 'Ana Beatriz' },
  { id: 'u4', name: 'Carla Souza' },
  { id: 'u5', name: 'Rafael Lima' },
]

const customStatuses: StatusValue[] = [
  { kind: 'custom', status: { id: 's1', name: 'Backlog', color: 'var(--ak-low)', group: 'NOT_STARTED' } },
  { kind: 'custom', status: { id: 's2', name: 'Em execução', color: 'var(--ak-brand)', group: 'ACTIVE' } },
  { kind: 'custom', status: { id: 's3', name: 'Aguardando cliente', color: 'var(--ak-amber)', group: 'ACTIVE' } },
  { kind: 'custom', status: { id: 's4', name: 'Concluído', color: 'var(--ak-green)', group: 'DONE' } },
]

const now = new Date()
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000)

const baseTask: TaskVM = {
  id: 't1',
  title: 'Subir campanha de remarketing — coleção inverno',
  status: { kind: 'legacy', status: 'EM_ANDAMENTO' },
  priority: 'ALTA',
  assignees: [users[0], users[1]],
  tags: [
    { id: 'tg1', label: 'Meta Ads' },
    { id: 'tg2', label: 'Urgente cliente' },
  ],
  dueDate: inDays(2),
  recurring: false,
  clientName: 'Bambola',
  checklist: { done: 2, total: 5 },
  commentCount: 3,
}

const overdueTask: TaskVM = {
  ...baseTask,
  id: 't2',
  title: 'Relatório semanal atrasado',
  status: { kind: 'legacy', status: 'ATRASADO' },
  priority: 'CRITICA',
  assignees: [users[2], users[3], users[4], users[0]],
  tags: [{ id: 'tg3', label: 'Relatório' }],
  dueDate: inDays(-4),
  overdue: true,
  recurring: true,
  clientName: 'My Muse',
  checklist: { done: 0, total: 3 },
  commentCount: 0,
}

const fieldTypes: CustomFieldType[] = [
  'TEXT',
  'NUMBER',
  'CURRENCY',
  'PERCENT',
  'DATE',
  'BOOLEAN',
  'SELECT',
  'MULTISELECT',
  'URL',
  'USER_REF',
  'CLIENT_REF',
]

// ─── layout helpers ──────────────────────────────────────────────────────────
function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold text-text-hi">{title}</h2>
      {hint && <p className="mt-0.5 text-[12px] text-text-low">{hint}</p>}
      <div className="mt-4 flex flex-wrap items-start gap-4">{children}</div>
    </section>
  )
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-[160px] flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-text-low">{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  )
}

// ─── page ────────────────────────────────────────────────────────────────────
export function ComponentsPlayground() {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [title, setTitle] = useState('Subir campanha de remarketing')
  const [assigned, setAssigned] = useState<AssigneeUser[]>([users[0]])
  const [cfValues, setCfValues] = useState<Record<string, string | null>>({})

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-6">
      <header>
        <h1 className="text-xl font-semibold text-text-hi">
          Playground — componentes do módulo Tasks
        </h1>
        <p className="mt-1 text-[13px] text-text-mid">
          Vocabulário visual (Fase 3 · A3-UI-SYSTEM). Cada componente em seus estados: normal,
          interativo, vazio, atrasado, pending e erro. Dados fictícios.
        </p>
      </header>

      {/* StatusBadge */}
      <Section title="StatusBadge" hint="Model Status (custom) e enum TaskStatus (legado). Grupos DONE/CLOSED recebem check.">
        <Cell label="Custom">
          <StatusBadge value={customStatuses[1]} />
        </Cell>
        <Cell label="Custom · concluído">
          <StatusBadge value={customStatuses[3]} />
        </Cell>
        <Cell label="Legado">
          <StatusBadge value={{ kind: 'legacy', status: 'AGUARDANDO_CLIENTE' }} />
        </Cell>
        <Cell label="Legado · cancelado">
          <StatusBadge value={{ kind: 'legacy', status: 'CANCELADO' }} />
        </Cell>
        <Cell label="Interativo (ok)">
          <StatusBadge interactive value={customStatuses[0]} options={customStatuses} onChange={ok} />
        </Cell>
        <Cell label="Interativo (erro)">
          <StatusBadge interactive value={customStatuses[0]} options={customStatuses} onChange={fail} />
        </Cell>
        <Cell label="Pending">
          <StatusBadge interactive value={customStatuses[1]} options={customStatuses} onChange={never} />
        </Cell>
      </Section>

      {/* PriorityFlag */}
      <Section title="PriorityFlag" hint="CRÍTICA=Urgente · ALTA=Alta · MEDIA=Normal · BAIXA=Baixa.">
        <Cell label="Urgente">
          <PriorityFlag priority="CRITICA" />
        </Cell>
        <Cell label="Alta">
          <PriorityFlag priority="ALTA" />
        </Cell>
        <Cell label="Normal">
          <PriorityFlag priority="MEDIA" />
        </Cell>
        <Cell label="Baixa">
          <PriorityFlag priority="BAIXA" />
        </Cell>
        <Cell label="Sem prioridade">
          <PriorityFlag priority={null} />
        </Cell>
        <Cell label="Interativo (ok)">
          <PriorityFlag interactive priority="MEDIA" onChange={ok} />
        </Cell>
        <Cell label="Interativo (erro)">
          <PriorityFlag interactive priority="ALTA" onChange={fail} />
        </Cell>
      </Section>

      {/* AssigneeAvatars */}
      <Section title="AssigneeAvatars" hint="Stack até 3 + N. Variante com popover de busca multi-select.">
        <Cell label="1 responsável">
          <AssigneeAvatars assignees={[users[0]]} />
        </Cell>
        <Cell label="5 (+2)">
          <AssigneeAvatars assignees={users} />
        </Cell>
        <Cell label="Vazio">
          <AssigneeAvatars assignees={[]} />
        </Cell>
        <Cell label="Interativo (ok)">
          <AssigneeAvatars
            interactive
            assignees={assigned}
            options={users}
            onToggle={async (id, willAssign) => {
              await sleep(500)
              setAssigned((prev) =>
                willAssign ? [...prev, users.find((u) => u.id === id)!] : prev.filter((u) => u.id !== id),
              )
            }}
          />
        </Cell>
        <Cell label="Interativo (erro)">
          <AssigneeAvatars interactive assignees={[users[1]]} options={users} onToggle={fail} />
        </Cell>
      </Section>

      {/* DueDateChip */}
      <Section title="DueDateChip" hint="Futuro (neutro) · Hoje (warning) · Atrasado (danger) · Sem prazo (low). Repeat = recorrente.">
        <Cell label="Futuro">
          <DueDateChip dueDate={inDays(5)} />
        </Cell>
        <Cell label="Amanhã">
          <DueDateChip dueDate={inDays(1)} />
        </Cell>
        <Cell label="Hoje">
          <DueDateChip dueDate={now} />
        </Cell>
        <Cell label="Atrasado">
          <DueDateChip dueDate={inDays(-6)} />
        </Cell>
        <Cell label="Distante">
          <DueDateChip dueDate={inDays(40)} />
        </Cell>
        <Cell label="Sem prazo">
          <DueDateChip dueDate={null} />
        </Cell>
        <Cell label="Recorrente">
          <DueDateChip dueDate={inDays(3)} recurring />
        </Cell>
      </Section>

      {/* TagChip */}
      <Section title="TagChip" hint="Paleta suave determinística por hash. Variante removível.">
        <Cell label="Tags">
          <div className="flex flex-wrap gap-1.5">
            <TagChip label="Meta Ads" />
            <TagChip label="Google Ads" />
            <TagChip label="Financeiro" />
            <TagChip label="War Room" />
            <TagChip label="Removível" onRemove={() => toast('Tag removida', 'info')} />
          </div>
        </Cell>
      </Section>

      {/* TaskRow */}
      <Section title="TaskRow" hint="Linha densa da view Lista. Borda esquerda vermelha quando atrasada.">
        <div className="card w-full divide-y divide-white/[0.05] p-0">
          <TaskRow task={baseTask} onOpen={(id) => toast(`Abrir ${id}`, 'info')} onSelectChange={() => {}} />
          <TaskRow task={overdueTask} onOpen={(id) => toast(`Abrir ${id}`, 'info')} onSelectChange={() => {}} selected />
        </div>
      </Section>

      {/* TaskCard */}
      <Section title="TaskCard" hint="Card do Kanban com contadores de checklist e comentários.">
        <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TaskCard task={baseTask} onOpen={(id) => toast(`Abrir ${id}`, 'info')} dragHandleProps={{}} />
          <TaskCard task={overdueTask} onOpen={(id) => toast(`Abrir ${id}`, 'info')} dragHandleProps={{}} />
        </div>
      </Section>

      {/* ChecklistBlock */}
      <Section title="ChecklistBlock" hint="Toggle otimista + progresso + adicionar inline.">
        <div className="w-full max-w-sm">
          <ChecklistBlock
            items={[
              { id: 'c1', name: 'Definir públicos', done: true },
              { id: 'c2', name: 'Criar criativos', done: true },
              { id: 'c3', name: 'Configurar orçamento', done: false },
              { id: 'c4', name: 'Revisar pixel', done: false },
            ]}
            onToggle={async () => {
              await sleep(500)
            }}
            onAdd={async () => {
              await sleep(600)
              toast('Item adicionado', 'ok')
            }}
          />
        </div>
        <div className="w-full max-w-sm">
          <ChecklistBlock items={[]} onToggle={ok} onAdd={ok} title="Checklist vazio" />
        </div>
      </Section>

      {/* CommentThread */}
      <Section title="CommentThread" hint="Texto puro (sem HTML), menções @nome em azul. Ctrl/⌘+Enter envia.">
        <div className="w-full max-w-lg">
          <CommentThread
            currentUser={users[0]}
            comments={[
              {
                id: 'cm1',
                author: users[1],
                body: 'Fechei os criativos. @Marcos Liossi confere o orçamento antes de subir?',
                createdAt: new Date(now.getTime() - 3600_000),
              },
              {
                id: 'cm2',
                author: users[0],
                body: 'Confirmado.\nPode subir hoje à tarde.',
                createdAt: new Date(now.getTime() - 600_000),
              },
            ]}
            onSubmit={async () => {
              await sleep(600)
              toast('Comentário enviado', 'ok')
            }}
          />
        </div>
        <div className="w-full max-w-lg">
          <CommentThread comments={[]} onSubmit={ok} currentUser={users[0]} />
        </div>
      </Section>

      {/* ActivityFeed */}
      <Section title="ActivityFeed" hint="Timeline: action → frase pt-BR com from→to.">
        <div className="w-full max-w-lg">
          <ActivityFeed
            activities={[
              { id: 'a1', action: 'created', actorName: 'Pablo Enrico', createdAt: new Date(now.getTime() - 7200_000) },
              {
                id: 'a2',
                action: 'status_changed',
                actorName: 'Pablo Enrico',
                fromValue: 'A fazer',
                toValue: 'Em andamento',
                createdAt: new Date(now.getTime() - 5400_000),
              },
              {
                id: 'a3',
                action: 'priority_changed',
                actorName: 'Marcos Liossi',
                toValue: 'Urgente',
                createdAt: new Date(now.getTime() - 3600_000),
              },
              {
                id: 'a4',
                action: 'escalated',
                actorName: 'Sistema',
                toValue: 'Marcos',
                createdAt: new Date(now.getTime() - 1800_000),
              },
              { id: 'a5', action: 'recurred', createdAt: new Date(now.getTime() - 900_000) },
              { id: 'a6', action: 'commented', actorName: 'Ana Beatriz', createdAt: new Date(now.getTime() - 300_000) },
              {
                id: 'a7',
                action: 'field_changed',
                actorName: 'Carla Souza',
                fromValue: 'prazo 10/07',
                toValue: 'prazo 12/07',
                createdAt: new Date(now.getTime() - 120_000),
              },
            ]}
          />
        </div>
        <div className="w-full max-w-lg">
          <ActivityFeed activities={[]} />
        </div>
      </Section>

      {/* CustomFieldInput */}
      <Section title="CustomFieldInput" hint="Switch por tipo do enum CustomFieldType. onChange assíncrono.">
        <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fieldTypes.map((type) => (
            <CustomFieldInput
              key={type}
              def={{
                id: `f-${type}`,
                key: type.toLowerCase(),
                label: type,
                type,
                required: type === 'TEXT',
                options:
                  type === 'SELECT' || type === 'MULTISELECT'
                    ? ['Opção A', 'Opção B', 'Opção C']
                    : type === 'USER_REF'
                      ? users.map((u) => u.name)
                      : type === 'CLIENT_REF'
                        ? ['Bambola', 'My Muse', 'Lavinny']
                        : [],
              }}
              value={cfValues[type] ?? null}
              onChange={async (next) => {
                await sleep(400)
                setCfValues((prev) => ({ ...prev, [type]: next }))
              }}
            />
          ))}
        </div>
      </Section>

      {/* InlineEdit */}
      <Section title="InlineEdit" hint="Clique para editar · Enter salva · Esc cancela · blur salva se mudou.">
        <Cell label="Título (ok)">
          <InlineEdit
            as="heading"
            value={title}
            onSave={async (next) => {
              await sleep(500)
              setTitle(next)
            }}
          />
        </Cell>
        <Cell label="Texto (erro)">
          <InlineEdit value="Tenta editar — vai falhar" onSave={fail} />
        </Cell>
      </Section>

      {/* ConfirmDialog */}
      <Section title="ConfirmDialog" hint="Confirmação acessível. Ação destrutiva em vermelho.">
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="h-9 rounded-lg bg-danger px-3.5 text-[13px] font-semibold text-white"
        >
          Excluir tarefa…
        </button>
        <ConfirmDialog
          open={confirmOpen}
          destructive
          title="Excluir esta tarefa?"
          body="Esta ação não pode ser desfeita. A tarefa e seus comentários serão removidos."
          confirmLabel="Excluir"
          onConfirm={async () => {
            await sleep(700)
            toast('Tarefa excluída', 'ok')
          }}
          onClose={() => setConfirmOpen(false)}
        />
      </Section>
    </div>
  )
}
