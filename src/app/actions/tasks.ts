'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { TaskPriority, TaskStatus } from '@prisma/client'

const createSchema = z.object({
  title:       z.string().min(3, 'Título obrigatório'),
  description: z.string().optional(),
  priority:    z.nativeEnum(TaskPriority).default('MEDIA'),
  dueDate:     z.string().optional(),
  clientId:    z.string().optional(),
})

export async function createTask(formData: FormData) {
  const { userId } = await requireSession()

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
  const { userId } = await requireSession()

  const current = await prisma.task.findUnique({
    where: { id: taskId },
    select: { status: true },
  })
  if (!current) throw new Error('Tarefa não encontrada.')

  const isConcluir = status === 'CONCLUIDO'

  await prisma.task.update({
    where: { id: taskId },
    data: {
      status,
      ...(isConcluir
        ? { completedAt: new Date(), completedById: userId }
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

  revalidatePath('/tasks')
  revalidatePath('/operacional')
}
