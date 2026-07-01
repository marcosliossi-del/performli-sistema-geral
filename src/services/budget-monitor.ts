/**
 * Budget Monitor
 *
 * Verifica mensalmente se algum cliente consumiu ≥90% do budget planejado
 * (meta SPEND/INVESTMENT com period=MONTHLY) e dispara alertas BUDGET_WARNING.
 */

import { prisma } from '@/lib/prisma'
import { getMonthRange } from '@/lib/utils'
import { writeAuditLog } from '@/lib/audit'

export async function checkBudgetWarnings(): Promise<{
  clientsChecked: number
  warningsFired: number
}> {
  const today = new Date()
  const { start: monthStart, end: monthEnd } = getMonthRange(today)

  // Clientes ativos com meta de SPEND/INVESTMENT mensal
  const goals = await prisma.goal.findMany({
    where: {
      period: 'MONTHLY',
      metric: { in: ['SPEND', 'INVESTMENT'] },
      startDate: { lte: monthEnd },
      endDate: { gte: monthStart },
      client: { status: 'ACTIVE' },
    },
    include: {
      client: {
        select: { id: true, name: true },
      },
    },
  })

  let warningsFired = 0

  for (const goal of goals) {
    const target = Number(goal.targetValue)
    if (target <= 0) continue

    // Spend real do mês
    const snapshots = await prisma.metricSnapshot.findMany({
      where: {
        clientId: goal.clientId,
        date: { gte: monthStart, lte: today },
      },
      select: { spend: true },
    })

    const actualSpend = snapshots.reduce(
      (sum, s) => sum + Number(s.spend ?? 0),
      0
    )

    const consumedPct = (actualSpend / target) * 100

    // Dispara BUDGET_WARNING se ≥90% e ainda não foi disparado esta semana
    if (consumedPct >= 90) {
      // Verifica se já existe alerta BUDGET_WARNING nos últimos 7 dias
      const weekAgo = new Date(today)
      weekAgo.setDate(weekAgo.getDate() - 7)

      const existingAlert = await prisma.alert.findFirst({
        where: {
          clientId: goal.clientId,
          type: 'BUDGET_WARNING',
          createdAt: { gte: weekAgo },
        },
      })

      if (!existingAlert) {
        const pct = Math.round(consumedPct)
        const budgetLabel = target.toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        })
        const spendLabel = actualSpend.toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        })

        await prisma.alert.create({
          data: {
            clientId: goal.clientId,
            type: 'BUDGET_WARNING',
            title: `⚠️ Budget quase esgotado — ${goal.client.name}`,
            body: `${pct}% do budget mensal consumido (${spendLabel} de ${budgetLabel}). Avalie pausar ou redistribuir verba.`,
          },
        })

        await writeAuditLog({
          actorRole: 'SYSTEM',
          action: 'budget.warning',
          entityType: 'Client',
          entityId: goal.clientId,
          clientId: goal.clientId,
          metadata: { pct, spend: spendLabel, budget: budgetLabel },
        })

        warningsFired++
      }
    }
  }

  return { clientsChecked: goals.length, warningsFired }
}
