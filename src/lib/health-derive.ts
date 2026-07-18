import 'server-only'
import type { HealthStatus, GoalPeriod, MetricType, ClientResultado } from '@prisma/client'
import { prisma } from './prisma'
import { getWeekRange, getMonthRange } from './utils'
import { BUDGET_CONSUMPTION_METRICS } from '@/services/health-scorer'
import { getRealizadoBatch } from './metas/realizado'
import { spDayInfo, projectMonth, proRataExpected } from './metas/pace'

/**
 * Janela de saúde unificada — fonte única de verdade da régua A (health).
 *
 * Regra canônica (mesma de getDashboardData): prefere os HealthScore da SEMANA
 * corrente (period=WEEKLY, periodStart >= weekStart); se não houver nenhum,
 * cai para os do MÊS corrente (period=MONTHLY, periodStart >= monthStart).
 * Sobre a janela escolhida aplica pior-vence (RUIM > REGULAR > OTIMO).
 *
 * Retorna null quando não há score na janela canônica → "sem dados de saúde"
 * (o call-site distingue "aguardando dados" de "sem meta" via hasActiveGoal).
 *
 * IMPORTANTE: todos os call-sites (grid, tabela operacional, gestores, agência,
 * Client 360) devem usar ESTE helper para que o mesmo cliente nunca apareça
 * Saudável numa tela e Crítico noutra.
 */

export type HealthScoreLike = {
  status: HealthStatus
  period: GoalPeriod
  periodStart: Date
}

/** Seleciona a janela canônica: WEEKLY da semana corrente, senão MONTHLY do mês. */
export function selectCanonicalScores<T extends HealthScoreLike>(
  scores: T[],
  weekStart: Date,
  monthStart: Date,
): T[] {
  const weekly = scores.filter((s) => s.period === 'WEEKLY' && s.periodStart >= weekStart)
  if (weekly.length > 0) return weekly
  return scores.filter((s) => s.period === 'MONTHLY' && s.periodStart >= monthStart)
}

/** Pior-vence sobre um conjunto já filtrado. null quando vazio. */
export function worstStatus(scores: { status: HealthStatus }[]): HealthStatus | null {
  if (scores.length === 0) return null
  if (scores.some((s) => s.status === 'RUIM')) return 'RUIM'
  if (scores.some((s) => s.status === 'REGULAR')) return 'REGULAR'
  return 'OTIMO'
}

/**
 * Status geral de saúde de um cliente sobre a janela canônica.
 * Combina selectCanonicalScores + worstStatus.
 */
export function deriveOverallStatus(
  scores: HealthScoreLike[],
  weekStart: Date,
  monthStart: Date,
): HealthStatus | null {
  return worstStatus(selectCanonicalScores(scores, weekStart, monthStart))
}

// ─── A-121 · Atingimento geral SEM métricas de consumo de budget ───────────────

export type AchievementScoreLike = {
  metric: MetricType
  achievementPct: number | { toString(): string } // Prisma.Decimal | number
}

/**
 * A-121 — Média de "atingimento geral" EXCLUINDO métricas de consumo de
 * orçamento (SPEND/INVESTMENT). Bug de origem: um cliente com ROAS 31% +
 * FATURAMENTO 4% + SPEND 694% exibia "243% atingimento geral" com selo Crítico,
 * porque o 694% de estouro de budget puxava a média p/ cima. SPEND continua
 * existindo como meta individual (barra própria, semântica "consumo do budget"),
 * mas NÃO entra na média de performance.
 *
 * Recebe a janela JÁ selecionada (selectCanonicalScores). Retorna null quando
 * não há nenhuma métrica de performance na janela (só budget, ou vazio) — o
 * call-site distingue "sem performance medível" de "0% atingido".
 */
