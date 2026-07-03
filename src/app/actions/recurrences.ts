'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { writeAuditLog } from '@/lib/audit'

type ActionResult = { ok: true } | { error: string }
type ToggleResult = ActionResult

// Payload de edição — todos os campos opcionais (edição parcial).
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

/**
 * Arquiva uma regra: para de gerar tarefas e sai da lista padrão. NÃO apaga —
 * o histórico (tarefas geradas, AutomationLog) é preservado. Somente ADMIN.
 */
export async function archiveRecurrenceRule(ruleId: string): Promise<ActionResult> {
  const session = await requireSession()

  if (session.role !== 'ADMIN') {
    return { error: 'Apenas o administrador pode arquivar recorrências.' }
  }

  const rule = await prisma.taskRecurrenceRule.findUnique({
    where: { id: ruleId },
    select: { id: true, archivedAt: true },
  })
  if (!rule) {
    return { error: 'Recorrência não encontrada.' }
  }
  if (rule.archivedAt) {
    return { error: 'Esta recorrência já está arquivada.' }
  }

  // Arquivar também pausa (active=false): regra arquivada nunca roda.
  await prisma.taskRecurrenceRule.update({
    where: { id: ruleId },
    data: { archivedAt: new Date(), active: false },
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'recurrence.archive',
    entityType: 'TaskRecurrenceRule',
    entityId: ruleId,
    metadata: { archived: true },
  })

  revalidatePath('/recorrencias')
  return { ok: true }
}

/**
 * Restaura uma regra arquivada. Ela volta para a lista, mas PAUSADA — o admin
 * decide conscientemente quando reativar. Somente ADMIN.
 */
export async function restoreRecurrenceRule(ruleId: string): Promise<ActionResult> {
  const session = await requireSession()

  if (session.role !== 'ADMIN') {
    return { error: 'Apenas o administrador pode restaurar recorrências.' }
  }

  const rule = await prisma.taskRecurrenceRule.findUnique({
    where: { id: ruleId },
    select: { id: true, archivedAt: true },
  })
  if (!rule) {
    return { error: 'Recorrência não encontrada.' }
  }
  if (!rule.archivedAt) {
    return { error: 'Esta recorrência não está arquivada.' }
  }

  await prisma.taskRecurrenceRule.update({
    where: { id: ruleId },
    data: { archivedAt: null },
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'recurrence.restore',
    entityType: 'TaskRecurrenceRule',
    entityId: ruleId,
    metadata: { archived: false },
  })

  revalidatePath('/recorrencias')
  return { ok: true }
}
