/**
 * Resolvedor de DONO (gestor responsável) de um cliente — fonte única de
 * verdade da precedência usada por todas as automações que precisam atribuir
 * uma tarefa/responsabilidade a alguém.
 *
 * Precedência DETERMINÍSTICA (S2-016):
 *   1. Client.gestorId        (dono canônico da ficha do cliente)
 *   2. assignment primária    (ClientAssignment.isPrimary → userId)
 *   3. fallback HEAD global    (primeiro User HEAD ativo)
 *
 * Retorna { assigneeId, usedFallback }. `assigneeId` só é null quando nem o
 * fallback HEAD existe — nesse caso o caller decide o que fazer, mas NUNCA
 * deve engolir silenciosamente (CLAUDE.md #14: evidência mínima).
 */

import { prisma } from '@/lib/prisma'

export type OwnerResolverInput = {
  gestorId: string | null
  assignments: { userId: string }[]
}

export type OwnerResolution = {
  assigneeId: string | null
  usedFallback: boolean
  /** de onde veio o dono resolvido (para log/auditoria). */
  source: 'gestorId' | 'assignmentPrimary' | 'headFallback' | 'none'
}

/**
 * Resolve o dono de um cliente segundo a precedência canônica.
 * Aceita o cliente já carregado (gestorId + assignments primárias) para evitar
 * roundtrips; só consulta o banco quando precisa do fallback HEAD.
 */
export async function resolveClientOwner(
  client: OwnerResolverInput,
): Promise<OwnerResolution> {
  if (client.gestorId) {
    return { assigneeId: client.gestorId, usedFallback: false, source: 'gestorId' }
  }
  const primary = client.assignments[0]?.userId ?? null
  if (primary) {
    return { assigneeId: primary, usedFallback: false, source: 'assignmentPrimary' }
  }

  const head = await prisma.user.findFirst({
    where: { operationalRole: 'HEAD', active: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  if (head) {
    return { assigneeId: head.id, usedFallback: true, source: 'headFallback' }
  }
  return { assigneeId: null, usedFallback: true, source: 'none' }
}
