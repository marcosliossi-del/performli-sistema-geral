/**
 * Churn Risk Scorer
 *
 * Calcula um score de risco de churn (0–100) para cada cliente ativo,
 * salva no banco semanalmente e retorna o histórico de evolução.
 *
 * Fatores de pontuação:
 *   - Semanas consecutivas em RUIM          (peso 40%)
 *   - Achievement médio da semana atual     (peso 30%)
 *   - Tendência vs. semana anterior         (peso 20%)
 *   - Ausência de dados (sem sync recente)  (peso 10%)
 */

import { prisma } from '@/lib/prisma'
import { getWeekRange } from '@/lib/utils'

export type ChurnRiskFactor = {
  consecutiveRuimWeeks: number
  avgAchievementPct: number
  trend: number        // positive = improving, negative = worsening
  noData: boolean
}

/**
 * Score 0–100 onde 100 = risco máximo de churn.
 */
function computeScore(factors: ChurnRiskFactor): number {
  let score = 0

  // Fator 1: semanas consecutivas em RUIM (max 40 pts)
  const ruimScore = Math.min(factors.consecutiveRuimWeeks * 12, 40)
  score += ruimScore

  // Fator 2: achievement médio (max 30 pts)
  // achievement 0% → 30 pts, 100% → 0 pts, ≥100% → 0 pts
  // S2-020: quando não há dados, este fator NÃO pontua. A penalidade por
  // ausência de dados é contada UMA única vez, no Fator 4 (dedicado). Antes,
  // somava-se +10 aqui E +10 no Fator 4 (= +20), inflando o churn de clientes
  // novos ou com sync quebrado.
  if (!factors.noData) {
    const achievScore = Math.max(0, 30 - Math.round((factors.avgAchievementPct / 100) * 30))
    score += achievScore
  }

  // Fator 3: tendência (max 20 pts)
  // trend muito negativo = alto risco; trend positivo = baixa adição
  if (factors.trend < -20) score += 20
  else if (factors.trend < -10) score += 14
  else if (factors.trend < 0) score += 8
  else if (factors.trend > 10) score -= 5 // pequena bonificação por melhora

  // Fator 4: sem dados (10 pts de base)
  if (factors.noData) score += 10

  return Math.min(100, Math.max(0, score))
}

export async function scoreClientChurnRisk(clientId: string): Promise<{
  score: number
  factors: ChurnRiskFactor
}> {
  const { start: weekStart } = getWeekRange()
  const prevWeekStart = new Date(weekStart)
  prevWeekStart.setDate(prevWeekStart.getDate() - 7)

  // Últimas 8 semanas de health scores
  const eightWeeksAgo = new Date(weekStart)
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56)

  // S2-021: filtra period WEEKLY. O scorer é 100% baseado em SEMANAS
  // (thisWeek/prevWeek/semanas consecutivas em RUIM). Sem este filtro, um
  // HealthScore MONTHLY (periodStart no dia 1º) entrava na janela semanal e era
  // contado como uma "semana" extra — distorcendo média, tendência e a contagem
  // de semanas consecutivas em RUIM.
  const scores = await prisma.healthScore.findMany({
    where: { clientId, period: 'WEEKLY', periodStart: { gte: eightWeeksAgo } },
    orderBy: { periodStart: 'desc' },
  })

  const thisWeekScores = scores.filter((s) => s.periodStart >= weekStart)
  const prevWeekScores = scores.filter(
    (s) => s.periodStart >= prevWeekStart && s.periodStart < weekStart
  )

  const noData = thisWeekScores.length === 0

  // Achievement médio esta semana
  const avgAchievementPct =
    thisWeekScores.length > 0
      ? thisWeekScores.reduce((sum, s) => sum + Number(s.achievementPct), 0) /
        thisWeekScores.length
      : 0

  // Achievement médio semana anterior
  const prevAvg =
    prevWeekScores.length > 0
      ? prevWeekScores.reduce((sum, s) => sum + Number(s.achievementPct), 0) /
        prevWeekScores.length
      : 0

  const trend = noData ? 0 : avgAchievementPct - prevAvg

  // Semanas consecutivas em RUIM (olha semanas completas, da mais recente para atrás)
  const weekGroups = new Map<string, typeof scores>()
  for (const s of scores) {
    const key = s.periodStart.toISOString().split('T')[0]
    if (!weekGroups.has(key)) weekGroups.set(key, [])
    weekGroups.get(key)!.push(s)
  }

  const sortedWeeks = [...weekGroups.entries()].sort(
    ([a], [b]) => new Date(b).getTime() - new Date(a).getTime()
  )

  let consecutiveRuimWeeks = 0
  for (const [, weekScores] of sortedWeeks) {
    const hasRuim = weekScores.some((s) => s.status === 'RUIM')
    if (hasRuim) {
      consecutiveRuimWeeks++
    } else {
      break
    }
  }

  const factors: ChurnRiskFactor = {
    consecutiveRuimWeeks,
    avgAchievementPct: Math.round(avgAchievementPct),
    trend: Math.round(trend),
    noData,
  }

  const score = computeScore(factors)

  // Persiste no banco
  await prisma.churnRiskScore.upsert({
    where: { clientId_weekStart: { clientId, weekStart } },
    create: { clientId, weekStart, score, factors: factors as object },
    update: { score, factors: factors as object },
  })

  return { score, factors }
}

export async function scoreAllClientsChurnRisk(): Promise<{
  clientsProcessed: number
  avgScore: number
  failed: number
}> {
  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  })

  let totalScore = 0
  let scored = 0
  let failed = 0
  // Resiliência (CLAUDE.md regra 7): isola cada cliente; falha de um não derruba a rotina.
  for (const client of clients) {
    try {
      const { score } = await scoreClientChurnRisk(client.id)
      totalScore += score
      scored++
    } catch (err) {
      failed++
      console.error(`[churn-scorer] falha ao pontuar cliente ${client.id}:`, err)
    }
  }

  return {
    clientsProcessed: clients.length,
    avgScore: scored > 0 ? Math.round(totalScore / scored) : 0,
    failed,
  }
}
