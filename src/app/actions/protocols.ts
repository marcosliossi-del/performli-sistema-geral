'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { CriticalProtocolStatus } from '@prisma/client'

export async function updateProtocolStatus(protocolId: string, status: CriticalProtocolStatus) {
  await requireSession()

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
  if (session.role !== 'ADMIN' && session.role !== 'CS' && session.role !== 'MANAGER') {
    throw new Error('Sem permissão')
  }

  await prisma.criticalProtocol.update({
    where: { id: protocolId },
    data: { briefingCS },
  })

  revalidatePath('/anti-churn')
}

export async function updateProtocolNotes(protocolId: string, notes: string) {
  await requireSession()

  await prisma.criticalProtocol.update({
    where: { id: protocolId },
    data: { notes },
  })

  revalidatePath('/anti-churn')
}
