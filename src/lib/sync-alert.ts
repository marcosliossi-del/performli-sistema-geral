/**
 * createSyncFailedAlert
 *
 * Creates a SYNC_FAILED alert, but only if one hasn't already been created
 * for the same client in the last 24 hours. This prevents alert spam when
 * the same broken account is synced repeatedly (e.g. by the recalculate button
 * or by the daily cron).
 */

import { prisma } from '@/lib/prisma'

export async function createSyncFailedAlert(
  clientId: string,
  title: string,
  body: string,
): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const existing = await prisma.alert.findFirst({
    where: {
      clientId,
      type: 'SYNC_FAILED',
      createdAt: { gte: since },
    },
    select: { id: true },
  })

  if (existing) return  // already alerted within 24h — skip

  await prisma.alert.create({
    data: { clientId, type: 'SYNC_FAILED', title, body },
  })
}
