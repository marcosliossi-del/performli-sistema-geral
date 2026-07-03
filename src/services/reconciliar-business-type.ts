/**
 * Ajuste idempotente: marca os 3 clientes de atacado como B2B.
 *
 * Decisão do dono (D-012): B2B é medido como NEGÓCIO LOCAL (leads / plataforma
 * de anúncio), não como e-commerce. O cálculo (health-scorer / projeção) já
 * trata B2B como local; falta apenas classificar os clientes certos.
 *
 * Os 3 clientes são: Duplo Sentido Atacado, SVN Atacado e Tuca Clothing.
 *
 * CUIDADO: existem homônimos de VAREJO (Duplo Sentido Varejo, Svn Varejo) que
 * NÃO podem ser marcados como B2B. Por isso o match é restrito a:
 *   - slug exato dos 3 atacados / tuca, OU
 *   - name que contenha "Atacado" das marcas certas, OU "Tuca Clothing".
 * Nenhuma dessas condições casa com os "Varejo".
 *
 * Idempotente: rodar de novo atualiza 0 (já estão em B2B). Registra AuditLog
 * 'client.businessTypeB2B' — evidência mínima (CLAUDE.md #8/#14).
 */

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { writeAuditLog } from '@/lib/audit'

export async function reconciliarBusinessTypeB2B(actor?: {
  actorId: string
  actorRole: string
}): Promise<{ atualizados: number; clientes: string[] }> {
  // Slugs prováveis dos 3 atacados (nunca casam com "…-varejo").
  const slugs = ['duplo-sentido-atacado', 'svn-atacado', 'tuca', 'tuca-oficial', 'tuca-clothing']

  // Condições de nome restritas ao ATACADO das marcas certas + Tuca Clothing.
  // Não usamos apenas "Atacado" solto para não pegar outra marca por engano.
  const nameConditions: Prisma.ClientWhereInput[] = [
    { name: { contains: 'Duplo Sentido Atacado', mode: 'insensitive' } },
    { name: { contains: 'Svn Atacado', mode: 'insensitive' } },
    { name: { contains: 'SVN Atacado', mode: 'insensitive' } },
    { name: { contains: 'Tuca Clothing', mode: 'insensitive' } },
    { name: { contains: 'Tuca Oficial', mode: 'insensitive' } },
  ]

  const where: Prisma.ClientWhereInput = {
    businessType: { not: 'B2B' },
    OR: [
      { slug: { in: slugs } },
      ...nameConditions,
    ],
  }

  // Captura os nomes antes do update (para retorno/evidência) — o where do
  // updateMany é o mesmo, garantindo consistência.
  const alvo = await prisma.client.findMany({
    where,
    select: { name: true },
    orderBy: { name: 'asc' },
  })

  const { count } = await prisma.client.updateMany({
    where,
    data: { businessType: 'B2B' },
  })

  const clientes = alvo.map((c) => c.name)

  await writeAuditLog({
    ...(actor ?? {}),
    action: 'client.businessTypeB2B',
    entityType: 'Client',
    entityId: 'bulk',
    metadata: { atualizados: count, clientes },
  })

  return { atualizados: count, clientes }
}
