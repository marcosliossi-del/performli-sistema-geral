/**
 * Anti-Churn Monitor (CSX-13)
 *
 * Roda no cron diário. Alerta clientes em ALTO risco de churn que estão
 * "silenciosos" (sem interação registrada há ≥ 14 dias) — o sistema cobra ação
 * proativa antes de virar conta crítica.
 *
 * try/catch POR cliente. Dedup por cliente (6 dias).
 */

import { prisma } from '@/lib/prisma'

const SILENT_DAYS = 14
const HIGH_RISK = 60
const DEDUP_DAYS = 6

export async function detectSilentAtRiskClients(): Promise<{
  checked: number
  alerts: number
}> {
  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      churnRiskScores: { orderBy: { weekStart: 'desc' }, take: 1, select: { score: true } },
      interactions: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
    },
  })

  const now = Date.now()
  let alerts = 0

  for (const c of clients) {
    try {
      const score = c.churnRiskScores[0]?.score ?? 0
      if (score < HIGH_RISK) continue

      const last = c.interactions[0]?.createdAt
      const daysSince = last ? Math.floor((now - new Date(last).getTime()) / 86_400_000) : null
      const isSilent = daysSince == null || daysSince >= SILENT_DAYS
      if (!isSilent) continue

      const recent = await prisma.alert.findFirst({
        where: {
          clientId: c.id,
          type: 'ANTICHURN_ACTION_NEEDED',
          createdAt: { gte: new Date(now - DEDUP_DAYS * 86_400_000) },
        },
        select: { id: true },
      })
      if (recent) continue

      const silentLabel = daysSince == null ? 'sem nenhuma interação registrada' : `sem contato há ${daysSince} dias`
      await prisma.alert.create({
        data: {
          clientId: c.id,
          type: 'ANTICHURN_ACTION_NEEDED',
          title: `Cliente em risco e silencioso: ${c.name}`,
          body: `Risco de churn ${score}/100 e ${silentLabel}. Faça uma ação proativa antes que vire conta crítica.`,
        },
      })
      alerts++
    } catch (err) {
      console.error(`[antichurn-monitor] falha no cliente ${c.id}:`, err)
    }
  }

  return { checked: clients.length, alerts }
}
