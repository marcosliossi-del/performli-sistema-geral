'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { assertClientMutationAccess } from '@/lib/audit'
import { InteractionType, PipelineStage } from '@prisma/client'

export async function addInteraction(
  clientId: string,
  type: InteractionType,
  description: string
) {
  const session = await requireSession()
  if (!description.trim()) return { error: 'Descrição é obrigatória.' }

  try {
    await assertClientMutationAccess(session, clientId)
  } catch (e) {
    return { error: (e as Error).message }
  }

  await prisma.clientInteraction.create({
    data: { clientId, userId: session.userId, type, description: description.trim() },
  })

  revalidatePath(`/clients/[slug]`, 'page')
  return { ok: true }
}

export async function deleteInteraction(id: string) {
  const session = await requireSession()
  const interaction = await prisma.clientInteraction.findUnique({
    where: { id },
    select: { clientId: true, userId: true },
  })
  if (!interaction) return { error: 'Interação não encontrada.' }

  try {
    await assertClientMutationAccess(session, interaction.clientId)
  } catch (e) {
    return { error: (e as Error).message }
  }

  await prisma.clientInteraction.delete({ where: { id } })
  revalidatePath(`/clients/[slug]`, 'page')
  return { ok: true }
}

export async function updatePipelineStage(clientId: string, stage: PipelineStage) {
  const session = await requireSession()
  try {
    await assertClientMutationAccess(session, clientId)
  } catch (e) {
    return { error: (e as Error).message }
  }
  await prisma.client.update({
    where: { id: clientId },
    data: {
      pipelineStage: stage,
      // Keep status in sync for terminal stages
      ...(stage === 'CHURNED' ? { status: 'CHURNED' } : {}),
      ...(stage === 'ATIVO'   ? { status: 'ACTIVE'  } : {}),
    },
  })
  revalidatePath('/pipeline')
  revalidatePath(`/clients/[slug]`, 'page')
  return { ok: true }
}

export async function updateClientCrmFields(
  clientId: string,
  data: {
    email?: string
    phone?: string
    document?: string
    contractValue?: string
    contractStart?: string
    tags?: string[]
  }
) {
  const session = await requireSession()
  try {
    await assertClientMutationAccess(session, clientId)
  } catch (e) {
    return { error: (e as Error).message }
  }
  await prisma.client.update({
    where: { id: clientId },
    data: {
      email:         data.email         || null,
      phone:         data.phone         || null,
      document:      data.document      || null,
      contractValue: data.contractValue ? parseFloat(data.contractValue) : null,
      contractStart: data.contractStart ? new Date(data.contractStart)   : null,
      tags:          data.tags ?? [],
    },
  })
  revalidatePath(`/clients/[slug]`, 'page')
  return { ok: true }
}
