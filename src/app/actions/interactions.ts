'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { assertClientMutationAccess } from '@/lib/audit'
import { InteractionType, PipelineStage } from '@prisma/client'
import { runClientOffboarding } from '@/services/client-offboarding'

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
  // Estado ANTES da mudança — para detectar a transição real para CHURNED.
  const before = await prisma.client.findUnique({
    where: { id: clientId },
    select: { status: true },
  })

  await prisma.client.update({
    where: { id: clientId },
    data: {
      pipelineStage: stage,
      // Keep status in sync for terminal stages
      ...(stage === 'CHURNED' ? { status: 'CHURNED' } : {}),
      ...(stage === 'ATIVO'   ? { status: 'ACTIVE'  } : {}),
    },
  })

  // ClientOffboardingAgent — dispara SÓ na transição real para CHURNED
  // (cliente não estava CHURNED e agora está). Best-effort: falha aqui NÃO
  // quebra o cancelamento (o status já foi persistido acima).
  if (stage === 'CHURNED' && before?.status !== 'CHURNED') {
    try {
      await runClientOffboarding(clientId)
    } catch (err) {
      console.error('[offboarding] falha ao rodar runClientOffboarding:', err)
    }
  }

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
