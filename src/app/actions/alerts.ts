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
  revalidatePath('/cockpit')
}

/**
 * Reconhecer alerta (Fase 2 — governança/SLA). `acknowledged*` é o CONTRATO DE
 * SLA (quem assumiu e quando) — distinto de `read` (estado visual). Idempotente:
 * se já reconhecido, não sobrescreve o dono/data originais. Marca como lido
 * junto (reconhecer implica ter visto). Posse: staff amplo age em qualquer
 * alerta; GESTOR só em alertas de clientes da carteira.
 */
export async function acknowledgeAlert(alertId: string) {
  const session = await requireSession()

  const isViewAll = normalizeRole(session.role) !== 'GESTOR_TRAFEGO'
  const scope = isViewAll
    ? { id: alertId, acknowledgedAt: null }
    : {
        id: alertId,
        acknowledgedAt: null,
        client: { assignments: { some: { userId: session.userId } } },
      }

  // updateMany + filtro acknowledgedAt=null garante idempotência sem corrida:
  // um segundo clique não reescreve quem reconheceu primeiro.
  await prisma.alert.updateMany({
    where: scope,
    data: { acknowledgedAt: new Date(), acknowledgedBy: session.userId, read: true },
  })
  revalidatePath('/alerts')
  revalidatePath('/cockpit')
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
  revalidatePath('/cockpit')
}
