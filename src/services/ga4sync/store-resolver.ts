import { prisma } from '@/lib/prisma'

/**
 * Resolve o storeId do GA4Sync a partir de um clientId do Performli.
 *
 * Mapa (auditado): Client → PlatformAccount(platform=NUVEMSHOP, active) → 1:1
 * NuvemshopStore.storeId (= Nuvemshop store ID = storeId do GA4Sync).
 *
 * REGRAS:
 *  - clientId SEMPRE vem do chamador (nunca inventado/derivado de input externo).
 *  - A query filtra clientId explicitamente (defesa em profundidade).
 *  - Degrade suave: retorna null se o cliente não tem loja Nuvemshop conectada
 *    (nenhuma PlatformAccount NUVEMSHOP ativa com NuvemshopStore). O chamador
 *    decide como comunicar isso operacionalmente na UI (slice futura).
 */
export async function resolveGa4SyncStoreId(clientId: string): Promise<string | null> {
  if (!clientId) return null

  const account = await prisma.platformAccount.findFirst({
    where: {
      clientId,
      platform: 'NUVEMSHOP',
      active: true,
      nuvemshopStore: { isNot: null },
    },
    select: {
      nuvemshopStore: { select: { storeId: true } },
    },
    // Se houver mais de uma conta (não deveria, por unicidade de negócio),
    // pega a mais recente para determinismo.
    orderBy: { createdAt: 'desc' },
  })

  return account?.nuvemshopStore?.storeId ?? null
}
