'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { assertClientMutationAccess, writeAuditLog } from '@/lib/audit'
import { TaskType, TaskPriority } from '@prisma/client'

type ActionResult = { ok: true; id?: string } | { error: string }

export type CreateOperacionalTaskInput = {
  title: string
  description?: string
  type?: TaskType
  priority?: TaskPriority
  dueDate?: string
  clientId?: string
  areaId?: string
  popId?: string
  assigneeId?: string
  checklist?: string[]
}

/**
 * BLOCO 2 — Cria uma tarefa na Central Operacional (campos ricos).
 * Valida papel + posse do cliente. Registra TaskActivity + AuditLog.
 */
export async function createOperacionalTask(input: CreateOperacionalTaskInput): Promise<ActionResult> {
  const session = await requireSession()

  if (session.role === 'ANALYST') {
    return { error: 'Seu papel não permite criar tarefas.' }
  }
  if (!input.title || input.title.trim().length < 3) {
    return { error: 'Título obrigatório (mínimo 3 caracteres).' }
  }

  if (input.clientId) {
    try {
      await assertClientMutationAccess(session, input.clientId, { allowCS: true })
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Sem permissão.' }
    }
  }

  const checklist = (input.checklist ?? []).map((l) => l.trim()).filter(Boolean)

  const task = await prisma.task.create({
    data: {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      type: input.type ?? 'SIMPLES',
      priority: input.priority ?? 'MEDIA',
      origin: 'MANUAL',
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      clientId: input.clientId || null,
      areaId: input.areaId || null,
      popId: input.popId || null,
      assignedTo: input.assigneeId || session.userId,
      requesterId: session.userId,
      requestedAt: new Date(),
      activities: { create: { actorId: session.userId, action: 'created' } },
      ...(checklist.length
        ? { checklist: { create: checklist.map((label, i) => ({ label, order: i })) } }
        : {}),
    },
    select: { id: true },
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'task.create',
    entityType: 'Task',
    entityId: task.id,
    clientId: input.clientId || null,
    metadata: { type: input.type ?? 'SIMPLES', popId: input.popId ?? null },
  })

  revalidatePath('/operacional')
  return { ok: true, id: task.id }
}

/** Adiciona comentário a uma tarefa + registra atividade. */
export async function addTaskComment(taskId: string, body: string): Promise<ActionResult> {
  const session = await requireSession()
  if (!body.trim()) return { error: 'Comentário vazio.' }

  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, clientId: true } })
  if (!task) return { error: 'Tarefa não encontrada.' }

  if (task.clientId) {
    await assertClientMutationAccess(session, task.clientId, { allowCS: true })
  }

  await prisma.taskComment.create({
    data: { taskId, authorId: session.userId, body: body.trim() },
  })
  await prisma.taskActivity.create({
    data: { taskId, actorId: session.userId, action: 'commented' },
  })

  revalidatePath('/operacional')
  return { ok: true }
}

/** Marca/desmarca um item de checklist. */
export async function toggleChecklistItem(itemId: string, done: boolean): Promise<ActionResult> {
  const session = await requireSession()
  const item = await prisma.taskChecklistItem.findUnique({
    where: { id: itemId },
    select: { id: true, task: { select: { clientId: true } } },
  })
  if (!item) return { error: 'Item não encontrado.' }

  if (item.task?.clientId) {
    await assertClientMutationAccess(session, item.task.clientId, { allowCS: true })
  }

  await prisma.taskChecklistItem.update({ where: { id: itemId }, data: { done } })
  revalidatePath('/operacional')
  return { ok: true }
}

export type TaskMeta = {
  description: string | null
  type: string
  priority: string
  origin: string
  dueDate: Date | null
  requestedAt: Date | null
  startDate: Date | null
  slaHours: number | null
  slaBreached: boolean
  areaName: string | null
  listName: string | null
  popCode: string | null
  popName: string | null
  clientName: string | null
  clientSlug: string | null
  assigneeName: string
  requesterName: string | null
  watcherNames: string[]
  tags: string[]
}

