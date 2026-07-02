/**
 * Migração ROAS → FATURAMENTO (e-commerce).
 *
 * Hoje os clientes e-commerce têm Goal(ROAS) mas a lógica de crescimento é por
 * FATURAMENTO. Este serviço, idempotente, deriva a meta de faturamento a partir
 * do ROAS vigente × investimento total do cliente e grava:
 *   - Goal(FATURAMENTO, MONTHLY) do mês corrente (upsert pela chave única).
 *   - Client.faturamentoEsperado (cache p/ ficha) e Client.roasMinimo (fallback).
 *
 * A Goal(ROAS) NÃO é apagada — continua sendo o alvo de EFICIÊNCIA. A coerência
 * é mantida: ROAS esperado = FATURAMENTO ÷ investimento = ROAS original.
 *
 * Serviço puro (sem sessão). try/catch por cliente (CLAUDE.md #7).
 */

import { prisma } from '@/lib/prisma'
import { getMonthRange } from '@/lib/utils'
import { investimentoTotal } from '@/lib/metas/projection'

export async function migrarMetasRoasParaFaturamento(): Promise<{
  migrados: number
  semRoas: string[]
  semBudget: string[]
}> {
  const now = new Date()
  const { start: monthStart, end: monthEnd } = getMonthRange(now)

  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE', businessType: 'ECOMMERCE' },
    select: {
      id: true,
      name: true,
      investimentoMeta: true,
      investimentoGoogle: true,
      investimentoTiktok: true,
    },
  })

  let migrados = 0
  const semRoas: string[] = []
  const semBudget: string[] = []

  for (const c of clients) {
    try {
      // ROAS MONTHLY vigente do mês corrente — a mais recente.
      const roasGoal = await prisma.goal.findFirst({
        where: {
          clientId: c.id,
          metric: 'ROAS',
          period: 'MONTHLY',
          startDate: { lte: monthEnd },
          endDate: { gte: monthStart },
        },
        orderBy: { startDate: 'desc' },
        select: { targetValue: true, startDate: true, endDate: true },
      })

      const roas = roasGoal ? Number(roasGoal.targetValue) : 0
      if (!(roas > 0)) { semRoas.push(c.name); continue }

      const invTotal = investimentoTotal(
        c.investimentoMeta ? Number(c.investimentoMeta) : null,
        c.investimentoGoogle ? Number(c.investimentoGoogle) : null,
        c.investimentoTiktok ? Number(c.investimentoTiktok) : null,
      )
      if (!(invTotal > 0)) { semBudget.push(c.name); continue }

      // FATURAMENTO-alvo = ROAS × investimento total (mantém ROAS esperado = ROAS).
      const faturamento = Math.round(roas * invTotal * 100) / 100

      // Alinha o período da meta de faturamento ao da Goal(ROAS) vigente.
      const start = roasGoal!.startDate
      const end = roasGoal!.endDate

      await prisma.goal.upsert({
        where: {
          clientId_metric_period_startDate: {
            clientId: c.id,
            metric: 'FATURAMENTO',
            period: 'MONTHLY',
            startDate: start,
          },
        },
        update: { targetValue: faturamento, endDate: end },
        create: {
          clientId: c.id,
          metric: 'FATURAMENTO',
          period: 'MONTHLY',
          targetValue: faturamento,
          startDate: start,
          endDate: end,
        },
      })

      await prisma.client.update({
        where: { id: c.id },
        data: { faturamentoEsperado: faturamento, roasMinimo: roas },
      })

      migrados++
    } catch (err) {
      console.error(`[migrar-metas-faturamento] falha p/ cliente ${c.id}:`, err)
    }
  }

  return { migrados, semRoas, semBudget }
}
