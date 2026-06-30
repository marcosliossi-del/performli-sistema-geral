/**
 * War Room Monitor (WAR-16 / acompanhamento pós-War Room)
 *
 * Roda no cron diário. Para cada War Room ativa:
 *  1. Critério de saída: compara o valor real mais recente (HealthScore WEEKLY) da
 *     métrica do critério contra o alvo. Atingido → marca exitMetAt + alerta de
 *     "avaliar encerramento". Regressão (deixou de cumprir) → limpa exitMetAt + alerta.
 *     NUNCA encerra sozinho — encerrar é ação humana (closeWarRoom).
 *  2. Revisão semanal: War Room sem revisão há > 7 dias → alerta.
 *
 * try/catch POR protocolo. Dedup de alerta por tipo + cliente (janela de 6 dias).
 */

import { prisma } from '@/lib/prisma'
import { AlertType, MetricType } from '@prisma/client'

const REVIEW_INTERVAL_DAYS = 7
const ALERT_DEDUP_DAYS = 6

// Métricas em que MENOR é melhor (critério atingido quando valor <= alvo).
const LOWER_IS_BETTER: ReadonlySet<MetricType> = new Set<MetricType>([
  'CPL', 'CPA', 'CAC', 'CPC', 'SPEND', 'CPS', 'CPM',
])

async function hasRecentAlert(clientId: string, type: AlertType): Promise<boolean> {
  const recent = await prisma.alert.findFirst({
    where: {
      clientId,
      type,
      createdAt: { gte: new Date(Date.now() - ALERT_DEDUP_DAYS * 86_400_000) },
    },
    select: { id: true },
  })
  return !!recent
}

export async function monitorWarRooms(): Promise<{
  checked: number
  reviewAlerts: number
  exitMetAlerts: number
  regressionAlerts: number
}> {
  const protocols = await prisma.criticalProtocol.findMany({
    where: { status: { not: 'ENCERRADO' } },
    select: {
      id: true,
      clientId: true,
      activatedAt: true,
      lastReviewedAt: true,
      exitMetric: true,
      exitTarget: true,
      exitMetAt: true,
      client: { select: { name: true } },
    },
  })

  let reviewAlerts = 0
  let exitMetAlerts = 0
  let regressionAlerts = 0
  const now = Date.now()
  const reviewCutoff = now - REVIEW_INTERVAL_DAYS * 86_400_000

  for (const p of protocols) {
    try {
      // ── 1. Revisão semanal em atraso ──────────────────────────────────────
      const lastReview = p.lastReviewedAt ? new Date(p.lastReviewedAt).getTime() : null
      const reference = lastReview ?? new Date(p.activatedAt).getTime()
      if (reference <= reviewCutoff) {
        if (!(await hasRecentAlert(p.clientId, AlertType.WARROOM_NO_REVIEW))) {
          const days = Math.floor((now - reference) / 86_400_000)
          await prisma.alert.create({
            data: {
              clientId: p.clientId,
              type: AlertType.WARROOM_NO_REVIEW,
              title: `War Room sem revisão há ${days} dias: ${p.client.name}`,
              body: `A War Room de ${p.client.name} não é revisada há ${days} dias. Registre a revisão semanal (critério atingido ou não) para manter o acompanhamento.`,
            },
          })
          reviewAlerts++
        }
      }

      // ── 2. Monitoramento do critério de saída ─────────────────────────────
      if (p.exitMetric && p.exitTarget != null) {
        const latest = await prisma.healthScore.findFirst({
          where: { clientId: p.clientId, metric: p.exitMetric, period: 'WEEKLY' },
          orderBy: { periodStart: 'desc' },
          select: { actualValue: true, periodStart: true },
        })

        if (latest) {
          const actual = Number(latest.actualValue)
          const target = Number(p.exitTarget)
          const met = LOWER_IS_BETTER.has(p.exitMetric)
            ? actual <= target
            : actual >= target

          if (met && p.exitMetAt == null) {
            await prisma.criticalProtocol.update({
              where: { id: p.id },
              data: { exitMetAt: new Date() },
            })
            if (!(await hasRecentAlert(p.clientId, AlertType.WARROOM_EXIT_CRITERIA_MET))) {
              await prisma.alert.create({
                data: {
                  clientId: p.clientId,
                  type: AlertType.WARROOM_EXIT_CRITERIA_MET,
                  title: `Critério de saída atingido: ${p.client.name}`,
                  body: `${p.exitMetric} chegou a ${actual} (alvo ${target}). Avalie encerrar a War Room de ${p.client.name}.`,
                },
              })
              exitMetAlerts++
            }
          } else if (!met && p.exitMetAt != null) {
            await prisma.criticalProtocol.update({
              where: { id: p.id },
              data: { exitMetAt: null },
            })
            if (!(await hasRecentAlert(p.clientId, AlertType.WARROOM_REGRESSION))) {
              await prisma.alert.create({
                data: {
                  clientId: p.clientId,
                  type: AlertType.WARROOM_REGRESSION,
                  title: `Critério de saída em regressão: ${p.client.name}`,
                  body: `${p.exitMetric} voltou a ${actual} (alvo ${target}). A War Room de ${p.client.name} deixou de cumprir o critério.`,
                },
              })
              regressionAlerts++
            }
          }
        }
      }
    } catch (err) {
      console.error(`[warroom-monitor] falha no protocolo ${p.id}:`, err)
    }
  }

  return {
    checked: protocols.length,
    reviewAlerts,
    exitMetAlerts,
    regressionAlerts,
  }
}
