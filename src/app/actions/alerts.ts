'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { normalizeRole } from '@/lib/rbac'

export async function markAlertRead(alertId: string) {
  const session = await requireSession()

  // Posse: staff amplo (ADMIN/CS/SUPERVISOR/ANALISTA) vê tudo; só GESTOR fica
  // restrito a alertas de clientes atribuídos.
  const isViewAll = normalizeRole(session.role) !== 'GESTOR_TRAFEGO'
  const scope = isViewAll
    ? { id: alertId }
    : { id: alertId, client: { assignments: { some: { userId: session.userId } } } }

  await prisma.alert.updateMany({ where: scope, data: { read: true } })
  revalidatePath('/alerts')
  revalidatePath('/dashboard')
}

export async function markAllAlertsRead() {
  const session = await requireSession()

  const isViewAll = normalizeRole(session.role) !== 'GESTOR_TRAFEGO'
  const where =
    isViewAll
      ? { read: false }
      : { read: false, client: { assignments: { some: { userId: session.userId } } } }

  await prisma.alert.updateMany({ where, data: { read: true } })
  revalidatePath('/alerts')
  revalidatePath('/dashboard')
}
