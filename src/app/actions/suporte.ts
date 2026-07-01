'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { assertClientMutationAccess, writeAuditLog } from '@/lib/audit'
import { SupportDirection, SupportCategory, TaskPriority } from '@prisma/client'

const createSchema = z.object({
  clientId:    z.string().min(1, 'Selecione um cliente'),
  title:       z.string().min(3, 'Descreva a demanda'),
  category:    z.nativeEnum(SupportCategory),
  direction:   z.nativeEnum(SupportDirection).optional(),
  priority:    z.nativeEnum(TaskPriority).default('MEDIA'),
  dueDate:     z.string().optional(),
  description: z.string().optional(),
  assigneeId:  z.string().optional(),
})

type CreateSupportInput = {
  clientId: string
  title: string
  category: 'TRAFEGO' | 'DEMANDA_DA_AGENCIA' | 'SUCESSO_DO_CLIENTE'
  direction?: 'CLIENTE_PARA_NOS' | 'NOS_PARA_CLIENTE'
  priority?: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA'
  dueDate?: string
  description?: string
  assigneeId?: string
}

/**
 * Cria uma demanda de atendimento no Hub de Suporte.
 * Valida autenticação + papel + posse do cliente (CS acompanha).
 */
export async function createSupportDemand(
  input: CreateSupportInput,
): Promise<{ ok: true; id: string } | { error: string }> {
  const session = await requireSession()
  const { userId } = session

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(', ') }
  }

  const { clientId, title, category, direction, priority, dueDate, description, assigneeId } =
    parsed.data

  try {
    await assertClientMutationAccess(session, clientId, { allowCS: true })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Sem permissão para esta ação.' }
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { csId: true },
  })
  if (!client) return { error: 'Cliente não encontrado.' }

  const now = new Date()
  const task = await prisma.task.create({
    data: {
      title,
      description: description || null,
      isSupport: true,
      supportDirection: direction ?? null,
      supportCategory: category,
      type: 'CS',
      status: 'A_FAZER',
      priority,
      dueDate: dueDate ? new Date(dueDate) : null,
      clientId,
      assignedTo: assigneeId ?? client.csId ?? userId,
      requesterId: userId,
      requestedAt: now,
      activities: { create: { actorId: userId, action: 'created' } },
    },
  })

  await writeAuditLog({
    actorId: userId,
    actorRole: session.role,
    action: 'support.create',
    entityType: 'Task',
    entityId: task.id,
    clientId,
    metadata: { category, direction: direction ?? null, priority },
  })

  revalidatePath('/suporte')
  return { ok: true, id: task.id }
}
