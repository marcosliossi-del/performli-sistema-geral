/**
 * Check-in Monitor (OPE-06)
 *
 * Roda no cron diário. Dois alertas:
 *  1. CHECKIN_MISSING — cliente ativo sem check-in preenchido na semana.
 *     Só dispara de quarta em diante (prazo de preenchimento), dedup ~semanal.
 *  2. CHECKIN_REJECTED_STALE — check-in reprovado há > 2 dias sem nova submissão.
 *
 * try/catch POR cliente. Dedup por cliente + tipo.
 */

import { prisma } from '@/lib/prisma'
import { getWeekRange } from '@/lib/utils'

const MISSING_DEDUP_DAYS = 5
const STALE_DEDUP_DAYS = 3
const REJECTED_GRACE_DAYS = 2

async function hasRecentAlert(
  clientId: string,
  type: 'CHECKIN_MISSING' | 'CHECKIN_REJECTED_STALE',
  days: number,
): Promise<boolean> {
  const found = await prisma.alert.findFirst({
    where: { clientId, type, createdAt: { gte: new Date(Date.now() - days * 86_400_000) } },
    select: { id: true },
  })
  return !!found
}

export async function checkCheckins(): Promise<{
  missingAlerts: number
  staleRejectedAlerts: number
}> {
  const { start: weekStart } = getWeekRange()
  const dayOfWeek = new Date().getDay() // 0=Dom ... 3=Qua
  const now = Date.now()

  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      weeklyCheckins: {
        where: { weekStart },
        take: 1,
        select: { status: true, reviewedAt: true },
      },
    },
  })

  let missingAlerts = 0
  let staleRejectedAlerts = 0

  for (const c of clients) {
    try {
      const checkin = c.weeklyCheckins[0]
      const submitted = checkin && checkin.status !== 'PENDENTE'

      // 1. Sem check-in (de quarta em diante)
      if (!submitted && dayOfWeek >= 3) {
        if (!(await hasRecentAlert(c.id, 'CHECKIN_MISSING', MISSING_DEDUP_DAYS))) {
          await prisma.alert.create({
            data: {
              clientId: c.id,
              type: 'CHECKIN_MISSING',
              title: `Cliente sem check-in esta semana: ${c.name}`,
              body: `O check-in semanal de ${c.name} ainda não foi preenchido. Sem ele não há prestação de contas nem visibilidade de resultado.`,
            },
          })
          missingAlerts++
        }
      }

      // 2. Reprovado sem correção há > 2 dias
      if (checkin?.status === 'REPROVADO' && checkin.reviewedAt) {
        const daysSinceReview = Math.floor((now - new Date(checkin.reviewedAt).getTime()) / 86_400_000)
        if (daysSinceReview >= REJECTED_GRACE_DAYS) {
          if (!(await hasRecentAlert(c.id, 'CHECKIN_REJECTED_STALE', STALE_DEDUP_DAYS))) {
            await prisma.alert.create({
              data: {
                clientId: c.id,
                type: 'CHECKIN_REJECTED_STALE',
                title: `Check-in reprovado sem correção: ${c.name}`,
                body: `O check-in de ${c.name} foi reprovado há ${daysSinceReview} dias e ainda não foi corrigido pelo gestor.`,
              },
            })
            staleRejectedAlerts++
          }
        }
      }
    } catch (err) {
      console.error(`[checkin-monitor] falha no cliente ${c.id}:`, err)
    }
  }

  return { missingAlerts, staleRejectedAlerts }
}
