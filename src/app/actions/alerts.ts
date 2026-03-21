'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'

export async function markAlertRead(alertId: string) {
  await requireSession()
  await prisma.alert.update({ where: { id: alertId }, data: { read: true } })
  revalidatePath('/alerts')
  revalidatePath('/dashboard')
}

export async function markAllAlertsRead() {
  const session = await requireSession()

  const where =
    session.role === 'ADMIN'
      ? { read: false }
      : { read: false, client: { assignments: { some: { userId: session.userId } } } }

  await prisma.alert.updateMany({ where, data: { read: true } })
  revalidatePath('/alerts')
  revalidatePath('/dashboard')
}
