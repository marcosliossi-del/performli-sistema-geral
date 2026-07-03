/**
 * Backtest do Score de Risco de Churn v2 (FASE 0 do plano anti-churn).
 *
 * Serviço PURO DE LEITURA. Reconstrói o score v2 na FOTO de datas passadas
 * (T-2/T-4/T-6/T-8 semanas antes do churn) para clientes que já cancruaram, e o
 * compara com uma coorte de controle (clientes saudáveis), medindo se os pesos
 * PROPOSTOS pela auditoria de fato antecipam o churn. Só grava um AuditLog da
 * execução — não altera nenhum dado de cliente.
 *
 * Regra de decisão (docs/churn-score-backtest.md): recall T-6 >=60% e
 * FP <=20% → os pesos viram spec; caso contrário → faixas provisórias +
 * reexecução em 90 dias.
 *
 * Limitação estrutural conhecida: a ficha de CS (nps/relacionamento/engajamento)
 * e o `fichaCsUpdatedAt` não têm histórico versionado — não é possível
 * reconstruí-los numa data passada. Os fatores `fichaCs`, `stalenessFicha` e
 * `feedbackReincidencia` (idem: contadores de estado atual, sem histórico)
 * entram como 0 no backtest e são reportados em `fatoresNaoReconstruiveis`.
 */

import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import {
  CHURN_SCORE_WEIGHTS_V2,
  CHURN_FACTOR_KEYS,
  CHURN_RISK_THRESHOLD,
  CHURN_SCORE_WEIGHTS_VERSION,
  classifyChurnScore,
  type ChurnFactorKey,
  type ChurnBand,
} from '@/lib/churn/score-v2-config'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

/** Fatores que NÃO têm histórico versionado — não reconstruíveis no passado. */
const NON_RECONSTRUCTIBLE: ChurnFactorKey[] = ['fichaCs', 'stalenessFicha', 'feedbackReincidencia']

function weeksBefore(ref: Date, weeks: number): Date {
  return new Date(ref.getTime() - weeks * WEEK_MS)
}

