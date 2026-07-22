import 'server-only'
import type { HealthStatus, GoalPeriod, MetricType, ClientResultado, BusinessType } from '@prisma/client'
import { prisma } from './prisma'
import { getWeekRange, getMonthRange } from './utils'
import { BUDGET_CONSUMPTION_METRICS, aggregateSnapshots, isAdPlatform, type AggregatableSnapshot } from '@/services/health-scorer'
import { getRealizadoBatch } from './metas/realizado'
import { spDayInfo, projectMonth, proRataExpected } from './metas/pace'
import {
  LOCAL_RESULT_METRICS,
  electPrimaryLocalGoal,
  pacingMetricLabel,
  isMonetaryMetric,
} from './metas/metricOptions'

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
  /**
   * Pacing do mês corrente via fonte única. A grandeza medida depende do tipo de
   * negócio (regra 0 · DADO AMARRADO): ECOMMERCE = FATURAMENTO (R$); LOCAL/B2B =
   * a métrica-resultado PRINCIPAL do cliente (contagem, ex.: MENSAGENS/LEADS/
   * CONVERSIONS), eleita da Goal via `electPrimaryLocalGoal`. Local/B2B sem
   * métrica principal cai em FATURAMENTO (fallback), e só é "sem meta" quando não
   * há NENHUMA das duas.
   */
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
    /** Métrica medida no selo mensal: FATURAMENTO (ecom) ou a principal (local/B2B). */
    metric: MetricType
    /** Rótulo humano da métrica ("Faturamento", "Mensagens", "Leads"…). */
    metricLabel: string
    /** true = grandeza monetária (R$); false = contagem (número puro). */
    isMonetary: boolean
  }
  ga4sync: { connected: boolean }
  calculatedAt: Date
}

/**
 * Versão BATCH — carteira inteira SEM N+1. Todas as agregações em lote:
 *  - healthScores (1 findMany) → status + atingimento (A-121)
 *  - getRealizadoBatch × FATURAMENTO(MTD) / ROAS(SEMANA_FECHADA) / SPEND(MTD) +
 *    UM batch por métrica-resultado local distinta (MENSAGENS/LEADS/…), sem N+1
 *  - goals FATURAMENTO + métricas-resultado locais MONTHLY (1 findMany) → meta do
 *    pacing (ecom = FATURAMENTO · local/B2B = métrica principal eleita)
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
          // FATURAMENTO (ecom) + métricas-resultado locais (a principal do
          // cliente local/B2B). orderBy asc → a eleição (electPrimaryLocalGoal)
          // e a extração do FATURAMENTO mais recente escolhem a ÚLTIMA iterada.
          metric: { in: ['FATURAMENTO', ...LOCAL_RESULT_METRICS.map((m) => m.value)] },
          period: 'MONTHLY',
          startDate: { lte: now },
          endDate: { gte: monthStart },
        },
        orderBy: { updatedAt: 'asc' },
        select: { metric: true, targetValue: true },
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

  // Métrica-resultado PRINCIPAL dos clientes local/B2B: eleita da Goal via fonte
  // única (electPrimaryLocalGoal — MESMA regra da grade /agency/metas e do
  // fetchMonthProgress). ECOMMERCE fica de fora (mede FATURAMENTO). Realizado da
  // principal via aggregateSnapshots (roteia LEADS/MENSAGENS/CONVERSIONS por
  // businessType) SEM N+1: agrupa por métrica e dispara UM getRealizadoBatch por
  // métrica distinta.
  const btById = new Map(clients.map((c) => [c.id, c.businessType]))
  const localPrimaryByClient = new Map<string, { metric: MetricType; goal: number }>()
  for (const c of clients) {
    if (c.businessType === 'ECOMMERCE') continue
    const elected = electPrimaryLocalGoal(c.goals)
    if (elected) localPrimaryByClient.set(c.id, elected)
  }
  const localByMetric = new Map<MetricType, Array<{ id: string; businessType: BusinessType }>>()
  for (const [clientId, { metric }] of localPrimaryByClient) {
    const arr = localByMetric.get(metric) ?? []
    arr.push({ id: clientId, businessType: btById.get(clientId) ?? 'LOCAL' })
    localByMetric.set(metric, arr)
  }
  const localRealizadoByClient = new Map<string, number | null>()
  await Promise.all(
    [...localByMetric].map(async ([metric, group]) => {
      const realizados = await getRealizadoBatch(group, metric, 'MTD')
      for (const [id, r] of realizados) localRealizadoByClient.set(id, r.valor)
    }),
  )

  for (const c of clients) {
    const canonical = selectCanonicalScores(c.healthScores, weekStart, monthStart)
    const status = worstStatus(canonical)
    const achievement = overallAchievementPct(canonical)

    const isEcom = c.businessType === 'ECOMMERCE'
    const localPrimary = localPrimaryByClient.get(c.id)

    // FATURAMENTO mensal (última por updatedAt — goals ordenadas asc, última vence).
    let fatGoal: number | null = null
    for (const g of c.goals) if (g.metric === 'FATURAMENTO') fatGoal = Number(g.targetValue)

    // Selo mensal por tipo de negócio (regra 0):
    //  · ECOMMERCE            → FATURAMENTO (R$).
    //  · LOCAL/B2B c/ principal → métrica-resultado principal (contagem).
    //  · LOCAL/B2B s/ principal → FATURAMENTO (fallback; alguns locais têm meta R$).
    let pacingMetric: MetricType
    let meta: number | null
    let realizado: number | null
    if (!isEcom && localPrimary) {
      pacingMetric = localPrimary.metric
      meta = localPrimary.goal
      realizado = localRealizadoByClient.get(c.id) ?? null
    } else {
      pacingMetric = 'FATURAMENTO'
      meta = fatGoal
      realizado = fatMtd.get(c.id)?.valor ?? null
    }

    const spend = spendMtd.get(c.id)?.valor ?? null
    const roas = roasSemana.get(c.id)
    // Pró-rata/projeção da fonte única para a MÉTRICA do selo (pace.ts respeita
    // PRORATE_METRICS: FATURAMENTO e as métricas-resultado locais proratizam).
    const esperadoAteHoje =
      meta != null ? proRataExpected(pacingMetric, meta, sp.daysElapsedInMonth, sp.totalDaysInMonth) : null
    const projecao =
      realizado != null ? projectMonth(realizado, sp.daysElapsedInMonth, sp.totalDaysInMonth) : null
    const pct = meta != null && meta > 0 && realizado != null ? Math.round((realizado / meta) * 100) : null

    // Diagnóstico dos zerados permanece ECOMMERCE-only (realizado aqui já é FATURAMENTO).
    const semReceitaComGasto = isEcom && (realizado ?? 0) === 0 && (spend ?? 0) > 0

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
      monthlyPacing: {
        realizado,
        meta,
        esperadoAteHoje,
        projecao,
        pct,
        semReceitaComGasto,
        metric: pacingMetric,
        metricLabel: pacingMetricLabel(pacingMetric),
        isMonetary: isMonetaryMetric(pacingMetric),
      },
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

// ─── Tendência dos últimos 7 dias (Operação Fundação · Bloco 1) ───────────────

/** Veredito operacional da tendência de 7 dias. */
export type WeeklyTrendVerdict = 'SUBINDO' | 'ESTAVEL' | 'DECAINDO' | 'SEM_FONTE' | 'SEM_DADOS'

