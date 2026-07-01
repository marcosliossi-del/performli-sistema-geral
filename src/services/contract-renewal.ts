/**
 * Renovação automática de contratos.
 *
 * Regra da agência: todo contrato tem renovação automática por igual período.
 * Se o contrato venceu (endDate passou) e o cliente NÃO se manifestou
 * (continua ACTIVE — não foi cancelado), o contrato é renovado por um novo
 * período de mesma duração, a partir da data de encerramento anterior.
 *
 * Roda no cron diário. Idempotente: após renovar, endDate fica no futuro e não
 * dispara de novo. try/catch por contrato. Registra AuditLog de cada renovação.
 */

import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'

function addMonths(base: Date, months: number): Date {
  const dt = new Date(base)
  dt.setMonth(dt.getMonth() + months)
  return dt
}

export async function renewExpiredContracts(): Promise<{ checked: number; renewed: number; failed: number }> {
  const now = new Date()

  // Contratos vigentes já vencidos, de clientes ATIVOS (não cancelados).
  const contracts = await prisma.contract.findMany({
    where: {
      status: 'VIGENTE',
      endDate: { lt: now },
      client: { status: 'ACTIVE' },
    },
    select: { id: true, clientId: true, startDate: true, endDate: true },
  })

  let renewed = 0
  let failed = 0

  for (const c of contracts) {
    try {
      // Duração original em meses (contratos são múltiplos de mês).
      const months =
        (c.endDate.getFullYear() - c.startDate.getFullYear()) * 12 +
        (c.endDate.getMonth() - c.startDate.getMonth())
      const period = months > 0 ? months : 6 // fallback defensivo

      const newStart = c.endDate
      const newEnd = addMonths(c.endDate, period)

      await prisma.contract.update({
        where: { id: c.id },
        data: { startDate: newStart, endDate: newEnd, status: 'VIGENTE' },
      })

      // Mantém o cache do Client em dia.
      await prisma.client.update({
        where: { id: c.clientId },
        data: { contractStart: newStart, contractEndDate: newEnd },
      }).catch(() => {})

      await writeAuditLog({
        action: 'contract.autoRenew',
        entityType: 'Contract',
        entityId: c.id,
        clientId: c.clientId,
        metadata: { period, newStart: newStart.toISOString(), newEnd: newEnd.toISOString() },
      })

      renewed++
    } catch (err) {
      console.error(`[contract-renewal] falha ao renovar contrato ${c.id}:`, err)
      failed++
    }
  }

  return { checked: contracts.length, renewed, failed }
}
