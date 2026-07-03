/**
 * Churn Scorer v2 — cálculo SEMANAL corrente (FASE 1.4-PROVISÓRIA, plano anti-churn).
 *
 * ⚠️ REGRA CENTRAL INVIOLÁVEL: o score v2 é APENAS INFORMATIVO. Ele NÃO dispara
 * Alert, task, War Room, nem altera qualquer limiar de automação. O score v1
 * (ChurnRiskScore.score) segue INTOCADO — o antichurn-monitor (>=60) e a fila
 * anti-churn (>=40) continuam lendo o v1. Este módulo só ENRIQUECE o Json
 * `ChurnRiskScore.factors` com a chave `v2`, sem tocar em nenhuma outra chave.
 *
 * Por que existe: o backtest de 2026-07-03 (docs/churn-score-backtest.md) rodou
 * com coorte insuficiente (4 churned < 8) → recall 0% / FP 0%, indicativo, não
 * conclusivo. Pela regra de decisão do doc, os pesos entram como FAIXAS
 * PROVISÓRIAS + reexecução em ~90 dias. Enquanto provisório, o v2 não pode
 * governar nada — só é exibido, rotulado como provisório.
 *
 * Diferença para o backtest: aqui `refDate = agora`, então os fatores que o
 * backtest não consegue reconstruir numa foto passada (ficha CS, staleness da
 * ficha, feedback reincidente) ENTRAM DE VERDADE, pois vêm do ESTADO ATUAL do
 * Client — não há look-ahead: "hoje" é o presente. A base reconstruível
 * (crônico/performance/spend/suporte/silêncio/inadimplência/idade) é reusada de
 * `computeScoreV2At(clientId, now)` sem duplicar lógica.
 */

import { prisma } from '@/lib/prisma'
import { getWeekRange } from '@/lib/utils'
import { computeScoreV2At, type FactorBreakdown } from '@/services/churn-backtest'
import { resolveClientOwner } from '@/services/owner-resolver'
import { writeAuditLog } from '@/lib/audit'
import { parseDateInput } from '@/lib/tasks/dateInput'
import {
  CHURN_SCORE_WEIGHTS_V2,
  CHURN_FACTOR_KEYS,
  CHURN_SCORE_WEIGHTS_VERSION,
  classifyChurnScore,
  type ChurnBand,
  type ChurnFactorKey,
} from '@/lib/churn/score-v2-config'

const DAY_MS = 24 * 60 * 60 * 1000

/** Shape persistido dentro de `ChurnRiskScore.factors.v2` (informativo). */
export type ChurnScoreV2Persisted = {
  score: number
  faixa: ChurnBand
  breakdown: Record<ChurnFactorKey, FactorBreakdown>
  /** Sempre true nesta fase: pesos não calibrados (coorte insuficiente). */
  provisional: true
  versaoPesos: string
  computedAt: string
}

