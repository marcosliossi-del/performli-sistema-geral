/**
 * Ciclo de renovação de contratos (fatia FUNDACAO — adendo Marcos 2026-07-21).
 *
 * Regra da agência (revista): contrato que VENCE não é renovado em silêncio. Ele
 * entra em RENOVAÇÃO (status RENOVACAO) e gera um ALERTA operacional para o
 * cliente — a renovação vira PROCESSO visível ("Arkza em processo, não em
 * memória"), não uma mudança automática invisível. A conclusão da renovação
 * acontece:
 *   (a) na REATIVAÇÃO do cliente (status → ACTIVE) — ver updateClientsStatus,
 *       que renova o mesmo contrato por igual período; ou
 *   (b) manualmente no Jurídico (renewContract).
 *
 * SUBSTITUI o antigo `renewExpiredContracts` (renovava em silêncio p/ VIGENTE).
 * Justificativa registrada em PROJECT_STATE.md e DOSSIE §15 (decisão do Marcos).
 *
 * Roda no cron diário. Idempotente: VIGENTE→RENOVACAO só transita uma vez (no dia
 * seguinte o contrato já é RENOVACAO e não é recapturado). try/catch por contrato
 * (CLAUDE.md #7). AuditLog por transição.
 */

import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import { spDayInfo } from '@/lib/metas/pace'

// Fonte única das datas de renovação (módulo puro, testável isolado).
export { computeRenewalDates } from './contract-renewal-dates'

/**
 * Marca como RENOVACAO todo contrato VIGENTE já vencido (endDate < hoje, no
 * dia-parede SP; Contract.endDate é @db.Date = 00:00Z) e abre um alerta
 * operacional para o cliente. Independe do status do cliente.
 */
export async function flagExpiredContractsForRenewal(): Promise<{
  checked: number
  flagged: number
  alertsFired: number
  failed: number
}> {
  const { spDayStartUtc } = spDayInfo(new Date())

  const expired = await prisma.contract.findMany({
    where: { status: 'VIGENTE', endDate: { lt: spDayStartUtc } },
    select: {
      id: true,
      clientId: true,
      endDate: true,
      client: { select: { name: true } },
    },
  })

  let flagged = 0
  let alertsFired = 0
  let failed = 0

  for (const c of expired) {
    try {
      await prisma.contract.update({
        where: { id: c.id },
        data: { status: 'RENOVACAO' },
      })
      flagged++

      // Cache do Client (contractEndDate) permanece apontando p/ o fim vencido
      // até a renovação ser concluída (reativação/manual) — reflete a realidade.
      const dataFim = c.endDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
      await prisma.alert.create({
        data: {
          clientId: c.clientId,
          type: 'CONTRACT_EXPIRING_SOON',
          title: 'Contrato em renovação',
          body: `Contrato de ${c.client.name} venceu em ${dataFim} — em renovação.`,
          read: false,
        },
      })
      alertsFired++

      await writeAuditLog({
        actorRole: 'SYSTEM',
        action: 'contract.expired_to_renewal',
        entityType: 'Contract',
        entityId: c.id,
        clientId: c.clientId,
        metadata: { endDate: c.endDate.toISOString() },
      })
    } catch (err) {
      console.error(`[contract-renewal] falha ao marcar contrato ${c.id} em renovação:`, err)
      failed++
    }
  }

  return { checked: expired.length, flagged, alertsFired, failed }
}
