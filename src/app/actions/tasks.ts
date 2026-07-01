'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { assertClientMutationAccess } from '@/lib/audit'
import { checkTaskCompletion } from '@/services/task-completion-guard'
import { TaskPriority, TaskStatus } from '@prisma/client'

const createSchema = z.object({
  title:       z.string().min(3, 'Título obrigatório'),
  description: z.string().optional(),
  priority:    z.nativeEnum(TaskPriority).default('MEDIA'),
  dueDate:     z.string().optional(),
  clientId:    z.string().optional(),
})

export async function createTask(formData: FormData) {
  const session = await requireSession()
  const { userId } = session

  const raw = {
    title:       formData.get('title'),
    description: formData.get('description') ?? undefined,
    priority:    formData.get('priority') ?? 'MEDIA',
    dueDate:     formData.get('dueDate') ?? undefined,
    clientId:    formData.get('clientId') ?? undefined,
  }

  const parsed = createSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(', '))
  }

  const { title, description, priority, dueDate, clientId } = parsed.data

  // Posse: tarefa vinculada a cliente exige papel + atribuição (CS acompanha).
  if (clientId) {
    await assertClientMutationAccess(session, clientId, { allowCS: true })
  }

  const task = await prisma.task.create({
    data: {
      title,
      description: description || null,
      priority,
      dueDate: dueDate ? new Date(dueDate) : null,
      clientId: clientId || null,
      assignedTo: userId,
      requesterId: userId,
      requestedAt: new Date(), // data do pedido
      activities: { create: { actorId: userId, action: 'created' } },
    },
  })

  revalidatePath('/tasks')
  revalidatePath('/operacional')
  return { ok: true, id: task.id }
}

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  const session = await requireSession()
  const { userId } = session

  const current = await prisma.task.findUnique({
    where: { id: taskId },
    select: { status: true, popId: true, type: true, clientId: true, assignedTo: true, client: { select: { name: true } } },
  })
  if (!current) throw new Error('Tarefa não encontrada.')

  // Mutação em tarefa de cliente: valida papel + posse (CS acompanha, pode atualizar).
  if (current.clientId) {
    await assertClientMutationAccess(session, current.clientId, { allowCS: true })
  }

  const isConcluir = status === 'CONCLUIDO'

  // FASE 5 — TaskCompletionGuard: só bloqueia tarefas críticas flag-gated.
  // Tarefas comuns retornam allowed:true e concluem exatamente como antes.
  if (isConcluir && current.status !== 'CONCLUIDO') {
    const guard = await checkTaskCompletion(taskId)
    if (!guard.allowed) {
      await prisma.task.update({
        where: { id: taskId },
        data: { blockReason: guard.reason ?? 'Conclusão bloqueada: requisitos obrigatórios pendentes.' },
      })
      throw new Error(guard.reason ?? 'Não é possível concluir: requisitos obrigatórios pendentes.')
    }
  }

  await prisma.task.update({
    where: { id: taskId },
    data: {
      status,
      ...(isConcluir
        ? { completedAt: new Date(), completedById: userId, blockReason: null }
        : { completedAt: null, completedById: null }),
      activities: {
        create: {
          actorId: userId,
          action: 'status_changed',
          fromValue: current.status,
          toValue: status,
        },
      },
    },
  })

  // BLOCO 6 — evento: concluir ONB-04 gera o acompanhamento dos 30 dias (ONB-05).
  if (isConcluir && current.status !== 'CONCLUIDO' && current.popId === 'pop_onb_04' && current.clientId) {
    try {
      const idempotencyKey = `onboarding-30d:${current.clientId}`
      const exists = await prisma.task.findUnique({ where: { idempotencyKey }, select: { id: true } })
      if (!exists) {
        await prisma.task.create({
          data: {
            title: `Acompanhamento 30 dias — ${current.client?.name ?? 'cliente'}`,
            description: 'Revisar os primeiros 30 dias do cliente: resultados, expectativas, saúde e próximos passos.',
            type: 'ONBOARDING',
            priority: 'MEDIA',
            status: 'A_FAZER',
            origin: 'AUTOMACAO',
            clientId: current.clientId,
            assignedTo: current.assignedTo,
            areaId: 'area_onboarding',
            popId: 'pop_onb_05',
            requesterId: userId,
            requestedAt: new Date(),
            dueDate: new Date(Date.now() + 30 * 86_400_000),
            idempotencyKey,
            checklist: {
              create: [
                { label: 'Revisar resultados dos primeiros 30 dias', required: true, order: 0 },
                { label: 'Conferir alinhamento de expectativas com o cliente', required: true, order: 1 },
                { label: 'Avaliar saúde e risco de churn', required: true, order: 2 },
                { label: 'Definir próximos passos / plano do mês 2', required: false, order: 3 },
              ],
            },
            activities: { create: { actorId: userId, action: 'created' } },
          },
        })
      }
    } catch {
      // best-effort: não quebra a conclusão da tarefa
    }
  }

  revalidatePath('/tasks')
  revalidatePath('/operacional')
}
