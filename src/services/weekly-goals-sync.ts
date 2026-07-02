/**
 * Conversão de metas MENSAIS → SEMANAIS (serviço puro, sem sessão).
 *
 * Extraído de `src/app/actions/goals.ts` para que o cron diário
 * (`/api/cron/daily`) possa chamar a lógica diretamente. A server action em
 * goals.ts continua sendo o ponto de entrada com guard (auth + papel ADMIN);
 * aqui NÃO há `requireSession` — este código roda no contexto do cron
 * (S0-001: `requireSession` fazia `redirect('/login')` e a sincronização de
 * segunda-feira nunca acontecia).
 *
 * try/catch por cliente (CLAUDE.md #7). Nunca lança pelo lote inteiro.
 */

import { prisma } from '@/lib/prisma'
import { MetricType } from '@prisma/client'
import { getWeekRange, getMonthRange } from '@/lib/utils'

// Métricas onde a meta é a mesma independente do período (taxas, médias, razões).
// CPC e FREQUENCY são razões/médias — NÃO se dividem por 4,33 (S1-009).
// Fonte única de classificação taxa×volume para a conversão semanal.
export const RATE_METRICS = new Set<MetricType>([
  'ROAS', 'CTR', 'TAXA_CONVERSAO', 'TICKET_MEDIO', 'CPS', 'CPL', 'CPA', 'CAC', 'CPM',
  'CPC', 'FREQUENCY',
])
const WEEKS_PER_MONTH = 4.33

/** Calcula o valor semanal equivalente a uma meta mensal. */
export function weeklyTarget(metric: MetricType, monthlyValue: number): number {
  return RATE_METRICS.has(metric)
    ? monthlyValue
    : Math.round((monthlyValue / WEEKS_PER_MONTH) * 100) / 100
}

/**
 * Cria ou atualiza a meta SEMANAL da semana atual para um único cliente/métrica.
 * Chamado toda vez que uma meta mensal é salva. Valor <= 0 = "sem meta": não grava.
 */
export async function upsertWeeklyGoalForMonth(
  clientId: string,
  metric: MetricType,
  monthlyValue: number,
): Promise<void> {
  if (!(monthlyValue > 0)) return // 0/negativo/NaN = sem meta (S1-012)

  const { start: weekStart, end: weekEnd } = getWeekRange()
  const weekly = weeklyTarget(metric, monthlyValue)

  await prisma.goal.upsert({
    where: {
      clientId_metric_period_startDate: {
        clientId,
        metric,
        period: 'WEEKLY',
        startDate: weekStart,
      },
    },
    update: { targetValue: weekly, endDate: weekEnd },
    create: {
      clientId,
      metric,
      period:      'WEEKLY',
      targetValue: weekly,
      startDate:   weekStart,
      endDate:     weekEnd,
    },
  })
}

/**
 * Sincronização em massa: para cada cliente ativo com meta MENSAL no mês atual,
 * cria/atualiza a meta SEMANAL equivalente para a semana corrente.
 *
 * Serviço puro (sem sessão). Usa UPSERT por (clientId, metric, period,
 * startDate) para que a edição da mensal propague o novo targetValue à semanal
 * (S1-010). try/catch por cliente: falha em um não derruba o lote (CLAUDE.md #7).
 */
export async function syncWeeklyGoalsFromMonthly(): Promise<{
  created: number
  updated: number
  skipped: number
  total: number
}> {
  const now = new Date()
  const { start: weekStart, end: weekEnd } = getWeekRange()
  const { start: monthStart, end: monthEnd } = getMonthRange(now)

  const monthlyGoals = await prisma.goal.findMany({
    where: {
      period:    'MONTHLY',
      startDate: { lte: monthEnd },
      endDate:   { gte: monthStart },
      client:    { status: 'ACTIVE' },
    },
    select: { clientId: true, metric: true, targetValue: true },
  })

  let created = 0
  let updated = 0
  let skipped = 0

  for (const g of monthlyGoals) {
    const monthly = Number(g.targetValue)
    if (!(monthly > 0)) { skipped++; continue } // 0/negativo = sem meta (S1-012)

    try {
      const weekly = weeklyTarget(g.metric, monthly)
      const existing = await prisma.goal.findUnique({
        where: {
          clientId_metric_period_startDate: {
            clientId:  g.clientId,
            metric:    g.metric,
            period:    'WEEKLY',
            startDate: weekStart,
          },
        },
        select: { id: true },
      })

      await prisma.goal.upsert({
        where: {
          clientId_metric_period_startDate: {
            clientId:  g.clientId,
            metric:    g.metric,
            period:    'WEEKLY',
            startDate: weekStart,
          },
        },
        update: { targetValue: weekly, endDate: weekEnd },
        create: {
          clientId:    g.clientId,
          metric:      g.metric,
          period:      'WEEKLY',
          targetValue: weekly,
          startDate:   weekStart,
          endDate:     weekEnd,
        },
      })

      if (existing) updated++
      else created++
    } catch (err) {
      skipped++
      console.error(`[weekly-goals-sync] falha ao sincronizar cliente ${g.clientId}/${g.metric}:`, err)
    }
  }

  return { created, updated, skipped, total: monthlyGoals.length }
}