export type TaskDetail = {
  status: string
  evidence: string | null
  requiredOpen: number
  canSubmit: boolean
  canValidate: boolean
  meta: TaskMeta
  checklist: { id: string; label: string; done: boolean; required: boolean }[]
  comments: { id: string; body: string; authorName: string; createdAt: Date }[]
  activities: { id: string; action: string; fromValue: string | null; toValue: string | null; actorName: string; createdAt: Date }[]
  approvals: { id: string; approverName: string; approved: boolean | null; note: string | null; decidedAt: Date | null }[]
}

/** Carrega checklist, comentários, atividade, aprovações, metadados e flags de permissão. */
export async function loadTaskDetail(taskId: string): Promise<TaskDetail | null> {
  const session = await requireSession()
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      status: true,
      evidence: true,
      assignedTo: true,
      description: true,
      type: true,
      priority: true,
      origin: true,
      dueDate: true,
      requestedAt: true,
      startDate: true,
      slaHours: true,
      slaBreached: true,
      requesterId: true,
      tags: true,
      area: { select: { name: true } },
      list: { select: { name: true } },
      pop: { select: { code: true, name: true } },
      client: { select: { name: true, slug: true } },
      user: { select: { name: true } },
      watchers: { select: { userId: true } },
      checklist: { orderBy: { order: 'asc' }, select: { id: true, label: true, done: true, required: true } },
      comments: { orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, body: true, authorId: true, createdAt: true } },
      activities: { orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, action: true, fromValue: true, toValue: true, actorId: true, createdAt: true } },
      approvals: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, approverId: true, approved: true, note: true, decidedAt: true } },
    },
  })
  if (!task) return null

  const ids = Array.from(
    new Set([
      ...task.comments.map((c) => c.authorId),
      ...task.activities.map((a) => a.actorId).filter((x): x is string => !!x),
      ...task.approvals.map((a) => a.approverId).filter((x): x is string => !!x),
      ...task.watchers.map((w) => w.userId),
      ...(task.requesterId ? [task.requesterId] : []),
    ]),
  )
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : []
  const nameMap = new Map(users.map((u) => [u.id, u.name]))

  const requiredOpen = task.checklist.filter((c) => c.required && !c.done).length
  const isAssignee = task.assignedTo === session.userId
  const canValidate = session.role === 'CS' || session.role === 'ADMIN'
  const submittable = ['A_FAZER', 'EM_ANDAMENTO', 'AJUSTES_SOLICITADOS'].includes(task.status)
  const canSubmit = submittable && (isAssignee || session.role === 'ADMIN')

  const meta: TaskMeta = {
    description: task.description,
    type: task.type,
    priority: task.priority,
    origin: task.origin,
    dueDate: task.dueDate,
    requestedAt: task.requestedAt,
    startDate: task.startDate,
    slaHours: task.slaHours,
    slaBreached: task.slaBreached,
    areaName: task.area?.name ?? null,
    listName: task.list?.name ?? null,
    popCode: task.pop?.code ?? null,
    popName: task.pop?.name ?? null,
    clientName: task.client?.name ?? null,
    clientSlug: task.client?.slug ?? null,
    assigneeName: task.user?.name ?? '—',
    requesterName: task.requesterId ? (nameMap.get(task.requesterId) ?? null) : null,
    watcherNames: task.watchers.map((w) => nameMap.get(w.userId) ?? '—').filter((n) => n !== '—'),
    tags: task.tags,
  }

  return {
    status: task.status,
    evidence: task.evidence,
    requiredOpen,
    canSubmit,
    canValidate,
    meta,
    checklist: task.checklist,
    comments: task.comments.map((c) => ({ id: c.id, body: c.body, authorName: nameMap.get(c.authorId) ?? '—', createdAt: c.createdAt })),
    activities: task.activities.map((a) => ({
      id: a.id, action: a.action, fromValue: a.fromValue, toValue: a.toValue,
      actorName: a.actorId ? (nameMap.get(a.actorId) ?? '—') : 'Sistema', createdAt: a.createdAt,
    })),
    approvals: task.approvals.map((a) => ({
      id: a.id, approverName: a.approverId ? (nameMap.get(a.approverId) ?? '—') : '—',
      approved: a.approved, note: a.note, decidedAt: a.decidedAt,
    })),
  }
}

/**
 * OPE-06 / CSX-10 — Gestor envia a tarefa para validação da CS.
 * Exige evidência preenchida e todos os itens obrigatórios do checklist concluídos.
 * Só o responsável (ou ADMIN) envia. Cria registro de aprovação pendente.
 */
