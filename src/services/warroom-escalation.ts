/**
 * War Room Escalation (WAR-14 / caminho crítico)
 *
 * Regra do dossiê: "Se uma conta passar 3 semanas em crítico, o sistema deve
 * escalar para Marcos." Roda no cron diário.
 *
 * - Considera War Rooms (CriticalProtocol) abertas há ≥ 21 dias ainda não encerradas.
 * - Idempotente: só escala uma vez (campo escalatedAt). Não re-dispara.
 * - try/catch POR protocolo — falha em um não aborta os demais.
 * - Cada escalação registra Alert + AuditLog (ator = sistema).
 */

import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import { broadcastWhatsApp } from '@/lib/whatsapp'

const ESCALATION_DAYS = 21

export async function escalateStaleWarRooms(): Promise<{
  checked: number
  escalated: number
}> {
  const cutoff = new Date(Date.now() - ESCALATION_DAYS * 86_400_000)

  const stale = await prisma.criticalProtocol.findMany({
    where: {
      status: { not: 'ENCERRADO' },
      escalatedAt: null,
      activatedAt: { lte: cutoff },
    },
    select: {
      id: true,
      clientId: true,
      activatedAt: true,
      exitCriteria: true,
      client: { select: { name: true } },
    },
  })

  let escalated = 0

  for (const p of stale) {
    try {
      const weeks = Math.floor((Date.now() - new Date(p.activatedAt).getTime()) / (7 * 86_400_000))

      // Idempotência forte: só marca se ainda estiver null (evita corrida).
      const updated = await prisma.criticalProtocol.updateMany({
        where: { id: p.id, escalatedAt: null },
        data: { escalatedAt: new Date() },
      })
      if (updated.count === 0) continue

      await prisma.alert.create({
        data: {
          clientId: p.clientId,
          type: 'STATUS_DROPPED_TO_RUIM',
          title: `Escalar para Marcos: ${p.client.name} crítico há ${weeks} semanas`,
          body: p.exitCriteria
            ? `War Room aberta há ${weeks} semanas sem sair do crítico. Critério de saída: ${p.exitCriteria}. Decisão de Marcos necessária.`
            : `War Room aberta há ${weeks} semanas e ainda SEM critério de saída definido. Decisão de Marcos necessária.`,
        },
      })

      await writeAuditLog({
        actorId: null,
        actorRole: 'SYSTEM',
        action: 'warroom.escalate',
        entityType: 'CriticalProtocol',
        entityId: p.id,
        clientId: p.clientId,
        metadata: { weeks, reason: '3+ semanas em crítico' },
      })

      try {
        await broadcastWhatsApp(
          [
            `⏫ *War Room escalada para Marcos*`,
            ``,
            `*Cliente:* ${p.client.name}`,
            `*Tempo em crítico:* ${weeks} semanas`,
            p.exitCriteria
              ? `*Critério de saída:* ${p.exitCriteria}`
              : `⚠️ *Sem critério de saída definido.*`,
            ``,
            `Conta passou de 3 semanas em crítico — decisão de Marcos necessária.`,
          ].join('\n'),
          false,
        )
      } catch (err) {
        console.error('[warroom-escalation] WhatsApp falhou:', err)
      }

      escalated++
    } catch (err) {
      console.error(`[warroom-escalation] falha no protocolo ${p.id}:`, err)
    }
  }

  return { checked: stale.length, escalated }
}
