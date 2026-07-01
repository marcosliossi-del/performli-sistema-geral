'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { assertClientMutationAccess } from '@/lib/audit'
import { CriticalProtocolStatus } from '@prisma/client'

/**
 * War Room é processo da CS: ADMIN, CS ou gestor atribuído ao cliente do protocolo.
 * Lança Error se não permitido (o caller trata).
 */
async function assertProtocolAccess(session: { userId: string; role: string }, protocolId: string) {
  const protocol = await prisma.criticalProtocol.findUnique({
    where: { id: protocolId },
    select: { clientId: true },
  })
  if (!protocol) throw new Error('Protocolo não encontrado.')
  await assertClientMutationAccess(session, protocol.clientId, { allowCS: true })
}

export async function updateProtocolStatus(protocolId: string, status: CriticalProtocolStatus) {
  const session = await requireSession()
  await assertProtocolAccess(session, protocolId)

  const data: { status: CriticalProtocolStatus; closedAt?: Date } = { status }
  if (status === 'ENCERRADO') data.closedAt = new Date()

  await prisma.criticalProtocol.update({
    where: { id: protocolId },
    data,
  })

  revalidatePath('/anti-churn')
}

export async function updateProtocolBriefing(protocolId: string, briefingCS: string) {
  const session = await requireSession()
  await assertProtocolAccess(session, protocolId)

  await prisma.criticalProtocol.update({
    where: { id: protocolId },
    data: { briefingCS },
  })

  revalidatePath('/anti-churn')
}

export async function updateProtocolNotes(protocolId: string, notes: string) {
  const session = await requireSession()
  await assertProtocolAccess(session, protocolId)

  await prisma.criticalProtocol.update({
    where: { id: protocolId },
    data: { notes },
  })

  revalidatePath('/anti-churn')
}
