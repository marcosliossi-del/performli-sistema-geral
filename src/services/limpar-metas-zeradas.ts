/**
 * Limpeza idempotente de metas zeradas (bug antigo de cálculo).
 *
 * Metas com `targetValue = 0` (ou negativo) no banco vieram de um bug antigo de
 * projeção. Hoje 0 já é tratado como "sem meta" (o motor NÃO grava mais alvos
 * <= 0), então as linhas zeradas remanescentes só sujam as leituras (aparecem
 * como "meta sem valor" nas telas de metas/saúde). O dono confirmou (2026-07)
 * que todos os clientes têm metas projetadas, então apagar as zeradas é seguro.
 *
 * Idempotente: rodar de novo apaga 0 (não há mais zeradas). Registra AuditLog
 * com a contagem — evidência mínima (CLAUDE.md #8/#14).
 */

import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'

export async function limparMetasZeradas(actor?: {
  actorId: string
  actorRole: string
}): Promise<{ removidas: number }> {
  const { count } = await prisma.goal.deleteMany({
    where: { targetValue: { lte: 0 } },
  })

  await writeAuditLog({
    ...(actor ?? {}),
    action: 'goals.limpezaZeradas',
    entityType: 'Goal',
    entityId: 'bulk',
    metadata: { removidas: count },
  })

  return { removidas: count }
}
