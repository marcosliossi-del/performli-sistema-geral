/**
 * Recorrência AGENDADA por task (D-010, mode 'schedule') — missão A5 §1.
 *
 * Diferente do modo 'onComplete' (que clona ao concluir, em updateTaskStatus),
 * o modo 'schedule' gera a próxima ocorrência POR DATA, independente de
 * conclusão. Roda no cron dedicado de recorrências (/api/cron/recurrences),
 * NÃO no daily — audit §3: "recorrência NÃO roda no daily, é cron dedicado".
 *
 * ── Modelo (documentado no handoff fase-5-a5 §2) ─────────────────────────────
 * A task que carrega `recurrenceRule.mode==='schedule'` é a SÉRIE. O seu
 * `dueDate` é a data da PRÓXIMA ocorrência a materializar. A cada execução:
 *   - se occurrenceKey(dueDate) <= hoje (SP) → materializa a ocorrência (clone
 *     INERTE, sem regra — carryRule:false) e avança o dueDate da série para a
 *     próxima ocorrência (computeNextOccurrence). Um loop com CAP cobre dias
 *     perdidos (cron falho) sem estourar.
 *   - a ocorrência NÃO herda a regra → não vira um segundo gerador (anti-explosão).
 *   - parar a série = concluir/cancelar a task-fonte ou limpar a recorrência.
 *
 * Idempotência (missão A5 §1): idempotencyKey `recur:{taskId}:{yyyy-mm-dd}`
 * (compartilhada com o on-complete). Rodar 3× no mesmo dia = zero duplicata —
 * garantido pela chave @unique (colisão P2002 → `pulada`) E pelo avanço do
 * dueDate (a 2ª/3ª execução já vê a série no futuro). try/catch POR task;
 * AutomationLog por resultado; `lastRunAt` da própria task via `updatedAt`.
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { parseRecurrenceRule, computeNextOccurrence } from '@/lib/tasks/recurrence'
import {
  createRecurrenceOccurrence,
  occurrenceKey,
  type RecurSourceTask,
} from '@/lib/tasks/recurClone'

// Trava anti-loop: no pior caso (cron parado por muito tempo) materializa no
// máximo N ocorrências atrasadas por série por execução; o resto entra na
// próxima rodada. Também protege contra regra degenerada que não avança a data.
const MAX_CATCHUP_PER_TASK = 60

export type ScheduledRecurrenceResult = {
  verificadas: number
  criadas: number
  puladas: number
  falhas: number
}

// Seleção enxuta = campos do RecurSourceTask + id/dueDate/createdAt/recurrenceRule.
const SELECT = {
  id: true,
  title: true,
  description: true,
  type: true,
  priority: true,
  clientId: true,
  assignedTo: true,
  areaId: true,
  popId: true,
  isSupport: true,
  supportDirection: true,
  supportCategory: true,
  requiresEvidence: true,
  requiresReview: true,
  reviewerId: true,
  riskScore: true,
  sourcePopCode: true,
  tags: true,
  dueDate: true,
  createdAt: true,
  recurrenceRule: true,
  checklist: { select: { label: true, required: true, order: true } },
  auxAssignees: { select: { userId: true } },
} satisfies Prisma.TaskSelect

export async function runScheduledTaskRecurrences(
  opts: { now?: Date } = {},
): Promise<ScheduledRecurrenceResult> {
  const now = opts.now ?? new Date()
  const todayKey = occurrenceKey(now)

  // Tasks com regra individual (JSONB not null — sintaxe Prisma 7 para "não é
  // DB NULL"). Séries concluídas/canceladas não geram mais (ver handoff).
  const tasks = await prisma.task.findMany({
    where: {
      recurrenceRule: { not: Prisma.DbNull },
      status: { notIn: ['CANCELADO', 'CONCLUIDO'] },
    },
    select: SELECT,
  })

  let verificadas = 0
  let criadas = 0
  let puladas = 0
  let falhas = 0

  for (const t of tasks) {
    const rule = parseRecurrenceRule(t.recurrenceRule)
    if (!rule || rule.mode !== 'schedule') continue // só mode 'schedule'
    verificadas++

    try {
      const source: RecurSourceTask = {
        id: t.id,
        title: t.title,
        description: t.description,
        type: t.type,
        priority: t.priority,
        clientId: t.clientId,
        assignedTo: t.assignedTo,
        areaId: t.areaId,
        popId: t.popId,
        isSupport: t.isSupport,
        supportDirection: t.supportDirection,
        supportCategory: t.supportCategory,
        requiresEvidence: t.requiresEvidence,
        requiresReview: t.requiresReview,
        reviewerId: t.reviewerId,
        riskScore: t.riskScore,
        sourcePopCode: t.sourcePopCode,
        tags: t.tags,
        checklist: t.checklist,
        auxAssignees: t.auxAssignees,
      }

      // Âncora = data da próxima ocorrência a materializar (dueDate). Sem
      // Série sem dueDate: âncora = AGORA (materializa a 1ª ocorrência hoje).
      // Ancorar no createdAt faria backfill de ocorrências vencidas (ruído).
      let anchor = t.dueDate ?? new Date()
      let iterations = 0
      let produced = false

      while (occurrenceKey(anchor) <= todayKey && iterations < MAX_CATCHUP_PER_TASK) {
        iterations++
        const res = await createRecurrenceOccurrence({
          source,
          rule,
          dueDate: anchor,
          actorId: null, // sistema/cron
          carryRule: false, // ocorrência inerte (anti-explosão)
        })

        if (res.outcome === 'created') {
          criadas++
          await prisma.automationLog
            .create({
              data: {
                clientId: t.clientId,
                createdTaskId: res.taskId,
                status: 'SUCESSO',
                reason: `Ocorrência agendada criada (${res.idempotencyKey})`,
              },
            })
            .catch(() => {})
        } else {
          puladas++
          await prisma.automationLog
            .create({
              data: {
                clientId: t.clientId,
                status: 'DUPLICIDADE_EVITADA',
                reason: `Ocorrência já existente (${res.idempotencyKey})`,
              },
            })
            .catch(() => {})
        }

        anchor = computeNextOccurrence(rule, anchor)
        produced = true
      }

      // Avança o dueDate da série para a próxima ocorrência futura (evita
      // reprocessar no mesmo dia e faz a série progredir). Registra a última
      // execução da série via `updatedAt` (regra de ouro #9 / CLAUDE.md #9).
      if (produced) {
        await prisma.task.update({ where: { id: t.id }, data: { dueDate: anchor } })
      }
    } catch (err) {
      falhas++
      await prisma.automationLog
        .create({
          data: {
            clientId: t.clientId ?? null,
            status: 'FALHA',
            reason: `Recorrência agendada da task ${t.id}: ${err instanceof Error ? err.message : String(err)}`,
          },
        })
        .catch(() => {})
    }
  }

  return { verificadas, criadas, puladas, falhas }
}
