'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { assertClientMutationAccess, writeAuditLog } from '@/lib/audit'
import { SupportDirection } from '@prisma/client'

const createSchema = z.object({
  clientId:    z.string().min(1, 'Selecione um cliente'),
  title:       z.string().min(3, 'Descreva a demanda'),
  direction:   z.nativeEnum(SupportDirection),
  description: z.string().optional(),
  assigneeId:  z.string().optional(),
})

type CreateSupportInput = {
  clientId: string
  title: string
  direction: 'CLIENTE_PARA_NOS' | 'NOS_PARA_CLIENTE'
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

  const { clientId, title, direction, description, assigneeId } = parsed.data

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
      supportDirection: direction,
      type: 'CS',
      status: 'A_FAZER',
      priority: 'MEDIA',
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
    metadata: { direction },
  })

  revalidatePath('/suporte')
  return { ok: true, id: task.id }
}
