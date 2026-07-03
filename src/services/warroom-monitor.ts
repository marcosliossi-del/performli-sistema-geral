/**
 * War Room Monitor (WAR-16 / acompanhamento pós-War Room)
 *
 * Roda no cron diário. Para cada War Room ativa:
 *  1. Critério de saída: compara o valor real mais recente (HealthScore WEEKLY) da
 *     métrica do critério contra o alvo. Atingido → marca exitMetAt + alerta de
 *     "avaliar encerramento". Regressão (deixou de cumprir) → limpa exitMetAt + alerta.
 *     NUNCA encerra sozinho — encerrar é ação humana (closeWarRoom).
 *  2. Revisão semanal: War Room sem revisão há > 7 dias → alerta.
 *
 * try/catch POR protocolo. Dedup de alerta por tipo + cliente (janela de 6 dias).
 */

import { prisma } from '@/lib/prisma'
import { statusIdFor } from '@/lib/tasks/statusMap'
import { AlertType, MetricType } from '@prisma/client'

const REVIEW_INTERVAL_DAYS = 7
const ALERT_DEDUP_DAYS = 6
const DIAGNOSTICO_CHASE_DAYS = 2 // aberto há >= 2 dias sem diagnóstico → cobra o gestor

/** Próxima quarta-feira (>= hoje) ao meio-dia UTC — prazo "até quarta". */
function nextWednesday(now: Date): Date {
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0))
  const delta = (3 - base.getUTCDay() + 7) % 7 // 3 = quarta
  return new Date(base.getTime() + delta * 86_400_000)
}

// Métricas em que MENOR é melhor (critério atingido quando valor <= alvo).
const LOWER_IS_BETTER: ReadonlySet<MetricType> = new Set<MetricType>([
  'CPL', 'CPA', 'CAC', 'CPC', 'SPEND', 'CPS', 'CPM',
])

async function hasRecentAlert(clientId: string, type: AlertType): Promise<boolean> {
  const recent = await prisma.alert.findFirst({
    where: {
      clientId,
      type,
      createdAt: { gte: new Date(Date.now() - ALERT_DEDUP_DAYS * 86_400_000) },
    },
    select: { id: true },
  })
  return !!recent
}

