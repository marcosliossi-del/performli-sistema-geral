import 'server-only'

import { prisma } from '@/lib/prisma'
import { parseRecurrenceRule, type RecurrenceRule } from '@/lib/tasks/recurrence'
import { normalizeRole, can } from '@/lib/rbac'
import type {
  TaskStatus,
  TaskPriority,
  SupportCategory,
  TaskOrigin,
} from '@prisma/client'

/**
 * Camada de leitura do Painel da Task (sub-fatia 4a).
 *
 * Um único loader alimenta as DUAS rotas do painel: a página cheia
 * `/t/[taskId]` e o slide-over interceptado. Select explícito (nunca include
 * cego). O escopo por papel é aplicado aqui — MANAGER/ANALYST só enxergam a
 * task se possuírem o cliente (ou, em task interna, se forem responsáveis).
 *
 * A segurança REAL das mutações vive nas server actions; este recorte só
 * evita renderizar um painel de algo que o usuário não deveria ver.
 */

export type PanelUser = { id: string; name: string }

export type PanelDependency = { id: string; title: string; status: TaskStatus }

export type PanelComment = {
  id: string
  author: PanelUser
  body: string
  createdAt: string
}

export type PanelActivity = {
  id: string
  action: string
  actorName: string | null
  fromValue: string | null
  toValue: string | null
  createdAt: string
}

export type PanelApproval = {
  id: string
  approverName: string
  approved: boolean | null
  note: string | null
  decidedAt: string | null
}

export type PanelChecklistItem = {
  id: string
  label: string
  done: boolean
  required: boolean
}

/** Payload completo da task para o TaskPanel (client). Datas em ISO string. */
export type TaskPanelData = {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  statusId: string | null
  priority: TaskPriority | null
  dueDate: string | null
  startDate: string | null
  recurrenceRule: RecurrenceRule | null
  clientId: string | null
  client: { name: string; razaoSocial: string | null; slug: string } | null
  assignedTo: string
  assignee: PanelUser | null
  auxAssignees: PanelUser[]
  watcherIds: string[]
  tags: string[]
  checklist: PanelChecklistItem[]
  comments: PanelComment[]
  activities: PanelActivity[]
  /** Tarefas que bloqueiam esta ("Bloqueada por"). */
  blockedBy: PanelDependency[]
  /** Tarefas que esta bloqueia ("Bloqueia"). */
  blocking: PanelDependency[]
  requiresEvidence: boolean
  requiresReview: boolean
  /** Registro de conclusão e evidência (T-01/T-03). */
  evidence: string | null
  completionNotes: string | null
  /** Task exige "o que foi feito" p/ concluir (guard flag-gated). */
  critical: boolean
  /** Fluxo de validação da CS (mesmos gates das server actions). */
  canSubmit: boolean
  canValidate: boolean
  approvals: PanelApproval[]
  isSupport: boolean
  supportCategory: SupportCategory | null
  origin: TaskOrigin
  requestedAt: string | null
  createdAt: string
  updatedAt: string
}

export type TaskPanelResult = {
  data: TaskPanelData
  /** Usuários selecionáveis (responsáveis / seguidores). */
  users: PanelUser[]
  /** Candidatas a dependência (mesmo cliente, ou internas do usuário). */
  candidates: PanelDependency[]
  currentUser: PanelUser
  /** UX: esconde ações que o papel não executa (backend ainda valida). */
  canEdit: boolean
  /** GESTOR_TRAFEGO só muda status (mover de coluna); demais staff editam tudo. */
  canEditStatusOnly: boolean
}

type Session = { userId: string; role: string }

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null
}

/**
 * Carrega tudo do painel + aplica escopo por papel. Retorna `null` quando a
 * task não existe OU o usuário não tem acesso de leitura a ela (o chamador
 * traduz para notFound()/tela sem acesso).
 */
