'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { assertClientMutationAccess, writeAuditLog } from '@/lib/audit'

type ActionResult = { ok: true } | { error: string }

/**
 * CSX-13 — Registra uma ação proativa de anti-churn para um cliente em risco.
 * Vira um ClientInteraction (tipo NOTA, prefixado) + AuditLog. Valida posse.
 */
export async function registerProactiveAction(
  clientId: string,
  description: string,
): Promise<ActionResult> {
  const session = await requireSession()

  if (!description.trim()) {
    return { error: 'Descreva a ação proativa realizada (ex.: liguei, alinhei expectativa).' }
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true },
  })
  if (!client) return { error: 'Cliente não encontrado.' }

  try {
    await assertClientMutationAccess(session, clientId, { allowCS: true })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Sem permissão.' }
  }

  await prisma.clientInteraction.create({
    data: {
      clientId,
      userId: session.userId,
      type: 'NOTA',
      description: `[Anti-churn] ${description.trim()}`,
    },
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'antichurn.proactive_action',
    entityType: 'Client',
    entityId: clientId,
    clientId,
    metadata: { description: description.trim() },
  })

  revalidatePath('/anti-churn')
  return { ok: true }
}
