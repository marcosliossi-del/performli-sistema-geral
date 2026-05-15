import { prisma } from '@/lib/prisma'

/**
 * Runs daily. Finds VIGENTE contracts expiring within 30 days and creates
 * a CONTRACT_EXPIRING_SOON alert if one doesn't already exist this month.
 */
export async function checkContractExpiry(): Promise<{ alertsFired: number }> {
  const today   = new Date()
  today.setHours(0, 0, 0, 0)

  const in30    = new Date(today.getTime() + 30 * 86_400_000)

  // Contracts expiring within the next 30 days that are still VIGENTE
  const expiring = await prisma.contract.findMany({
    where: {
      status:  'VIGENTE',
      endDate: { gte: today, lte: in30 },
    },
    select: { id: true, clientId: true, endDate: true },
  })

  let alertsFired = 0
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  for (const contract of expiring) {
    // Skip if an alert for this contract was already created this month
    const existing = await prisma.alert.findFirst({
      where: {
        clientId:  contract.clientId,
        type:      'CONTRACT_EXPIRING_SOON',
        createdAt: { gte: monthStart },
      },
      select: { id: true },
    })
    if (existing) continue

    const daysLeft = Math.ceil((contract.endDate.getTime() - today.getTime()) / 86_400_000)

    await prisma.alert.create({
      data: {
        clientId: contract.clientId,
        type:     'CONTRACT_EXPIRING_SOON',
        title:    'Contrato vence em breve',
        body:     `O contrato vence em ${daysLeft} dia${daysLeft !== 1 ? 's' : ''}. Verifique a renovação.`,
        read:     false,
      },
    })

    alertsFired++
  }

  return { alertsFired }
}
