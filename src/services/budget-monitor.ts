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

  // Precedência do teto de verba: Goal(SPEND/INVESTMENT) > Client.investimento*
  // (ficha — item 7). Para clientes ativos SEM goal de verba, usa a soma dos
  // investimentos planejados na ficha (Meta+Google+Tiktok) como teto de fallback.
  const clientsWithGoal = new Set(goals.map((g) => g.clientId))
  const fallbackClients = await prisma.client.findMany({
    where: { status: 'ACTIVE', id: { notIn: Array.from(clientsWithGoal) } },
    select: {
      id: true,
      name: true,
      investimentoMeta: true,
      investimentoGoogle: true,
      investimentoTiktok: true,
    },
  })

  // Alvos normalizados: {clientId, name, target, source}
  const targets: { clientId: string; name: string; target: number }[] = [
    ...goals.map((g) => ({ clientId: g.clientId, name: g.client.name, target: Number(g.targetValue) })),
    ...fallbackClients.map((c) => ({
      clientId: c.id,
      name: c.name,
      target:
        Number(c.investimentoMeta ?? 0) +
        Number(c.investimentoGoogle ?? 0) +
        Number(c.investimentoTiktok ?? 0),
    })),
  ]

  let warningsFired = 0

  for (const entry of targets) {
    const target = entry.target
    if (target <= 0) continue

    // Spend real do mês
    const snapshots = await prisma.metricSnapshot.findMany({
      where: {
        clientId: entry.clientId,
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
          clientId: entry.clientId,
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
            clientId: entry.clientId,
            type: 'BUDGET_WARNING',
            title: `⚠️ Budget quase esgotado — ${entry.name}`,
            body: `${pct}% do budget mensal consumido (${spendLabel} de ${budgetLabel}). Avalie pausar ou redistribuir verba.`,
          },
        })

        await writeAuditLog({
          actorRole: 'SYSTEM',
          action: 'budget.warning',
          entityType: 'Client',
          entityId: entry.clientId,
          clientId: entry.clientId,
          metadata: { pct, spend: spendLabel, budget: budgetLabel },
        })

        warningsFired++
      }
    }
  }

  return { clientsChecked: targets.length, warningsFired }
}
