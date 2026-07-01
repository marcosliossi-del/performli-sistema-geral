'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { writeAuditLog } from '@/lib/audit'
import type { ClientNps, ClientRelacionamento, ClientCurva } from '@prisma/client'

type ActionResult = { ok: true } | { error: string }

export type FichaCsInput = {
  nps: ClientNps | null
  relacionamento: ClientRelacionamento | null
  curva: ClientCurva | null
  feedbackNegativo: number
}

/**
 * Ficha de CS — atualiza NPS, Relacionamento, Curva e Feedback negativo do cliente.
 * Valida papel + posse: ADMIN, CS, ou gestor atribuído ao cliente. Registra AuditLog.
 */
export async function updateFichaCs(clientId: string, input: FichaCsInput): Promise<ActionResult> {
  const session = await requireSession()

  const canAll = session.role === 'ADMIN' || session.role === 'CS'
  if (!canAll) {
    if (session.role !== 'MANAGER') return { error: 'Seu papel não permite editar a ficha de CS.' }
    const owns = await prisma.clientAssignment.findFirst({
      where: { clientId, userId: session.userId },
      select: { id: true },
    })
    if (!owns) return { error: 'Você não tem acesso a este cliente.' }
  }

  const fb = Number.isFinite(input.feedbackNegativo) ? Math.max(0, Math.min(99, Math.trunc(input.feedbackNegativo))) : 0

  await prisma.client.update({
    where: { id: clientId },
    data: {
      nps: input.nps,
      relacionamento: input.relacionamento,
      curva: input.curva,
      feedbackNegativo: fb,
      fichaCsUpdatedAt: new Date(),
    },
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'client.ficha_cs.update',
    entityType: 'Client',
    entityId: clientId,
    clientId,
    metadata: { nps: input.nps, relacionamento: input.relacionamento, curva: input.curva, feedbackNegativo: fb },
  })

  revalidatePath(`/clients`)
  return { ok: true }
}