function clamp01(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

/** Escala Ótimo→Péssimo → severidade 0..1 (pior = 1). */
function relacionamentoSeverity(v: string | null): number | null {
  switch (v) {
    case 'OTIMO':
      return 0
    case 'BOM':
      return 0.25
    case 'REGULAR':
      return 0.5
    case 'RUIM':
      return 0.75
    case 'PESSIMO':
      return 1
    default:
      return null
  }
}

/** NPS → severidade 0..1 (detrator = 1). */
function npsSeverity(v: string | null): number | null {
  switch (v) {
    case 'PROMOTOR':
      return 0
    case 'NEUTRO':
      return 0.5
    case 'DETRATOR':
      return 1
    default:
      return null
  }
}

/**
 * Computa o score v2 "hoje" para um cliente. Reusa a base reconstruível de
 * `computeScoreV2At` e sobrepõe os fatores de estado atual (ficha/staleness/
 * feedback), que no presente são reais (não zerados como no backtest).
 */
export async function computeChurnScoreV2Now(
  clientId: string,
  now: Date = new Date(),
): Promise<ChurnScoreV2Persisted> {
  const base = await computeScoreV2At(clientId, now)
  const breakdown = base.breakdown

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      nps: true,
      relacionamento: true,
      engajamento: true,
      fichaCsUpdatedAt: true,
      feedbackNegativo: true,
      fechouSemanaEmRisco: true,
    },
  })

  if (client) {
    // ── Fator: ficha CS (NPS + relacionamento + engajamento) ──────────────────
    const fichaSignals = [
      npsSeverity(client.nps),
      relacionamentoSeverity(client.relacionamento),
      relacionamentoSeverity(client.engajamento),
    ].filter((s): s is number => s !== null)
    if (fichaSignals.length > 0) {
      const avg = fichaSignals.reduce((s, n) => s + n, 0) / fichaSignals.length
      breakdown.fichaCs.severity = clamp01(avg)
      breakdown.fichaCs.reconstructible = true
    }

    // ── Fator: ficha CS desatualizada (staleness) ─────────────────────────────
    // Nunca preenchida = severidade máxima; 30d=0, 90d=1 depois disso.
    if (!client.fichaCsUpdatedAt) {
      breakdown.stalenessFicha.severity = 1
    } else {
      const staleDays = (now.getTime() - client.fichaCsUpdatedAt.getTime()) / DAY_MS
      breakdown.stalenessFicha.severity = clamp01((staleDays - 30) / 60)
    }
    breakdown.stalenessFicha.reconstructible = true

    // ── Fator: feedback negativo reincidente ──────────────────────────────────
    // Volume de reclamações na semana + marcador de reincidência (fechou semana
    // anterior já em risco de feedback).
    let feedbackSev = clamp01(client.feedbackNegativo / 3)
    if (client.fechouSemanaEmRisco) feedbackSev = clamp01(feedbackSev + 0.34)
    breakdown.feedbackReincidencia.severity = feedbackSev
    breakdown.feedbackReincidencia.reconstructible = true
  }

  // ── Recalcula pontos + score com os fatores agora completos ─────────────────
  let score = 0
  for (const key of CHURN_FACTOR_KEYS) {
    const weight = CHURN_SCORE_WEIGHTS_V2[key].weight
    const points = breakdown[key].severity * weight
    breakdown[key].points = Math.round(points * 10) / 10
    score += points
  }
  const finalScore = Math.round(Math.min(100, Math.max(0, score)))

  return {
    score: finalScore,
    faixa: classifyChurnScore(finalScore),
    breakdown,
    provisional: true,
    versaoPesos: CHURN_SCORE_WEIGHTS_VERSION,
    computedAt: now.toISOString(),
  }
}

/**
 * Enriquece a linha semanal de ChurnRiskScore (criada pelo v1 no MESMO run) com
 * a chave `v2` dentro de `factors`. NÃO cria linha nem toca em `score` (v1) ou
 * nas demais chaves de `factors`. Se a linha do v1 ainda não existe (v1 falhou
 * para este cliente), pula — sem v1 não há linha semanal a enriquecer.
 */
async function persistChurnScoreV2(clientId: string, weekStart: Date, now: Date): Promise<boolean> {
  const existing = await prisma.churnRiskScore.findUnique({
    where: { clientId_weekStart: { clientId, weekStart } },
    select: { factors: true },
  })
  if (!existing) return false

  const v2 = await computeChurnScoreV2Now(clientId, now)

  // Preserva TODAS as chaves v1 existentes; só adiciona/substitui `v2`.
  const prevFactors =
    existing.factors && typeof existing.factors === 'object' && !Array.isArray(existing.factors)
      ? (existing.factors as Record<string, unknown>)
      : {}
  const nextFactors: Record<string, unknown> = { ...prevFactors, v2 }

  await prisma.churnRiskScore.update({
    where: { clientId_weekStart: { clientId, weekStart } },
    data: { factors: nextFactors as object },
  })
  return true
}

export type ScoreAllV2Result = {
  clientsProcessed: number
  enriched: number
  failed: number
}

/**
 * Roda o v2 informativo para todos os clientes ACTIVE, no MESMO step do cron,
 * logo APÓS o v1. Resiliente: try/catch por cliente (CLAUDE.md #7).
 */