export async function loadTaskPanel(
  taskId: string,
  session: Session,
): Promise<TaskPanelResult | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      statusId: true,
      priority: true,
      dueDate: true,
      startDate: true,
      recurrenceRule: true,
      clientId: true,
      assignedTo: true,
      tags: true,
      requiresEvidence: true,
      requiresReview: true,
      riskScore: true,
      evidence: true,
      completionNotes: true,
      isSupport: true,
      supportCategory: true,
      origin: true,
      requestedAt: true,
      createdAt: true,
      updatedAt: true,
      client: { select: { name: true, razaoSocial: true, slug: true } },
      user: { select: { id: true, name: true } },
      auxAssignees: { select: { userId: true } },
      watchers: { select: { userId: true } },
      checklist: {
        orderBy: { order: 'asc' },
        select: { id: true, label: true, done: true, required: true },
      },
      comments: {
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, body: true, authorId: true, createdAt: true },
      },
      activities: {
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, action: true, fromValue: true, toValue: true, actorId: true, createdAt: true },
      },
      dependsOn: {
        select: { blocking: { select: { id: true, title: true, status: true } } },
      },
      blocks: {
        select: { dependent: { select: { id: true, title: true, status: true } } },
      },
      approvals: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, approverId: true, approved: true, note: true, decidedAt: true },
      },
    },
  })
  if (!task) return null

  // ── Escopo por papel (leitura) ──────────────────────────────────────────────
  // Staff amplo (ADMIN/CS/SUPERVISOR/ANALISTA) vê tudo; só GESTOR_TRAFEGO fica
  // restrito à carteira / tarefas internas próprias (espelha scopeTasks).
  const role = normalizeRole(session.role)
  const isViewAll = role !== 'GESTOR_TRAFEGO'
  if (!isViewAll) {
    if (task.clientId) {
      const assigned = await prisma.clientAssignment.findUnique({
        where: { clientId_userId: { clientId: task.clientId, userId: session.userId } },
        select: { id: true },
      })
      if (!assigned) return null
    } else {
      const isResponsible =
        task.assignedTo === session.userId ||
        task.auxAssignees.some((a) => a.userId === session.userId)
      if (!isResponsible) return null
    }
  }

  // ── Resolução de nomes (comentários / atividades / responsáveis extra) ───────
  const auxIds = task.auxAssignees.map((a) => a.userId)
  const nameIds = Array.from(
    new Set<string>([
      ...auxIds,
      ...task.comments.map((c) => c.authorId),
      ...task.activities.map((a) => a.actorId).filter((x): x is string => !!x),
      ...task.approvals.map((a) => a.approverId).filter((x): x is string => !!x),
      session.userId,
    ]),
  )
  const named = nameIds.length
    ? await prisma.user.findMany({ where: { id: { in: nameIds } }, select: { id: true, name: true } })
    : []
  const nameMap = new Map(named.map((u) => [u.id, u.name]))

  // Universo de usuários selecionáveis (para atribuir / seguir).
  const users: PanelUser[] = (
    await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
  ).map((u) => ({ id: u.id, name: u.name }))

  // Candidatas a dependência: tarefas do MESMO cliente (ou, em task interna,
  // tarefas do próprio usuário). Exclui a própria e as já encerradas.
  const candidateWhere = task.clientId
    ? { clientId: task.clientId }
    : { clientId: null, assignedTo: session.userId }
  const candidates: PanelDependency[] = (
    await prisma.task.findMany({
      where: {
        ...candidateWhere,
        id: { not: task.id },
        status: { notIn: ['CONCLUIDO', 'CANCELADO'] },
      },
      select: { id: true, title: true, status: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    })
  ).map((t) => ({ id: t.id, title: t.title, status: t.status }))

  const data: TaskPanelData = {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    statusId: task.statusId,
    priority: task.priority,
    dueDate: iso(task.dueDate),
    startDate: iso(task.startDate),
    recurrenceRule: parseRecurrenceRule(task.recurrenceRule),
    clientId: task.clientId,
    client: task.client ? { name: task.client.name, razaoSocial: task.client.razaoSocial, slug: task.client.slug } : null,
    assignedTo: task.assignedTo,
    assignee: task.user ? { id: task.user.id, name: task.user.name } : null,
    auxAssignees: auxIds.map((id) => ({ id, name: nameMap.get(id) ?? '—' })),
    watcherIds: task.watchers.map((w) => w.userId),
    tags: task.tags,
    checklist: task.checklist,
    comments: task.comments.map((c) => ({
      id: c.id,
      author: { id: c.authorId, name: nameMap.get(c.authorId) ?? '—' },
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    })),
    activities: task.activities.map((a) => ({
      id: a.id,
      action: a.action,
      actorName: a.actorId ? (nameMap.get(a.actorId) ?? '—') : 'Sistema',
      fromValue: a.fromValue,
      toValue: a.toValue,
      createdAt: a.createdAt.toISOString(),
    })),
    blockedBy: task.dependsOn.map((d) => ({ id: d.blocking.id, title: d.blocking.title, status: d.blocking.status })),
    blocking: task.blocks.map((d) => ({ id: d.dependent.id, title: d.dependent.title, status: d.dependent.status })),
    requiresEvidence: task.requiresEvidence,
    requiresReview: task.requiresReview,
    evidence: task.evidence,
    completionNotes: task.completionNotes,
    critical:
      task.requiresEvidence ||
      task.requiresReview ||
      (task.riskScore != null && task.riskScore >= 4) ||
      task.priority === 'CRITICA',
    canSubmit:
      ['A_FAZER', 'EM_ANDAMENTO', 'AJUSTES_SOLICITADOS'].includes(task.status) &&
      (task.assignedTo === session.userId || session.role === 'ADMIN'),
    canValidate: session.role === 'CS' || session.role === 'ADMIN',
    approvals: task.approvals.map((a) => ({
      id: a.id,
      approverName: a.approverId ? (nameMap.get(a.approverId) ?? '—') : '—',
      approved: a.approved,
      note: a.note,
      decidedAt: a.decidedAt ? a.decidedAt.toISOString() : null,
    })),
    isSupport: task.isSupport,
    supportCategory: task.supportCategory,
    origin: task.origin,
    requestedAt: iso(task.requestedAt),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  }

  const currentUser: PanelUser = {
    id: session.userId,
    name: nameMap.get(session.userId) ?? 'Você',
  }

  return {
    data,
    users,
    candidates,
    currentUser,
    // GESTOR não cria/edita campos/deleta — só move de coluna (status).
    canEdit: can(role, 'update', 'tarefas'),
    canEditStatusOnly:
      !can(role, 'update', 'tarefas') && can(role, 'update_status_only', 'tarefas'),
  }
}
