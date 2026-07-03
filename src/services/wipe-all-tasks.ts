import 'server-only'
import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'

/**
 * RECOMEÇO TOTAL da operação de tarefas (decisão do Marcos, jul/2026).
 *
 * Zera TODO o conteúdo operacional de tarefas para reescrever do zero:
 *   - Task (inclui o "hub de suporte" — tarefas importadas do ClickUp são Tasks)
 *   - TaskRecurrenceRule (as regras de recorrência do Motor A)
 *   - TaskTemplate (os templates + seus steps/fields via cascade)
 *
 * O QUE É PRESERVADO (regra CLAUDE.md #12 — "manter o histórico"):
 *   - AuditLog e AutomationLog permanecem intactos. AutomationLog.createdTaskId
 *     é String solta (sem FK), então sobrevive com o valor. AutomationLog.recurrenceId
 *     é relação opcional (onDelete padrão SetNull): o vínculo é anulado, mas a
 *     linha do log de execução continua lá.
 *
 * ORDEM DOS DELETES (Task.templateId e TaskRecurrenceRule.templateId são
 * relações opcionais → onDelete padrão SetNull; apagar na ordem certa evita
 * deixar templates órfãos vinculados e mantém a operação previsível):
 *   1. Task          → cascata remove aux/watchers/checklist/comments/attachments/
 *                      activity/dependencies/approvals/customFieldValues.
 *   2. TaskRecurrenceRule → solta o FK p/ TaskTemplate (e anula recurrenceId nos logs).
 *   3. TaskTemplate  → cascata remove TaskTemplateStep/TaskTemplateField.
 *
 * IRREVERSÍVEL. Só ADMIN. Numa transação única (tudo-ou-nada).
 */
export type WipeAllTasksResult = {
  tasksDeleted: number
  recurrenceRulesDeleted: number
  templatesDeleted: number
}

export async function wipeAllTasks(actor: {
  actorId: string
  actorRole: string
}): Promise<WipeAllTasksResult> {
  const result = await prisma.$transaction(async (tx) => {
    const tasks = await tx.task.deleteMany({})
    const rules = await tx.taskRecurrenceRule.deleteMany({})
    const templates = await tx.taskTemplate.deleteMany({})
    return {
      tasksDeleted: tasks.count,
      recurrenceRulesDeleted: rules.count,
      templatesDeleted: templates.count,
    }
  })

  await writeAuditLog({
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    action: 'tasks.wipeAll',
    entityType: 'Task',
    entityId: 'bulk',
    metadata: {
      tasksDeleted: result.tasksDeleted,
      recurrenceRulesDeleted: result.recurrenceRulesDeleted,
      templatesDeleted: result.templatesDeleted,
      motivo: 'Recomeço total da operação de tarefas (reescrita do zero)',
    },
  })

  return result
}
