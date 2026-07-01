'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { writeAuditLog } from '@/lib/audit'

type ToggleResult = { ok: true } | { error: string }

/**
 * Pausa ou reativa uma regra de recorrência do motor de tarefas.
 * Somente ADMIN — pausar/religar o motor afeta a agência inteira.
 */
export async function toggleRecurrenceRule(
  ruleId: string,
  active: boolean,
): Promise<ToggleResult> {
  const session = await requireSession()

  if (session.role !== 'ADMIN') {
    return { error: 'Apenas o administrador pode pausar ou reativar recorrências.' }
  }

  const rule = await prisma.taskRecurrenceRule.findUnique({
    where: { id: ruleId },
    select: { id: true },
  })
  if (!rule) {
    return { error: 'Recorrência não encontrada.' }
  }

  await prisma.taskRecurrenceRule.update({
    where: { id: ruleId },
    data: { active },
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'recurrence.toggle',
    entityType: 'TaskRecurrenceRule',
    entityId: ruleId,
    metadata: { active },
  })

  revalidatePath('/recorrencias')
  return { ok: true }
}
