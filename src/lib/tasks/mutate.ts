import 'server-only'
import { prisma } from '@/lib/prisma'
import { assertClientMutationAccess, writeAuditLog } from '@/lib/audit'
import { statusIdFor } from './statusMap'
import type { Prisma, TaskStatus } from '@prisma/client'

type SessionLike = { userId: string; role: string }

/** Patch de campos escalares da Task (sem relações). */
export type TaskFieldPatch = Omit<
  Prisma.TaskUncheckedUpdateInput,
  'activities' | 'checklist' | 'comments' | 'attachments' | 'watchers' | 'approvals' | 'customValues' | 'auxAssignees' | 'dependsOn' | 'blocks' | 'subtasks' | 'id'
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
 *  2. valida papel + posse via assertClientMutationAccess(allowCS:true) quando há clientId;
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
): Promise<MutateResult> {
  const current = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, clientId: true, status: true },
  })
  if (!current) return { error: 'Tarefa não encontrada.' }

  if (current.clientId) {
    try {
      await assertClientMutationAccess(session, current.clientId, { allowCS: true })
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