export async function submitTaskForValidation(taskId: string, evidence: string): Promise<ActionResult> {
  const session = await requireSession()

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true, status: true, assignedTo: true, clientId: true, popId: true,
      checklist: { select: { required: true, done: true } },
    },
  })
  if (!task) return { error: 'Tarefa não encontrada.' }

  if (task.assignedTo !== session.userId && session.role !== 'ADMIN') {
    return { error: 'Apenas o responsável pode enviar para validação.' }
  }
  if (!['A_FAZER', 'EM_ANDAMENTO', 'AJUSTES_SOLICITADOS'].includes(task.status)) {
    return { error: 'Esta tarefa não está em um estado que permite envio para validação.' }
  }
  const ev = evidence.trim()
  if (ev.length < 5) {
    return { error: 'Descreva a evidência do que foi feito antes de enviar (mínimo 5 caracteres).' }
  }
  const requiredOpen = task.checklist.filter((c) => c.required && !c.done).length
  if (requiredOpen > 0) {
    return { error: `Conclua os ${requiredOpen} item(ns) obrigatório(s) do checklist antes de enviar.` }
  }

  await prisma.$transaction([
    prisma.task.update({
      where: { id: taskId },
      data: { status: 'AGUARDANDO_CS', evidence: ev },
    }),
    prisma.taskApproval.create({
      data: { taskId, approved: null },
    }),
    prisma.taskActivity.create({
      data: { taskId, actorId: session.userId, action: 'submitted_for_validation', fromValue: task.status, toValue: 'AGUARDANDO_CS' },
    }),
  ])

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'task.submit_validation',
    entityType: 'Task',
    entityId: taskId,
    clientId: task.clientId,
    metadata: { popId: task.popId ?? null },
  })

  revalidatePath('/operacional')
  return { ok: true, id: taskId }
}

/**
 * OPE-06 / CSX-10 — CS valida (aprova) ou solicita ajustes.
 * Aprovado → CONCLUIDO (com completedAt/By). Reprovado → AJUSTES_SOLICITADOS.
 * Só CS ou ADMIN. Fecha o registro de aprovação pendente.
 */
export async function decideTaskValidation(taskId: string, approved: boolean, note?: string): Promise<ActionResult> {
  const session = await requireSession()
  if (session.role !== 'CS' && session.role !== 'ADMIN') {
    return { error: 'Apenas a CS (ou ADMIN) pode validar.' }
  }
  if (!approved && !(note && note.trim().length >= 3)) {
    return { error: 'Explique o que precisa ser ajustado.' }
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, clientId: true, popId: true },
  })
  if (!task) return { error: 'Tarefa não encontrada.' }
  if (!['AGUARDANDO_CS', 'EM_VALIDACAO'].includes(task.status)) {
    return { error: 'Esta tarefa não está aguardando validação.' }
  }

  const pending = await prisma.taskApproval.findFirst({
    where: { taskId, decidedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })

  const newStatus = approved ? 'CONCLUIDO' : 'AJUSTES_SOLICITADOS'
  const now = new Date()

  await prisma.$transaction([
    prisma.task.update({
      where: { id: taskId },
      data: approved
        ? { status: 'CONCLUIDO', completedAt: now, completedById: session.userId }
        : { status: 'AJUSTES_SOLICITADOS' },
    }),
    pending
      ? prisma.taskApproval.update({
          where: { id: pending.id },
          data: { approverId: session.userId, approved, note: note?.trim() || null, decidedAt: now },
        })
      : prisma.taskApproval.create({
          data: { taskId, approverId: session.userId, approved, note: note?.trim() || null, decidedAt: now },
        }),
    prisma.taskActivity.create({
      data: {
        taskId, actorId: session.userId,
        action: approved ? 'validation_approved' : 'validation_changes_requested',
        fromValue: task.status, toValue: newStatus,
      },
    }),
  ])

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: approved ? 'task.validation_approve' : 'task.validation_reject',
    entityType: 'Task',
    entityId: taskId,
    clientId: task.clientId,
    metadata: { popId: task.popId ?? null },
  })

  revalidatePath('/operacional')
  return { ok: true, id: taskId }
}
