/**
 * Alert Dispatcher
 *
 * Compara o HealthScore atual de um cliente com o status anterior
 * e cria Alert no banco quando há degradação ou melhora.
 *
 * Dispara alerta quando:
 *   OTIMO  → REGULAR  : STATUS_DROPPED_TO_REGULAR
 *   OTIMO  → RUIM     : STATUS_DROPPED_TO_RUIM
 *   REGULAR → RUIM    : STATUS_DROPPED_TO_RUIM
 *   RUIM   → OTIMO    : STATUS_IMPROVED_TO_OTIMO
 *   REGULAR → OTIMO   : STATUS_IMPROVED_TO_OTIMO
 */

import { prisma } from '@/lib/prisma'
import { HealthStatus, MetricType, AlertType } from '@prisma/client'
import { metricLabels } from '@/lib/dal'
import { getWeekRange } from '@/lib/utils'
import { sendEmail } from '@/lib/email'
import { alertDroppedEmail, alertImprovedEmail } from '@/lib/email-templates'
import type { ScoredMetric } from './health-scorer'

const STATUS_RANK: Record<HealthStatus, number> = {
  OTIMO: 2,
  REGULAR: 1,
  RUIM: 0,
}

function describeAlert(
  metric: MetricType,
  prevStatus: HealthStatus,
  newStatus: HealthStatus,
  actual: number,
  target: number,
  pct: number
): { type: AlertType; title: string; body: string } | null {
  const label = metricLabels[metric] ?? metric
  const prevRank = STATUS_RANK[prevStatus]
  const newRank = STATUS_RANK[newStatus]

  if (newRank < prevRank) {
    // Degradation
    const type: AlertType =
      newStatus === 'RUIM' ? 'STATUS_DROPPED_TO_RUIM' : 'STATUS_DROPPED_TO_REGULAR'
    return {
      type,
      title: `${label} caiu para ${newStatus === 'RUIM' ? 'Ruim' : 'Regular'}`,
      body: `${label} está em ${Math.round(pct)}% da meta (${actual.toFixed(2)} / ${target.toFixed(2)}).`,
    }
  }

  if (newRank > prevRank && newStatus === 'OTIMO') {
    return {
      type: 'STATUS_IMPROVED_TO_OTIMO',
      title: `${label} atingiu Ótimo!`,
      body: `${label} chegou a ${actual.toFixed(2)} — ${Math.round(pct)}% da meta. Parabéns!`,
    }
  }

  return null // no alert needed
}

export async function dispatchAlertsForClient(
  clientId: string,
  newScores: ScoredMetric[]
): Promise<number> {
  if (newScores.length === 0) return 0

  // Get the previous week's scores for comparison
  const { start: thisWeekStart } = getWeekRange()
  const prevWeekStart = new Date(thisWeekStart)
  prevWeekStart.setDate(prevWeekStart.getDate() - 7)
  const prevWeekEnd = new Date(thisWeekStart)
  prevWeekEnd.setDate(prevWeekEnd.getDate() - 1)

  const previousScores = await prisma.healthScore.findMany({
    where: {
      clientId,
      periodStart: { gte: prevWeekStart, lte: prevWeekEnd },
    },
    select: { metric: true, status: true },
  })

  const prevByMetric = new Map(previousScores.map((s) => [s.metric, s.status]))

  // Also get current goals to get target values
  const goals = await prisma.goal.findMany({
    where: { clientId, period: 'WEEKLY' },
    include: {
      healthScores: {
        where: { periodStart: { gte: thisWeekStart } },
        orderBy: { calculatedAt: 'desc' },
        take: 1,
      },
    },
  })

  const goalByMetric = new Map(goals.map((g) => [g.metric, g]))

  let alertsCreated = 0

  for (const score of newScores) {
    const prevStatus = prevByMetric.get(score.metric)
    if (!prevStatus) continue // first week, nothing to compare

    if (prevStatus === score.status) continue // no change

    const goal = goalByMetric.get(score.metric)
    const hs = goal?.healthScores[0]
    if (!hs) continue

    const alert = describeAlert(
      score.metric,
      prevStatus,
      score.status,
      Number(hs.actualValue),
      Number(hs.targetValue),
      Number(score.achievementPct)
    )

    if (!alert) continue

    // Avoid duplicate alerts for the same client + type within 24h
    const recent = await prisma.alert.findFirst({
      where: {
        clientId,
        type: alert.type,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    })
    if (recent) continue

    await prisma.alert.create({
      data: { clientId, ...alert },
    })
    alertsCreated++

    // Send email to assigned managers for degradation alerts
    if (alert.type === 'STATUS_DROPPED_TO_RUIM' || alert.type === 'STATUS_DROPPED_TO_REGULAR' || alert.type === 'STATUS_IMPROVED_TO_OTIMO') {
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: {
          name: true,
          slug: true,
          assignments: {
            include: { user: { select: { email: true } } },
          },
        },
      })

      if (client) {
        const emails = client.assignments.map((a) => a.user.email).filter(Boolean)
        if (emails.length > 0) {
          const actual = Number(hs.actualValue)
          const target = Number(hs.targetValue)
          const pct = Math.round(Number(score.achievementPct))
          const label = metricLabels[score.metric] ?? score.metric
          const fmtVal = (v: number) =>
            score.metric === 'ROAS' ? `${v.toFixed(2)}x`
            : ['CPL', 'CPA', 'CPC', 'INVESTMENT', 'SPEND'].includes(score.metric) ? `R$ ${v.toFixed(2)}`
            : score.metric === 'CTR' ? `${v.toFixed(2)}%`
            : v.toLocaleString('pt-BR')

          if (alert.type === 'STATUS_IMPROVED_TO_OTIMO') {
            const html = alertImprovedEmail({
              clientName: client.name,
              clientSlug: client.slug,
              metricLabel: label,
              actualValue: fmtVal(actual),
              achievementPct: pct,
            })
            await sendEmail({ to: emails, subject: `✅ ${client.name} — ${label} atingiu Ótimo!`, html })
          } else {
            const html = alertDroppedEmail({
              clientName: client.name,
              clientSlug: client.slug,
              metricLabel: label,
              newStatus: score.status as 'RUIM' | 'REGULAR',
              actualValue: fmtVal(actual),
              targetValue: fmtVal(target),
              achievementPct: pct,
            })
            const statusLabel = score.status === 'RUIM' ? '🔴 Ruim' : '🟡 Regular'
            await sendEmail({ to: emails, subject: `${statusLabel} — ${client.name}: ${label} caiu`, html })
          }
        }
      }
    }
  }

  return alertsCreated
}

export async function dispatchAlertsForAll(
  results: { clientId: string; scores: ScoredMetric[] }[]
): Promise<number> {
  let total = 0
  for (const r of results) {
    total += await dispatchAlertsForClient(r.clientId, r.scores)
  }
  return total
}
