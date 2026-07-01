'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'

export async function markAlertRead(alertId: string) {
  const session = await requireSession()

  // Posse: ADMIN/CS veem tudo; MANAGER/ANALYST só alertas de clientes atribuídos.
  const isViewAll = session.role === 'ADMIN' || session.role === 'CS'
  const scope = isViewAll
    ? { id: alertId }
    : { id: alertId, client: { assignments: { some: { userId: session.userId } } } }

  await prisma.alert.updateMany({ where: scope, data: { read: true } })
  revalidatePath('/alerts')
  revalidatePath('/dashboard')
}

export async function markAllAlertsRead() {
  const session = await requireSession()

  const isViewAll = session.role === 'ADMIN' || session.role === 'CS'
  const where =
    isViewAll
      ? { read: false }
      : { read: false, client: { assignments: { some: { userId: session.userId } } } }

  await prisma.alert.updateMany({ where, data: { read: true } })
  revalidatePath('/alerts')
  revalidatePath('/dashboard')
}
