/**
 * Backfill Resultado → Etapa (ponto cego do ClickUp: automações não rodam
 * retroativamente). Recalcula Client.etapa a partir do Client.resultado ATUAL de
 * todos os clientes ativos:
 *   OTIMO         → ESCALA
 *   BOM / REGULAR → MONITORAMENTO
 *   RUIM / PESSIMO→ OTIMIZACAO
 *   resultado null→ não mexe
 *
 * Idempotente (só grava quando a etapa muda). try/catch por cliente. Registra um
 * AuditLog agregado com a contagem.
 */

import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import type { ClientResultado, ClientEtapa } from '@prisma/client'

function etapaFor(resultado: ClientResultado): ClientEtapa {
  if (resultado === 'OTIMO') return 'ESCALA'
  if (resultado === 'BOM' || resultado === 'REGULAR') return 'MONITORAMENTO'
  return 'OTIMIZACAO' // RUIM / PESSIMO
}

export async function backfillEtapaFromResultado(actor?: { actorId?: string; actorRole?: string }): Promise<{
  processados: number
  atualizados: number
  semResultado: number
  falhas: number
}> {
  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, resultado: true, etapa: true },
  })

  let atualizados = 0
  let semResultado = 0
  let falhas = 0

  for (const c of clients) {
    try {
      if (c.resultado == null) { semResultado++; continue }
      const alvo = etapaFor(c.resultado)
      if (c.etapa === alvo) continue
      await prisma.client.update({ where: { id: c.id }, data: { etapa: alvo } })
      atualizados++
    } catch (err) {
      falhas++
      console.error(`[backfill-etapa] falha no cliente ${c.id}:`, err)
    }
  }

  await writeAuditLog({
    actorId: actor?.actorId ?? null,
    actorRole: actor?.actorRole ?? 'SYSTEM',
    action: 'client.backfillEtapa',
    entityType: 'Client',
    entityId: 'bulk',
    metadata: { processados: clients.length, atualizados, semResultado, falhas },
  })

  return { processados: clients.length, atualizados, semResultado, falhas }
}
