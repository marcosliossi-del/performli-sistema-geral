import 'server-only'
import { prisma } from './prisma'
import { Prisma } from '@prisma/client'
import { normalizeRole } from './rbac'

type SessionLike = { userId: string; role: string }

/**
 * @deprecated Preferir o policy engine em `src/lib/rbac` diretamente
 * (`normalizeRole` + `can('clientes','update')` + `scopeClients`). Mantido como
 * fachada de compatibilidade para os callers existentes; internamente delega ao
 * engine.
 *
 * Garante que o papel + posse permitem MUTAR algo de um cliente.
 * Lança Error se não permitido (o caller traduz para mensagem operacional).
 *
 * - ADMIN: qualquer cliente.
 * - CS / SUPERVISOR_TRAFEGO / ANALISTA_TRAFEGO: staff amplo — mutação de
 *   processos de cliente liberada (o antigo `allowCS` continua sendo respeitado
 *   para CS por compatibilidade; staff de tráfego é sempre amplo).
 * - GESTOR_TRAFEGO (ex-MANAGER): apenas clientes atribuídos via ClientAssignment.
 */
export async function assertClientMutationAccess(
  session: SessionLike,
  clientId: string,
  opts: { allowCS?: boolean } = {},
): Promise<void> {
  const { userId } = session
  const role = normalizeRole(session.role)

  if (role === 'ADMIN') return
  // Staff amplo de tráfego opera em qualquer cliente.
  if (role === 'SUPERVISOR_TRAFEGO' || role === 'ANALISTA_TRAFEGO') return
  if (role === 'CS' && opts.allowCS) return

  if (role === 'GESTOR_TRAFEGO') {
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
