import 'server-only'
import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import { assertCan } from '@/lib/permissions'
import { statusIdFor } from './statusMap'
import type { Prisma, TaskStatus } from '@prisma/client'

type SessionLike = { userId: string; role: string }

/**
 * Patch de campos EDITÁVEIS da Task (allow-list — security-review R:
 * mass assignment). Campos sensíveis (clientId, statusId, idempotencyKey,
 * requesterId, origin, isSupport, requires*, riskScore) ficam FORA por tipo:
 * quem precisa mudá-los usa fluxo próprio, nunca o patch genérico.
 * `status`+`statusId` são espelhados internamente pelo mutateTask (D-004).
 */
export type TaskFieldPatch = Pick<
  Prisma.TaskUncheckedUpdateInput,
  | 'title' | 'description' | 'assignedTo' | 'dueDate' | 'startDate'
  | 'priority' | 'status' | 'supportCategory' | 'supportDirection'
  | 'tags' | 'orderIndex' | 'recurrenceRule' | 'evidence' | 'completionNotes'
  | 'blockReason' | 'delayReason' | 'completedAt' | 'completedById'
>

export type ActivityEntry = {
  action: string
  fromValue?: string | null
  toValue?: string | null
}

export type MutateResult = { ok: true } | { error: string }

/**
 * Helper transacional ÚNICO de mutação de Task (contrato 3.3):
 *  1. carrega a task (com clientId + status);
 *  2. valida papel + posse via assertCan('task.write') — com clientId delega a
 *     assertClientMutationAccess(allowCS:true); sem clientId barra ANALYST;
 *  3. update + TaskActivity(s) na MESMA prisma.$transaction;
 *  4. escreve o espelho `statusId` (statusMap) sempre que `patch.status` estiver presente (D-004);
 *  5. grava AuditLog (best-effort, fora da transação — nunca derruba a mutação).
 *
 * NUNCA lança para o cliente: retorna `{ ok:true } | { error }` (o assert é
 * capturado e traduzido). Escrever Activity é OBRIGATÓRIO (regra de ouro #7).
 */
export async function mutateTask(
  taskId: string,
  session: SessionLike,
  patch: TaskFieldPatch,
  activity: ActivityEntry | ActivityEntry[],
  /**
   * Operações adicionais anexadas à MESMA prisma.$transaction do update
   * (ex.: reconciliar TaskAuxAssignee ao trocar o responsável principal — D-005).
   */
  extraOps: Prisma.PrismaPromise<unknown>[] = [],
): Promise<MutateResult> {
  const current = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, clientId: true, status: true, assignedTo: true },
  })
  if (!current) return { error: 'Tarefa não encontrada.' }

  // Papel + posse SEMPRE (CLAUDE.md #2): com clientId delega a
  // assertClientMutationAccess; sem clientId (task interna/de lead) o
  // assertCan barra papéis sem permissão de escrita (ex.: ANALYST). Exceção:
  // task interna atribuída ao próprio usuário (executar o próprio trabalho).
  const ownClientlessTask = !current.clientId && current.assignedTo === session.userId
  if (!ownClientlessTask) {
    try {
      await assertCan(session, 'task.write', { clientId: current.clientId ?? undefined })
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Sem permissão para esta tarefa.' }
    }
  }

  // Espelho de status (D-004): se o patch muda o enum, sincroniza a FK statusId.
  const data: Prisma.TaskUncheckedUpdateInput = { ...patch }
  if (patch.status !== undefined && patch.status !== null) {
    data.statusId = statusIdFor(patch.status as TaskStatus)
  }

  const activities = Array.isArray(activity) ? activity : [activity]

  try {
    await prisma.$transaction([
      prisma.task.update({ where: { id: taskId }, data }),
      ...activities.map((a) =>
        prisma.taskActivity.create({
          data: {
            taskId,
            actorId: session.userId,
            action: a.action,
            fromValue: a.fromValue ?? null,
            toValue: a.toValue ?? null,
          },
        }),
      ),
      ...extraOps,
    ])
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Falha ao atualizar a tarefa.' }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: activities.map((a) => a.action).join(','),
    entityType: 'Task',
    entityId: taskId,
    clientId: current.clientId,
    metadata: { activities: activities.map((a) => a.action) },
  })

  return { ok: true }
}
