'use server'

import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { writeAuditLog } from '@/lib/audit'
import { parseRecurrenceRule } from '@/lib/tasks/recurrence'

type ActionResult = { ok: true } | { error: string }

/**
 * Encerra a SÉRIE de recorrência por task (D-010, Motor B). Remove APENAS a
 * `recurrenceRule` da task-fonte — a task em si permanece intacta (título,
 * histórico, ocorrências já criadas). Depois disso ela deixa de regenerar
 * (onComplete) / de materializar por data (schedule).
 *
 * Somente ADMIN: /recorrencias controla a geração automática de tarefas de toda
 * a agência. Nesta fatia NÃO há edição da regra (o shape Json é variado —
 * freq/interval/byWeekday/mode/skipWeekends); só o encerramento é oferecido.
 *
 * Anular uma coluna Json no Prisma exige `Prisma.DbNull` (grava DB NULL). Passar
 * `Prisma.JsonNull` gravaria o literal JSON `null` — semanticamente diferente e
 * o schedule/on-complete continuariam tratando a task como fonte.
 */
export async function removeTaskRecurrence(taskId: string): Promise<ActionResult> {
  const session = await requireSession()

  if (session.role !== 'ADMIN') {
    return { error: 'Apenas o administrador pode encerrar recorrências por tarefa.' }
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, clientId: true, recurrenceRule: true },
  })
  if (!task) {
    return { error: 'Tarefa não encontrada.' }
  }
  if (task.recurrenceRule == null) {
    return { error: 'Esta tarefa não tem recorrência própria para encerrar.' }
  }

  const rule = parseRecurrenceRule(task.recurrenceRule)

  await prisma.task.update({
    where: { id: taskId },
    // Prisma.DbNull = grava NULL na coluna Json (anula de verdade). NÃO usar
    // JsonNull (gravaria o literal `null` e a task seguiria sendo fonte).
    data: { recurrenceRule: Prisma.DbNull },
  })

  // metadata com valores JSON concretos (string), nunca `unknown`.
  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'task.recurrence.removed',
    entityType: 'Task',
    entityId: taskId,
    clientId: task.clientId,
    metadata: {
      title: task.title,
      mode: rule?.mode ?? 'desconhecido',
      freq: rule?.freq ?? 'desconhecido',
      interval: rule?.interval ?? 0,
    },
  })

  revalidatePath('/recorrencias')
  return { ok: true }
}
