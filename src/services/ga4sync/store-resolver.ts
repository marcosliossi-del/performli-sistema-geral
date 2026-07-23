import { prisma } from '@/lib/prisma'

/**
 * Resolve o storeId do GA4Sync a partir de um clientId do Performli.
 *
 * PRECEDÊNCIA (decisão Marcos 2026-07-23 — esquecer o vínculo manual Nuvemshop):
 *  1. VÍNCULO DIRETO: PlatformAccount(platform=GA4SYNC, active) → externalId é o
 *     storeId. Criado pelo auto-vínculo por nome (ga4sync/auto-link.ts) — "padrão
 *     para todos os e-commerces", sem depender de Nuvemshop.
 *  2. FALLBACK LEGADO: Client → PlatformAccount(NUVEMSHOP, active) → 1:1
 *     NuvemshopStore.storeId. Mantido para não quebrar quem já estava vinculado.
 *
 * REGRAS:
 *  - clientId SEMPRE vem do chamador (nunca inventado/derivado de input externo).
 *  - A query filtra clientId explicitamente (defesa em profundidade).
 *  - Degrade suave: retorna null se nenhum caminho resolver o storeId.
 */
export async function resolveGa4SyncStoreId(clientId: string): Promise<string | null> {
  if (!clientId) return null

  // 1. Vínculo direto GA4SYNC (auto-vinculado por nome ou criado por sync anterior).
  const direct = await prisma.platformAccount.findFirst({
    where: { clientId, platform: 'GA4SYNC', active: true },
    select: { externalId: true },
    orderBy: { createdAt: 'desc' },
  })
  if (direct?.externalId) return direct.externalId

  // 2. Fallback legado: loja Nuvemshop mapeada.
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