export function overallAchievementPct(scores: AchievementScoreLike[]): number | null {
  const perf = scores.filter((s) => !BUDGET_CONSUMPTION_METRICS.has(s.metric))
  if (perf.length === 0) return null
  const sum = perf.reduce((acc, s) => acc + Number(s.achievementPct), 0)
  return Math.round(sum / perf.length)
}

// ─── Saúde unificada (A-009 fatia 1/2) ────────────────────────────────────────

/**
 * FONTE ÚNICA da "Saúde única" (decisão Marcos 2026-07-18). Um selo por cliente,
 * o mesmo em TODAS as telas, com o eixo antigo "Resultado" rebaixado a
 * sub-informação (weeklyRoas.resultado). NADA de cálculo novo inline: reusa
 * selectCanonicalScores/deriveOverallStatus (health), getRealizadoBatch
 * (faturamento/ROAS canônicos) e pace.ts (pró-rata/projeção).
 *
 * A fatia de UI (fatia 2) consome ESTE contrato; a DAL legada segue exportando
 * os campos antigos sem quebra.
 */
export type UnifiedClientHealth = {
  clientId: string
  /** Selo canônico de saúde (mesmo enum HealthStatus — NÃO há escala nova). */
  status: HealthStatus | null
  /** true = cliente TEM meta vigente; distingue "sem meta" de "aguardando dados". */
  hasActiveGoal: boolean
  /** Média de atingimento SEM SPEND/INVESTMENT (A-121). null = sem performance medível. */
  overallAchievementPct: number | null
  /** ROAS da semana fechada + o Resultado ANTIGO como sub-informação. */
  weeklyRoas: {
    value: number | null
    label: string // 'semana passada'
    resultado: ClientResultado | null
  }
  /** Pacing do mês corrente (faturamento) via fonte única. */
  monthlyPacing: {
    realizado: number | null
    meta: number | null
    esperadoAteHoje: number | null
    projecao: number | null
    pct: number | null // realizado ÷ meta × 100 (mês cheio)
    /**
     * Diagnóstico dos zerados: ECOMMERCE com realizado=0 e spend>0. Combine com
     * ga4sync.connected na UI ("Loja GA4Sync não vinculada?" vs "sem vendas mesmo").
     */
    semReceitaComGasto: boolean
  }
  ga4sync: { connected: boolean }
  calculatedAt: Date
}

/**
 * Versão BATCH — carteira inteira SEM N+1. Todas as agregações em lote:
 *  - healthScores (1 findMany) → status + atingimento (A-121)
 *  - getRealizadoBatch × FATURAMENTO(MTD) / ROAS(SEMANA_FECHADA) / SPEND(MTD)
 *  - goals FATURAMENTO MONTHLY (1 findMany) → meta do pacing
 *  - PlatformAccount GA4SYNC (1 findMany) → ga4sync.connected
 *  - Client.resultado (já no findMany de clientes) → Resultado antigo
 */