export async function scoreAllClientsChurnRiskV2(now: Date = new Date()): Promise<ScoreAllV2Result> {
  const { start: weekStart } = getWeekRange()
  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  })

  let enriched = 0
  let failed = 0
  for (const client of clients) {
    try {
      const ok = await persistChurnScoreV2(client.id, weekStart, now)
      if (ok) enriched++
    } catch (err) {
      failed++
      console.error(`[churn-scorer-v2] falha ao pontuar (informativo) cliente ${client.id}:`, err)
    }
  }

  return { clientsProcessed: clients.length, enriched, failed }
}

// ─── Task automática de reexecução do backtest (recalibração ~out/2026) ─────────

/** Chave idempotente única da task de reexecução (dedupe por Task.idempotencyKey). */
export const BACKTEST_RERUN_TASK_KEY = 'auto:churn-backtest-rerun:2026-10'

/**
 * MECANISMO (não intenção) de reexecução: se o backtest já rodou alguma vez
 * (AuditLog `churn.backtest.run`) e a task de reexecução ainda não existe, cria
 * uma task ao ADMIN (dono canônico via headFallback; fallback ADMIN ativo) com
 * dueDate 2026-10-01. Idempotente pela idempotencyKey única. Chamado no mesmo
 * step do cron do churn-scorer.
 */
export async function ensureBacktestRerunTask(): Promise<{
  created: boolean
  reason: 'created' | 'no-backtest-yet' | 'already-exists' | 'no-assignee'
}> {
  const backtestRan = await prisma.auditLog.findFirst({
    where: { action: 'churn.backtest.run' },
    select: { id: true },
  })
  if (!backtestRan) return { created: false, reason: 'no-backtest-yet' }

  const already = await prisma.task.findUnique({
    where: { idempotencyKey: BACKTEST_RERUN_TASK_KEY },
    select: { id: true },
  })
  if (already) return { created: false, reason: 'already-exists' }

  // Dono canônico: headFallback (owner-resolver). Fallback final: ADMIN ativo.
  let assignee = (await resolveClientOwner({ gestorId: null, assignments: [] })).assigneeId
  if (!assignee) {
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN', active: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
    assignee = admin?.id ?? null
  }
  if (!assignee) return { created: false, reason: 'no-assignee' }

  await prisma.task.create({
    data: {
      title: 'Reexecutar backtest do score de churn (recalibração de 90 dias)',
      description:
        'O score de churn v2 está PROVISÓRIO desde 2026-07-03: o backtest rodou com ' +
        'coorte insuficiente (4 churned < 8), então os pesos não foram calibrados e o v2 ' +
        'é apenas informativo (não dispara automação).\n\n' +
        'O QUE FAZER:\n' +
        '1. Rodar novamente o backtest do churn (Configurações → churn / serviço runChurnBacktest), ' +
        'agora com ~90 dias a mais de histórico e mais churns acumulados.\n' +
        '2. Conferir o relatório em docs/churn-score-backtest.md: recall T-6 e falso-positivo.\n\n' +
        'O QUE DECIDIR:\n' +
        '- Se recall T-6 >= 60% e FP <= 20%: promover os pesos a spec (marcar uncalibrated=false) ' +
        'e habilitar o v2 para automação.\n' +
        '- Caso contrário: manter provisório, ajustar pesos (candidatos a ganhar peso: ' +
        'performanceRecente e idadeContrato) e reagendar nova reexecução.',
      priority: 'ALTA',
      origin: 'AUTOMACAO',
      // Task.clientId é nullable (schema): reexecução é tarefa da agência, não de
      // um cliente específico. Fica sem clientId (null), sem fallback forçado.
      clientId: null,
      assignedTo: assignee,
      dueDate: parseDateInput('2026-10-01'),
      idempotencyKey: BACKTEST_RERUN_TASK_KEY,
    },
  })

  await writeAuditLog({
    action: 'churn.backtest.rerun_task.created',
    entityType: 'Task',
    entityId: BACKTEST_RERUN_TASK_KEY,
    metadata: { assignee, dueDate: '2026-10-01', versaoPesos: CHURN_SCORE_WEIGHTS_VERSION },
  })

  return { created: true, reason: 'created' }
}