export async function monitorWarRooms(): Promise<{
  checked: number
  reviewAlerts: number
  exitMetAlerts: number
  regressionAlerts: number
  diagnosticoChaseTasks: number
}> {
  const protocols = await prisma.criticalProtocol.findMany({
    // T-08/T-23: só cliente ACTIVE é cobrado/monitorado. CHURNED saiu; PAUSED
    // está INTENCIONALMENTE sem operação — não gera War Room automática enquanto
    // pausado (o monitor anti-esquecimento de pausa cobre o risco da pausa longa).
    where: { status: { not: 'ENCERRADO' }, client: { status: 'ACTIVE' } },
    select: {
      id: true,
      clientId: true,
      activatedAt: true,
      lastReviewedAt: true,
      exitMetric: true,
      exitTarget: true,
      exitMetAt: true,
      responsibleId: true,
      diagnosticoGestor: true,
      client: {
        select: {
          name: true,
          assignments: { where: { isPrimary: true }, select: { userId: true }, take: 1 },
        },
      },
    },
  })

  let reviewAlerts = 0
  let exitMetAlerts = 0
  let regressionAlerts = 0
  let diagnosticoChaseTasks = 0
  const now = Date.now()
  const reviewCutoff = now - REVIEW_INTERVAL_DAYS * 86_400_000
  const chaseCutoff = now - DIAGNOSTICO_CHASE_DAYS * 86_400_000

  for (const p of protocols) {
    try {
      // ── 0. Cobrança do diagnóstico do gestor (substitui a cobrança manual) ─
      // Protocolo aberto há >= 2 dias e ainda sem diagnóstico preenchido → cria
      // UMA task para o responsável (dedupe por protocolo). O form é a evidência.
      if (p.diagnosticoGestor == null && new Date(p.activatedAt).getTime() <= chaseCutoff) {
        const assignee = p.responsibleId ?? p.client.assignments[0]?.userId ?? null
        if (assignee) {
          // T-26 — idempotencyKey de COBRANÇA CONTÍNUA: a War Room segue viva
          // enquanto não tem diagnóstico; se a task de cobrança foi CANCELADA, a
          // cobrança precisa renascer (o cancelamento não encerra a War Room, só
          // dispensou aquela ocorrência). Recriamos com key sufixada (:r2/:r3…),
          // contando as ocorrências anteriores, de forma determinística. (Difere
          // de onboarding-30d, cuja key cancelada NÃO renasce — lá o cancelamento
          // é uma decisão sobre o processo, não uma ocorrência de janela.)
          const baseKey = `auto:warroom-diagnostico:${p.id}`
          const prior = await prisma.task.findMany({
            where: { idempotencyKey: { startsWith: baseKey } },
            select: { status: true },
          })
          const anyLive = prior.some((t) => t.status !== 'CANCELADO')
          if (!anyLive) {
            const idempotencyKey = prior.length === 0 ? baseKey : `${baseKey}:r${prior.length + 1}`
            await prisma.task.create({
              data: {
                title: `Preencher diagnóstico da War Room até quarta — ${p.client.name}`,
                description: 'A War Room deste cliente ainda não tem diagnóstico do gestor. Preencha o diagnóstico (situação, hipótese e teste) até quarta para a call de quinta.',
                type: 'WAR_ROOM',
                priority: 'ALTA',
                status: 'A_FAZER',
                statusId: statusIdFor('A_FAZER'),
                origin: 'AUTOMACAO',
                clientId: p.clientId,
                assignedTo: assignee,
                areaId: 'area_war',
                popId: 'pop_war_14',
                requestedAt: new Date(),
                dueDate: nextWednesday(new Date()),
                requiresEvidence: false,
                idempotencyKey,
                activities: { create: { actorId: null, action: 'created' } },
              },
            })
            diagnosticoChaseTasks++
          }
        }
      }
      // ── 1. Revisão semanal em atraso ──────────────────────────────────────
      const lastReview = p.lastReviewedAt ? new Date(p.lastReviewedAt).getTime() : null
      const reference = lastReview ?? new Date(p.activatedAt).getTime()
      if (reference <= reviewCutoff) {
        if (!(await hasRecentAlert(p.clientId, AlertType.WARROOM_NO_REVIEW))) {
          const days = Math.floor((now - reference) / 86_400_000)
          await prisma.alert.create({
            data: {
              clientId: p.clientId,
              type: AlertType.WARROOM_NO_REVIEW,
              title: `War Room sem revisão há ${days} dias: ${p.client.name}`,
              body: `A War Room de ${p.client.name} não é revisada há ${days} dias. Registre a revisão semanal (critério atingido ou não) para manter o acompanhamento.`,
            },
          })
          reviewAlerts++
        }
      }

      // ── 2. Monitoramento do critério de saída ─────────────────────────────
      if (p.exitMetric && p.exitTarget != null) {
        const latest = await prisma.healthScore.findFirst({
          where: { clientId: p.clientId, metric: p.exitMetric, period: 'WEEKLY' },
          orderBy: { periodStart: 'desc' },
          select: { actualValue: true, periodStart: true },
        })

        if (latest) {
          const actual = Number(latest.actualValue)
          const target = Number(p.exitTarget)
          const met = LOWER_IS_BETTER.has(p.exitMetric)
            ? actual <= target
            : actual >= target

          if (met && p.exitMetAt == null) {
            await prisma.criticalProtocol.update({
              where: { id: p.id },
              data: { exitMetAt: new Date() },
            })
            if (!(await hasRecentAlert(p.clientId, AlertType.WARROOM_EXIT_CRITERIA_MET))) {
              await prisma.alert.create({
                data: {
                  clientId: p.clientId,
                  type: AlertType.WARROOM_EXIT_CRITERIA_MET,
                  title: `Critério de saída atingido: ${p.client.name}`,
                  body: `${p.exitMetric} chegou a ${actual} (alvo ${target}). Avalie encerrar a War Room de ${p.client.name}.`,
                },
              })
              exitMetAlerts++
            }
          } else if (!met && p.exitMetAt != null) {
            await prisma.criticalProtocol.update({
              where: { id: p.id },
              data: { exitMetAt: null },
            })
            if (!(await hasRecentAlert(p.clientId, AlertType.WARROOM_REGRESSION))) {
              await prisma.alert.create({
                data: {
                  clientId: p.clientId,
                  type: AlertType.WARROOM_REGRESSION,
                  title: `Critério de saída em regressão: ${p.client.name}`,
                  body: `${p.exitMetric} voltou a ${actual} (alvo ${target}). A War Room de ${p.client.name} deixou de cumprir o critério.`,
                },
              })
              regressionAlerts++
            }
          }
        }
      }
    } catch (err) {
      console.error(`[warroom-monitor] falha no protocolo ${p.id}:`, err)
    }
  }

  return {
    checked: protocols.length,
    reviewAlerts,
    exitMetAlerts,
    regressionAlerts,
    diagnosticoChaseTasks,
  }
}