function clamp01(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

export type FactorBreakdown = {
  severity: number // 0..1
  points: number // severity * weight
  reconstructible: boolean
}

export type ScoreV2Result = {
  score: number
  band: ChurnBand
  breakdown: Record<ChurnFactorKey, FactorBreakdown>
}

/**
 * Reconstrói o score v2 (0-100) na FOTO `refDate`, usando SOMENTE registros com
 * data <= refDate. Cada fator vira severity 0..1 × peso.
 */
export async function computeScoreV2At(clientId: string, refDate: Date): Promise<ScoreV2Result> {
  const breakdown = {} as Record<ChurnFactorKey, FactorBreakdown>
  for (const key of CHURN_FACTOR_KEYS) {
    breakdown[key] = { severity: 0, points: 0, reconstructible: !NON_RECONSTRUCTIBLE.includes(key) }
  }

  // ── HealthScore WEEKLY, janela de 8 semanas antes de refDate ────────────────
  const eightWeeksAgo = weeksBefore(refDate, 8)
  const fourWeeksAgo = weeksBefore(refDate, 4)
  type HealthRow = { periodStart: Date; status: string; achievementPct: unknown }
  const healthScores: HealthRow[] = await prisma.healthScore.findMany({
    where: { clientId, period: 'WEEKLY', periodStart: { gte: eightWeeksAgo, lte: refDate } },
    orderBy: { periodStart: 'desc' },
    select: { periodStart: true, status: true, achievementPct: true },
  })

  // Fator 1: crônico REGULAR/RUIM (semanas consecutivas, da mais recente p/ trás)
  const byWeek = new Map<string, HealthRow[]>()
  for (const hs of healthScores) {
    const key = hs.periodStart.toISOString().slice(0, 10)
    const bucket = byWeek.get(key)
    if (bucket) bucket.push(hs)
    else byWeek.set(key, [hs])
  }
  const weeksSorted = [...byWeek.entries()].sort(
    ([a], [b]) => new Date(b).getTime() - new Date(a).getTime(),
  )
  let consecutiveBad = 0
  for (const [, group] of weeksSorted) {
    const bad = group.some((g) => g.status === 'REGULAR' || g.status === 'RUIM')
    if (bad) consecutiveBad++
    else break
  }
  breakdown.cronicoRegularRuim.severity = clamp01(consecutiveBad / 6)

  // Fator 2: performance recente (achievement médio das últimas 4 semanas)
  const recentHealth = healthScores.filter((h) => h.periodStart >= fourWeeksAgo)
  if (recentHealth.length > 0) {
    const avgPct =
      recentHealth.reduce((s, h) => s + Number(h.achievementPct), 0) / recentHealth.length
    breakdown.performanceRecente.severity = clamp01((100 - avgPct) / 100)
  }

  // Fator 3: tendência de spend (soma 4 sem recentes vs 4 sem anteriores)
  const spendRows = await prisma.metricSnapshot.findMany({
    where: { clientId, date: { gte: eightWeeksAgo, lte: refDate } },
    select: { date: true, spend: true },
  })
  let recentSpend = 0
  let priorSpend = 0
  for (const row of spendRows) {
    const spend = row.spend ? Number(row.spend) : 0
    if (row.date >= fourWeeksAgo) recentSpend += spend
    else priorSpend += spend
  }
  if (priorSpend > 0) {
    const declineRatio = (priorSpend - recentSpend) / priorSpend // 0.5 = caiu 50%
    breakdown.tendenciaSpend.severity = clamp01(declineRatio / 0.5)
  }

  // Fator 6: suporte atrasado (isSupport vencidas e ainda abertas NA ÉPOCA)
  const overdueSupport = await prisma.task.count({
    where: {
      clientId,
      isSupport: true,
      dueDate: { lt: refDate },
      OR: [{ completedAt: null }, { completedAt: { gt: refDate } }],
    },
  })
  breakdown.suporteAtrasado.severity = clamp01(overdueSupport / 3)

  // Fator 7: silêncio (última interação OU mensagem de chat antes de refDate)
  const lastInteraction = await prisma.clientInteraction.findFirst({
    where: { clientId, createdAt: { lte: refDate } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  const lastChat = await prisma.clientChatMessage.findFirst({
    where: { chat: { clientId }, createdAt: { lte: refDate } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  const lastTouchMs = Math.max(
    lastInteraction ? lastInteraction.createdAt.getTime() : 0,
    lastChat ? lastChat.createdAt.getTime() : 0,
  )
  if (lastTouchMs === 0) {
    breakdown.silencio.severity = 1 // nunca houve contato registrado até a foto
  } else {
    const silentDays = (refDate.getTime() - lastTouchMs) / DAY_MS
    breakdown.silencio.severity = clamp01((silentDays - 7) / 21) // 7d=0, 28d=1
  }

  // Fator 9: inadimplência — LIMITAÇÃO ESTRUTURAL (look-ahead): o filtro usa o
  // STATUS ATUAL do pagamento, não o estado da época. Fatura OVERDUE em refDate
  // e paga depois hoje é RECEIVED e some da contagem (e vice-versa). O AsaasPayment
  // não versiona transições de status, então a reconstrução exata é impossível.
  // A limitação é exposta no relatório (fatoresComLimitacao) para o peso deste
  // fator ser lido com ressalva na calibração.
  const overduePayments = await prisma.asaasPayment.count({
    where: { customer: { clientId }, status: 'OVERDUE', dueDate: { lte: refDate } },
  })
  breakdown.inadimplencia.severity = clamp01(overduePayments / 2)

  // Fator 10: idade de contrato (heurística provisória — sem mediana dos churned)
  // Contratos jovens caem na janela de churn precoce; risco decai até ~12 meses.
  const contract = await prisma.contract.findFirst({
    where: { clientId, startDate: { lte: refDate } },
    orderBy: { startDate: 'asc' },
    select: { startDate: true },
  })
  let startDate: Date | null = contract ? contract.startDate : null
  if (!startDate) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { contractStart: true },
    })
    startDate = client?.contractStart ?? null
  }
  if (startDate && startDate <= refDate) {
    const ageMonths = (refDate.getTime() - startDate.getTime()) / (30 * DAY_MS)
    breakdown.idadeContrato.severity = clamp01(1 - ageMonths / 12)
  } else {
    breakdown.idadeContrato.reconstructible = false
  }

  // ── Pontos + score final ────────────────────────────────────────────────────
  let score = 0
  for (const key of CHURN_FACTOR_KEYS) {
    const weight = CHURN_SCORE_WEIGHTS_V2[key].weight
    const points = breakdown[key].severity * weight
    breakdown[key].points = Math.round(points * 10) / 10
    score += points
  }
  const finalScore = Math.round(Math.min(100, Math.max(0, score)))

  return { score: finalScore, band: classifyChurnScore(finalScore), breakdown }
}

// ─── COORTES ───────────────────────────────────────────────────────────────────

export type ChurnedCase = {
  id: string
  name: string
  churnDate: string
  scoresByT: Record<string, number> // 'T-2' -> score
  breakdownT6: Record<ChurnFactorKey, FactorBreakdown>
}

export type ChurnedCohort = {
  casos: ChurnedCase[]
  total: number
  coorteInsuficiente: boolean
}

/** Clientes CHURNED com data de churn nos últimos 12 meses. */
export async function montarCoorteChurned(now: Date = new Date()): Promise<
  { id: string; name: string; churnDate: Date }[]
> {
  const twelveMonthsAgo = new Date(now.getTime() - 365 * DAY_MS)
  const churned = await prisma.client.findMany({
    where: { status: 'CHURNED' },
    select: {
      id: true,
      name: true,
      updatedAt: true,
      contracts: {
        where: { cancelledAt: { not: null } },
        orderBy: { cancelledAt: 'desc' },
        take: 1,
        select: { cancelledAt: true },
      },
    },
  })

  const out: { id: string; name: string; churnDate: Date }[] = []
  for (const c of churned) {
    const cancelled = c.contracts[0]?.cancelledAt ?? null
    const churnDate = cancelled ?? c.updatedAt
    if (churnDate >= twelveMonthsAgo && churnDate <= now) {
      out.push({ id: c.id, name: c.name, churnDate })
    }
  }
  return out
}

export type ControleCase = {
  id: string
  name: string
  refDate: string
  score: number
  breakdown: Record<ChurnFactorKey, FactorBreakdown>
}

/**
 * Até 15 clientes ACTIVE sem CriticalProtocol nos últimos 6 meses. Data de
 * referência determinística por cliente: entre 6 e 16 semanas atrás, derivada de
 * um hash simples do id (NADA de Math.random — resultado reproduzível).
 */
export async function montarCoorteControle(
  now: Date = new Date(),
): Promise<{ id: string; name: string; refDate: Date }[]> {
  const sixMonthsAgo = new Date(now.getTime() - 182 * DAY_MS)
  const clients: { id: string; name: string }[] = await prisma.client.findMany({
    where: {
      status: 'ACTIVE',
      criticalProtocols: { none: { activatedAt: { gte: sixMonthsAgo } } },
    },
    orderBy: { createdAt: 'asc' }, // mais antigos = mais histórico reconstruível
    take: 15,
    select: { id: true, name: true },
  })

  return clients.map((c) => {
    let sum = 0
    for (let i = 0; i < c.id.length; i++) sum += c.id.charCodeAt(i)
    const weeks = (sum % 11) + 6 // 6..16 semanas
    return { id: c.id, name: c.name, refDate: weeksBefore(now, weeks) }
  })
}

// ─── BACKTEST ──────────────────────────────────────────────────────────────────

const T_WEEKS = [2, 4, 6, 8] as const
const T_LABELS = T_WEEKS.map((w) => `T-${w}`)

export type BacktestReport = {
  geradoEm: string
  versaoPesos: string
  limiarRisco: number
  churned: ChurnedCase[]
  controle: ControleCase[]
  metricas: {
    nChurned: number
    nControle: number
    coorteInsuficiente: boolean
    recallByT: Record<string, number> // 'T-6' -> % (0..100)
    falsoPositivo: number // % controle >= limiar
    separacaoPorFator: {
      fator: ChurnFactorKey
      label: string
      mediaChurnedT6: number
      mediaControle: number
      separacao: number
    }[]
  }
  metasAtendidas: { recallT6: boolean; fp: boolean }
  fatoresNaoReconstruiveis: { fator: ChurnFactorKey; label: string; motivo: string }[]
  falhas: { id: string; nome: string; erro: string }[]
}

export async function runChurnBacktest(actor?: {
  actorId?: string | null
  actorRole?: string | null
}): Promise<BacktestReport> {
  const now = new Date()
  const falhas: { id: string; nome: string; erro: string }[] = []

  // ── Coorte churned ──────────────────────────────────────────────────────────
  const churnedRaw = await montarCoorteChurned(now)
  const churned: ChurnedCase[] = []
  for (const c of churnedRaw) {
    try {
      const scoresByT: Record<string, number> = {}
      let breakdownT6: Record<ChurnFactorKey, FactorBreakdown> | null = null
      for (const w of T_WEEKS) {
        const ref = weeksBefore(c.churnDate, w)
        const r = await computeScoreV2At(c.id, ref)
        scoresByT[`T-${w}`] = r.score
        if (w === 6) breakdownT6 = r.breakdown
      }
      churned.push({
        id: c.id,
        name: c.name,
        churnDate: c.churnDate.toISOString().slice(0, 10),
        scoresByT,
        breakdownT6: breakdownT6 ?? emptyBreakdown(),
      })
    } catch (err) {
      falhas.push({ id: c.id, nome: c.name, erro: err instanceof Error ? err.message : 'erro' })
    }
  }

  // ── Coorte controle ─────────────────────────────────────────────────────────
  const controleRaw = await montarCoorteControle(now)
  const controle: ControleCase[] = []
  for (const c of controleRaw) {
    try {
      const r = await computeScoreV2At(c.id, c.refDate)
      controle.push({
        id: c.id,
        name: c.name,
        refDate: c.refDate.toISOString().slice(0, 10),
        score: r.score,
        breakdown: r.breakdown,
      })
    } catch (err) {
      falhas.push({ id: c.id, nome: c.name, erro: err instanceof Error ? err.message : 'erro' })
    }
  }

  // ── Métricas ────────────────────────────────────────────────────────────────
  const nChurned = churned.length
  const nControle = controle.length

  const recallByT: Record<string, number> = {}
  for (const label of T_LABELS) {
    if (nChurned === 0) {
      recallByT[label] = 0
      continue
    }
    const flagged = churned.filter((c) => (c.scoresByT[label] ?? 0) >= CHURN_RISK_THRESHOLD).length
    recallByT[label] = Math.round((flagged / nChurned) * 1000) / 10
  }

  const falsoPositivo =
    nControle === 0
      ? 0
      : Math.round(
          (controle.filter((c) => c.score >= CHURN_RISK_THRESHOLD).length / nControle) * 1000,
        ) / 10

  // Separação por fator: média (pontos) dos churned em T-6 vs média do controle.
  const separacaoPorFator = CHURN_FACTOR_KEYS.map((fator) => {
    const churnedAvg =
      nChurned === 0
        ? 0
        : churned.reduce((s, c) => s + (c.breakdownT6[fator]?.points ?? 0), 0) / nChurned
    const controleAvg =
      nControle === 0
        ? 0
        : controle.reduce((s, c) => s + (c.breakdown[fator]?.points ?? 0), 0) / nControle
    return {
      fator,
      label: CHURN_SCORE_WEIGHTS_V2[fator].label,
      mediaChurnedT6: Math.round(churnedAvg * 100) / 100,
      mediaControle: Math.round(controleAvg * 100) / 100,
      separacao: Math.round((churnedAvg - controleAvg) * 100) / 100,
    }
  }).sort((a, b) => b.separacao - a.separacao)

  const recallT6 = recallByT['T-6'] ?? 0
  const metasAtendidas = { recallT6: recallT6 >= 60, fp: falsoPositivo <= 20 }

  const report: BacktestReport = {
    geradoEm: now.toISOString(),
    versaoPesos: CHURN_SCORE_WEIGHTS_VERSION,
    limiarRisco: CHURN_RISK_THRESHOLD,
    churned,
    controle,
    metricas: {
      nChurned,
      nControle,
      coorteInsuficiente: nChurned < 8,
      recallByT,
      falsoPositivo,
      separacaoPorFator,
    },
    metasAtendidas,
    fatoresNaoReconstruiveis: [
      ...NON_RECONSTRUCTIBLE.map((fator) => ({
        fator,
        label: CHURN_SCORE_WEIGHTS_V2[fator].label,
        motivo:
          'Campo de estado atual sem histórico versionado — não reconstruível numa foto passada. Entra como 0; reexecutar em 90 dias com histórico acumulado.',
      })),
      {
        fator: 'inadimplencia' as ChurnFactorKey,
        label: CHURN_SCORE_WEIGHTS_V2.inadimplencia.label,
        motivo:
          'PARCIALMENTE reconstruível (look-ahead): usa o status ATUAL do pagamento — fatura vencida na época e paga depois some da foto. Ler a separação deste fator com ressalva; peso segue uncalibrated até histórico de transições.',
      },
    ],
    falhas,
  }

  await writeAuditLog({
    actorId: actor?.actorId ?? null,
    actorRole: actor?.actorRole ?? null,
    action: 'churn.backtest.run',
    entityType: 'ChurnBacktest',
    entityId: CHURN_SCORE_WEIGHTS_VERSION,
    metadata: {
      versaoPesos: CHURN_SCORE_WEIGHTS_VERSION,
      nChurned,
      nControle,
      coorteInsuficiente: report.metricas.coorteInsuficiente,
      recallByT,
      falsoPositivo,
      metasAtendidas,
      falhas: falhas.length,
    },
  })

  return report
}

function emptyBreakdown(): Record<ChurnFactorKey, FactorBreakdown> {
  const b = {} as Record<ChurnFactorKey, FactorBreakdown>
  for (const key of CHURN_FACTOR_KEYS) {
    b[key] = { severity: 0, points: 0, reconstructible: !NON_RECONSTRUCTIBLE.includes(key) }
  }
  return b
}