/**
 * Tendência de faturamento dos últimos 7 dias COMPLETOS vs os 7 dias anteriores.
 *
 * Fonte canônica: aggregateSnapshots (health-scorer) — a MESMA de
 * getRealizado/getRealizadoBatch, aplicando precedência GA4SYNC>GA4 POR DIA.
 * NÃO reimplementa agregação; só fatia por dia a partir de UMA query de
 * snapshots (sem N+1). Janelas em UTC-midnight sobre MetricSnapshot.date
 * (@db.Date), ancoradas no dia-parede SP via spDayInfo (NUNCA saoPauloDayStart).
 *
 * Janela atual  = [D-7 .. D-1]  (7 dias fechados; D = dia-parede SP de hoje)
 * Janela anterior = [D-14 .. D-8] (os 7 dias imediatamente anteriores)
 *
 * `series` = 14 pontos diários (D-14 → D-1) de faturamento, p/ o sparkline.
 */
export type WeeklyTrend = {
  clientId: string
  /** false = cliente sem GA4/GA4SYNC (ecom) ou sem plataforma de anúncio (local). */
  hasRevenueSource: boolean
  faturamento7d: number | null
  faturamentoPrev7d: number | null
  /** (atual - anterior) / anterior × 100. null quando base anterior é 0/indeterminada. */
  variacaoPct: number | null
  veredito: WeeklyTrendVerdict
  roas7d: number | null
  spend7d: number | null
  /** 14 pontos diários de faturamento (D-14 → D-1) p/ sparkline; gaps = 0. */
  series: number[]
  calculatedAt: Date
}

const TREND_SNAP_INCLUDE = { platformAccount: { select: { platform: true } } } as const

