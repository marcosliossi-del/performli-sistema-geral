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

  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } })
  if (!task) return { error: 'Tarefa não encontrada.' }

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
  await requireSession()
  const item = await prisma.taskChecklistItem.findUnique({ where: { id: itemId }, select: { id: true } })
  if (!item) return { error: 'Item não encontrado.' }

  await prisma.taskChecklistItem.update({ where: { id: itemId }, data: { done } })
  revalidatePath('/operacional')
  return { ok: true }
}

export type TaskDetail = {
  checklist: { id: string; label: string; done: boolean; required: boolean }[]
  comments: { id: string; body: string; authorName: string; createdAt: Date }[]
  activities: { id: string; action: string; fromValue: string | null; toValue: string | null; actorName: string; createdAt: Date }[]
}

/** Carrega checklist, comentários e atividade de uma tarefa (para o drawer). */
export async function loadTaskDetail(taskId: string): Promise<TaskDetail | null> {
  await requireSession()
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      checklist: { orderBy: { order: 'asc' }, select: { id: true, label: true, done: true, required: true } },
      comments: { orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, body: true, authorId: true, createdAt: true } },
      activities: { orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, action: true, fromValue: true, toValue: true, actorId: true, createdAt: true } },
    },
  })
  if (!task) return null

  const ids = Array.from(
    new Set([
      ...task.comments.map((c) => c.authorId),
      ...task.activities.map((a) => a.actorId).filter((x): x is string => !!x),
    ]),
  )
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : []
  const nameMap = new Map(users.map((u) => [u.id, u.name]))

  return {
    checklist: task.checklist,
    comments: task.comments.map((c) => ({ id: c.id, body: c.body, authorName: nameMap.get(c.authorId) ?? '—', createdAt: c.createdAt })),
    activities: task.activities.map((a) => ({
      id: a.id, action: a.action, fromValue: a.fromValue, toValue: a.toValue,
      actorName: a.actorId ? (nameMap.get(a.actorId) ?? '—') : 'Sistema', createdAt: a.createdAt,
    })),
  }
}
