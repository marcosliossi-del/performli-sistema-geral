import 'server-only'
import { prisma } from './prisma'
import { Prisma } from '@prisma/client'

type SessionLike = { userId: string; role: string }

/**
 * Garante que o papel + posse permitem MUTAR algo de um cliente.
 * Lança Error se não permitido (o caller traduz para mensagem operacional).
 *
 * - ADMIN: qualquer cliente.
 * - CS: qualquer cliente — apenas quando `allowCS` (processos que são da CS,
 *   como War Room / validação de check-in). Fora disso, CS é read-only.
 * - MANAGER: apenas clientes atribuídos via ClientAssignment.
 * - ANALYST: nunca muta.
 */
export async function assertClientMutationAccess(
  session: SessionLike,
  clientId: string,
  opts: { allowCS?: boolean } = {},
): Promise<void> {
  const { userId, role } = session

  if (role === 'ADMIN') return
  if (role === 'CS' && opts.allowCS) return

  if (role === 'MANAGER') {
    const assigned = await prisma.clientAssignment.findFirst({
      where: { clientId, userId },
      select: { id: true },
    })
    if (assigned) return
    throw new Error('Sem permissão: este cliente não está atribuído a você.')
  }

  throw new Error('Sem permissão para executar esta ação.')
}

/**
 * Grava uma entrada na trilha de auditoria (CLAUDE.md regra técnica #8).
 * Append-only. Nunca lança: uma falha de auditoria não pode derrubar a mutação
 * principal — apenas registra no log do servidor.
 */
export async function writeAuditLog(entry: {
  actorId?: string | null
  actorRole?: string | null
  action: string
  entityType: string
  entityId: string
  clientId?: string | null
  metadata?: Prisma.InputJsonValue
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        actorRole: entry.actorRole ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        clientId: entry.clientId ?? null,
        metadata: entry.metadata,
      },
    })
  } catch (err) {
    console.error('[audit] falha ao gravar AuditLog:', err)
  }
}