export async function getWeeklyTrendBatch(
  clients: Array<{ id: string; businessType: BusinessType }>,
): Promise<Map<string, WeeklyTrend>> {
  const out = new Map<string, WeeklyTrend>()
  if (clients.length === 0) return out

  const now = new Date()
  const sp = spDayInfo(now)
  const dayMs = 86_400_000
  const s0 = sp.spDayStartUtc.getTime() // 00:00Z do dia-parede SP de hoje

  // Chaves de dia (YYYY-MM-DD, 00:00Z) em ordem cronológica: D-14 → D-1.
  const dayKeys: string[] = []
  for (let k = 14; k >= 1; k--) dayKeys.push(new Date(s0 - k * dayMs).toISOString().slice(0, 10))
  const curKeys = new Set(dayKeys.slice(7)) // D-7 .. D-1
  const prevKeys = new Set(dayKeys.slice(0, 7)) // D-14 .. D-8

  const windowStart = new Date(s0 - 14 * dayMs) // 00:00Z de D-14
  const windowEnd = new Date(s0 - dayMs) // 00:00Z de D-1 (lte inclusivo → inclui D-1)

  const clientIds = clients.map((c) => c.id)
  const btById = new Map(clients.map((c) => [c.id, c.businessType]))

  const [snaps, accounts] = await Promise.all([
    prisma.metricSnapshot.findMany({
      where: { clientId: { in: clientIds }, date: { gte: windowStart, lte: windowEnd } },
      include: TREND_SNAP_INCLUDE,
    }),
    prisma.platformAccount.findMany({
      where: { clientId: { in: clientIds }, active: true },
      select: { clientId: true, platform: true },
    }),
  ])

  // hasRevenueSource: ECOMMERCE mede receita por GA4/GA4SYNC; LOCAL/B2B medem
  // por plataforma de anúncio (mesma régua de aggregateSnapshots/resultado-engine).
  const platformsByClient = new Map<string, Set<string>>()
  for (const a of accounts) {
    const set = platformsByClient.get(a.clientId) ?? new Set<string>()
    set.add(a.platform)
    platformsByClient.set(a.clientId, set)
  }
  const hasRevenueSourceOf = (clientId: string, bt: BusinessType): boolean => {
    const set = platformsByClient.get(clientId)
    if (!set) return false
    if (bt === 'ECOMMERCE') return set.has('GA4') || set.has('GA4SYNC')
    for (const p of set) if (isAdPlatform(p)) return true
    return false
  }

  // Agrupa snapshots por cliente e por dia (chave ISO 00:00Z).
  const byClient = new Map<string, Map<string, AggregatableSnapshot[]>>()
  const anyByClient = new Set<string>()
  for (const s of snaps) {
    const dayKey = (s.date instanceof Date ? s.date : new Date(String(s.date))).toISOString().slice(0, 10)
    const perDay = byClient.get(s.clientId) ?? new Map<string, AggregatableSnapshot[]>()
    const arr = perDay.get(dayKey) ?? []
    arr.push(s as AggregatableSnapshot)
    perDay.set(dayKey, arr)
    byClient.set(s.clientId, perDay)
    anyByClient.add(s.clientId)
  }

  for (const c of clients) {
    const bt = btById.get(c.id) ?? 'ECOMMERCE'
    const perDay = byClient.get(c.id) ?? new Map<string, AggregatableSnapshot[]>()

    // Sparkline: faturamento por dia (gap = 0).
    const series = dayKeys.map((k) => aggregateSnapshots(perDay.get(k) ?? [], 'FATURAMENTO', bt) ?? 0)

    const curSnaps: AggregatableSnapshot[] = []
    const prevSnaps: AggregatableSnapshot[] = []
    for (const [k, arr] of perDay) {
      if (curKeys.has(k)) curSnaps.push(...arr)
      else if (prevKeys.has(k)) prevSnaps.push(...arr)
    }

    const faturamento7d = aggregateSnapshots(curSnaps, 'FATURAMENTO', bt)
    const faturamentoPrev7d = aggregateSnapshots(prevSnaps, 'FATURAMENTO', bt)
    const roas7d = aggregateSnapshots(curSnaps, 'ROAS', bt)
    const spend7d = aggregateSnapshots(curSnaps, 'SPEND', bt)

    const hasRevenueSource = hasRevenueSourceOf(c.id, bt)

    let variacaoPct: number | null = null
    let veredito: WeeklyTrendVerdict
    if (!hasRevenueSource) {
      veredito = 'SEM_FONTE'
    } else if (!anyByClient.has(c.id) || (faturamento7d == null && faturamentoPrev7d == null)) {
      veredito = 'SEM_DADOS'
    } else if (faturamentoPrev7d == null || faturamentoPrev7d === 0) {
      // Sem base comparável: só há faturamento novo (subiu do zero) ou tudo zero.
      veredito = (faturamento7d ?? 0) > 0 ? 'SUBINDO' : 'ESTAVEL'
    } else {
      variacaoPct = Math.round((((faturamento7d ?? 0) - faturamentoPrev7d) / faturamentoPrev7d) * 100)
      veredito = variacaoPct > 10 ? 'SUBINDO' : variacaoPct < -10 ? 'DECAINDO' : 'ESTAVEL'
    }

    out.set(c.id, {
      clientId: c.id,
      hasRevenueSource,
      faturamento7d,
      faturamentoPrev7d,
      variacaoPct,
      veredito,
      roas7d,
      spend7d,
      series,
      calculatedAt: now,
    })
  }

  return out
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