export async function getUnifiedClientHealthBatch(
  clientIds: string[],
): Promise<Map<string, UnifiedClientHealth>> {
  const out = new Map<string, UnifiedClientHealth>()
  if (clientIds.length === 0) return out

  const now = new Date()
  const { start: weekStart } = getWeekRange()
  const { start: monthStart } = getMonthRange()
  const fetchFrom = monthStart < weekStart ? monthStart : weekStart
  const sp = spDayInfo(now)

  const clients = await prisma.client.findMany({
    where: { id: { in: clientIds } },
    select: {
      id: true,
      businessType: true,
      resultado: true,
      healthScores: {
        where: { periodStart: { gte: fetchFrom } },
        select: { status: true, metric: true, achievementPct: true, period: true, periodStart: true },
      },
      goals: {
        where: {
          metric: 'FATURAMENTO',
          period: 'MONTHLY',
          startDate: { lte: now },
          endDate: { gte: monthStart },
        },
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: { targetValue: true },
      },
    },
  })

  const goalClientIds = await getClientsWithActiveGoalLocal(clients.map((c) => c.id), monthStart, weekStart)

  // GA4SYNC presença (batch): PlatformAccount ativa por cliente.
  const ga4syncAccounts = await prisma.platformAccount.findMany({
    where: { clientId: { in: clientIds }, platform: 'GA4SYNC', active: true },
    select: { clientId: true },
  })
  const ga4syncConnected = new Set(ga4syncAccounts.map((a) => a.clientId))

  // Realizado canônico em lote (sem N+1). Roteia por businessType internamente.
  const forBatch = clients.map((c) => ({ id: c.id, businessType: c.businessType }))
  const [fatMtd, spendMtd, roasSemana] = await Promise.all([
    getRealizadoBatch(forBatch, 'FATURAMENTO', 'MTD'),
    getRealizadoBatch(forBatch, 'SPEND', 'MTD'),
    getRealizadoBatch(forBatch, 'ROAS', 'SEMANA_FECHADA'),
  ])

  for (const c of clients) {
    const canonical = selectCanonicalScores(c.healthScores, weekStart, monthStart)
    const status = worstStatus(canonical)
    const achievement = overallAchievementPct(canonical)

    const meta = c.goals[0] ? Number(c.goals[0].targetValue) : null
    const realizado = fatMtd.get(c.id)?.valor ?? null
    const spend = spendMtd.get(c.id)?.valor ?? null
    const roas = roasSemana.get(c.id)
    // Grandeza única do selo mensal = FATURAMENTO (ECOM e LOCAL); a barra por
    // métrica-resultado local segue em progress.ts.
    const esperadoAteHoje =
      meta != null ? proRataExpected('FATURAMENTO', meta, sp.daysElapsedInMonth, sp.totalDaysInMonth) : null
    const projecao =
      realizado != null ? projectMonth(realizado, sp.daysElapsedInMonth, sp.totalDaysInMonth) : null
    const pct = meta != null && meta > 0 && realizado != null ? Math.round((realizado / meta) * 100) : null

    const semReceitaComGasto =
      c.businessType === 'ECOMMERCE' && (realizado ?? 0) === 0 && (spend ?? 0) > 0

    out.set(c.id, {
      clientId: c.id,
      status,
      hasActiveGoal: goalClientIds.has(c.id),
      overallAchievementPct: achievement,
      weeklyRoas: {
        value: roas?.valor ?? null,
        label: roas?.periodoLabel ?? 'semana passada',
        resultado: c.resultado ?? null,
      },
      monthlyPacing: { realizado, meta, esperadoAteHoje, projecao, pct, semReceitaComGasto },
      ga4sync: { connected: ga4syncConnected.has(c.id) },
      calculatedAt: now,
    })
  }

  return out
}

/** Versão de UM cliente (conveniência; reusa a batch). */
export async function getUnifiedClientHealth(clientId: string): Promise<UnifiedClientHealth | null> {
  const map = await getUnifiedClientHealthBatch([clientId])
  return map.get(clientId) ?? null
}

/**
 * "Tem meta vigente?" em lote — mesma regra do getClientsWithActiveGoal da DAL
 * (Goal WEEKLY da semana OU MONTHLY do mês, já iniciada). Duplicado aqui como
 * helper local para evitar dependência circular com dal.ts (que importa este
 * módulo). Se um dia virar utilitário compartilhado, unificar numa fonte só.
 */
async function getClientsWithActiveGoalLocal(
  clientIds: string[],
  monthStart: Date,
  weekStart: Date,
): Promise<Set<string>> {
  if (clientIds.length === 0) return new Set()
  const goals = await prisma.goal.findMany({
    where: {
      clientId: { in: clientIds },
      startDate: { lte: new Date() },
      OR: [
        { period: 'WEEKLY', endDate: { gte: weekStart } },
        { period: 'MONTHLY', endDate: { gte: monthStart } },
      ],
    },
    select: { clientId: true },
  })
  return new Set(goals.map((g) => g.clientId))
}
