import { Prisma } from '@prisma/client'
import type { TaskType, TaskPriority, SupportDirection, SupportCategory } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { statusIdFor } from '@/lib/tasks/statusMap'
import { DEFAULT_TZ, type RecurrenceRule } from '@/lib/tasks/recurrence'

/**
 * Montagem COMPARTILHADA do clone de recorrência por task (D-010).
 *
 * Usado nos DOIS caminhos, sem duplicação (missão A5 §1):
 *  - on-complete (updateTaskStatus): clona ao concluir uma task mode 'onComplete';
 *  - schedule (runScheduledTaskRecurrences / cron): materializa a ocorrência do
 *    dia de uma task mode 'schedule', independente de conclusão.
 *
 * Dedupe compartilhado: idempotencyKey `recur:{sourceTaskId}:{yyyy-mm-dd}` (MESMO
 * formato nos dois modos). A data é sempre derivada de `dueDate` na TZ alvo
 * (America/Sao_Paulo, D-006) — nunca da data-máquina.
 *
 * Idempotência forte: findUnique + tratamento de colisão P2002 no create como
 * `skipped` (nunca `failed`) — rodar o cron N vezes no mesmo dia = zero duplicata.
 */

/** Campos da task-fonte necessários para clonar a próxima ocorrência. */
export type RecurSourceTask = {
  id: string
  title: string
  description: string | null
  type: TaskType
  priority: TaskPriority
  clientId: string | null
  assignedTo: string
  areaId: string | null
  popId: string | null
  isSupport: boolean
  supportDirection: SupportDirection | null
  supportCategory: SupportCategory | null
  requiresEvidence: boolean
  requiresReview: boolean
  reviewerId: string | null
  riskScore: number | null
  sourcePopCode: string | null
  tags: string[]
  checklist: { label: string; required: boolean; order: number }[]
  auxAssignees: { userId: string }[]
}

/** Data da ocorrência em `yyyy-mm-dd` na TZ alvo (chave de dedupe estável). */
export function occurrenceKey(date: Date, tz: string = DEFAULT_TZ): string {
  return date.toLocaleDateString('en-CA', { timeZone: tz })
}

/** Chave de dedupe compartilhada on-complete ↔ schedule. */
export function recurIdempotencyKey(sourceTaskId: string, occ: string): string {
  return `recur:${sourceTaskId}:${occ}`
}

export type RecurOccurrenceOutcome = {
  outcome: 'created' | 'skipped'
  idempotencyKey: string
  taskId?: string
}

/**
 * Cria (idempotente) a próxima ocorrência de uma task recorrente.
 *
 * @param carryRule  true = a ocorrência HERDA a regra (on-complete: a cadeia
 *   avança 1 a 1, cada conclusão gera a próxima — sem explosão porque é gated
 *   pela conclusão). false = ocorrência INERTE, sem regra (schedule: a série é
 *   gerada por data pela task-fonte; se a ocorrência herdasse a regra viraria
 *   um segundo gerador → explosão diária).
 *
 * NÃO grava AutomationLog nem faz try/catch de topo — cada caller decide o log
 * e o tratamento de falha por item (missão A5). Só a colisão de idempotência
 * (P2002) é absorvida aqui como `skipped`.
 */
export async function createRecurrenceOccurrence(params: {
  source: RecurSourceTask
  rule: RecurrenceRule
  dueDate: Date
  actorId: string | null
  carryRule: boolean
}): Promise<RecurOccurrenceOutcome> {
  const { source, rule, dueDate, actorId, carryRule } = params
  const occ = occurrenceKey(dueDate)
  const idempotencyKey = recurIdempotencyKey(source.id, occ)

  const exists = await prisma.task.findUnique({ where: { idempotencyKey }, select: { id: true } })
  if (exists) return { outcome: 'skipped', idempotencyKey }

  try {
    const created = await prisma.task.create({
      data: {
        title: source.title,
        description: source.description,
        type: source.type,
        priority: source.priority,
        status: 'A_FAZER',
        statusId: statusIdFor('A_FAZER'), // espelho FK (D-004)
        origin: 'RECORRENCIA',
        clientId: source.clientId,
        assignedTo: source.assignedTo,
        areaId: source.areaId,
        popId: source.popId,
        isSupport: source.isSupport,
        supportDirection: source.supportDirection,
        supportCategory: source.supportCategory,
        // Flags do TaskCompletionGuard acompanham a recorrência: task crítica
        // regenerada continua exigindo evidência/validação.
        requiresEvidence: source.requiresEvidence,
        requiresReview: source.requiresReview,
        reviewerId: source.reviewerId,
        riskScore: source.riskScore,
        sourcePopCode: source.sourcePopCode,
        tags: source.tags,
        dueDate,
        requesterId: actorId, // null = sistema/cron (coluna opcional)
        requestedAt: new Date(),
        idempotencyKey,
        ...(carryRule ? { recurrenceRule: rule as unknown as Prisma.InputJsonValue } : {}),
        ...(source.checklist.length
          ? { checklist: { create: source.checklist.map((c) => ({ label: c.label, required: c.required, order: c.order, done: false })) } }
          : {}),
        ...(source.auxAssignees.length
          ? { auxAssignees: { create: source.auxAssignees.map((a) => ({ userId: a.userId })) } }
          : {}),
        activities: { create: { actorId, action: 'recurred', fromValue: source.id } },
      },
      select: { id: true },
    })
    return { outcome: 'created', idempotencyKey, taskId: created.id }
  } catch (err) {
    // Corrida entre duas execuções simultâneas do cron: a idempotencyKey @unique
    // colide (P2002). Não é falha — a ocorrência já foi criada pela outra execução.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { outcome: 'skipped', idempotencyKey }
    }
    throw err
  }
}
