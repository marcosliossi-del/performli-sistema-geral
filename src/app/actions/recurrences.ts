'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { writeAuditLog } from '@/lib/audit'
import { RecurrenceFrequency } from '@prisma/client'

type ActionResult = { ok: true } | { error: string }
type ToggleResult = ActionResult

// Papéis que o MOTOR sabe distribuir por cliente ativo (espelha
// CLIENT_FANOUT_ROLES do recurrence-engine). ADMIN/ANALYST não geram tarefas.
const FANOUT_ROLES = new Set(['GESTOR', 'MANAGER', 'CS', 'CRM', 'SUPERVISOR', 'HEAD'])

const VALID_FREQUENCIES = new Set<string>(Object.values(RecurrenceFrequency))

// Payload de edição — todos os campos opcionais (edição parcial).
export type UpdateRecurrenceInput = {
  frequency?: string
  dayOfWeek?: number | null
  dayOfMonth?: number | null
  hour?: number | null
  minute?: number | null
  defaultAssigneeRole?: string
  templateId?: string
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v)
}

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
 * Edita o agendamento e o destino de uma regra de recorrência. Somente ADMIN —
 * mexer no agendamento muda a geração de tarefas de toda a agência. Corrige
 * regras mal configuradas que antes ficavam presas (só dava para pausar).
 *
 * Valida cada campo contra a régua real do motor. O papel de destino mora no
 * TaskTemplate (defaultAssigneeRole), então editar o papel atualiza o template
 * vinculado. AuditLog registra before/after apenas dos campos que mudaram.
 */
export async function updateRecurrenceRule(
  ruleId: string,
  input: UpdateRecurrenceInput,
): Promise<ActionResult> {
  const session = await requireSession()

  if (session.role !== 'ADMIN') {
    return { error: 'Apenas o administrador pode editar recorrências.' }
  }

  const rule = await prisma.taskRecurrenceRule.findUnique({
    where: { id: ruleId },
    select: {
      id: true,
      frequency: true,
      dayOfWeek: true,
      dayOfMonth: true,
      hour: true,
      minute: true,
      templateId: true,
      template: { select: { id: true, defaultAssigneeRole: true } },
    },
  })
  if (!rule) {
    return { error: 'Recorrência não encontrada.' }
  }

  // ── Validação campo a campo (linguagem operacional) ───────────────────────
  const ruleData: {
    frequency?: RecurrenceFrequency
    dayOfWeek?: number | null
    dayOfMonth?: number | null
    hour?: number | null
    minute?: number | null
    templateId?: string
  } = {}

  if (input.frequency !== undefined) {
    if (!VALID_FREQUENCIES.has(input.frequency)) {
      return { error: 'Frequência inválida — escolha uma das opções disponíveis.' }
    }
    ruleData.frequency = input.frequency as RecurrenceFrequency
  }

  if (input.dayOfWeek !== undefined) {
    if (input.dayOfWeek !== null && (!isInt(input.dayOfWeek) || input.dayOfWeek < 0 || input.dayOfWeek > 6)) {
      return { error: 'Dia da semana inválido — use domingo a sábado.' }
    }
    ruleData.dayOfWeek = input.dayOfWeek
  }

  if (input.dayOfMonth !== undefined) {
    if (input.dayOfMonth !== null && (!isInt(input.dayOfMonth) || input.dayOfMonth < 1 || input.dayOfMonth > 31)) {
      return { error: 'Dia do mês inválido — use um valor entre 1 e 31.' }
    }
    ruleData.dayOfMonth = input.dayOfMonth
  }

  if (input.hour !== undefined) {
    if (input.hour !== null && (!isInt(input.hour) || input.hour < 0 || input.hour > 23)) {
      return { error: 'Hora inválida — use um valor entre 0 e 23.' }
    }
    ruleData.hour = input.hour
  }

  if (input.minute !== undefined) {
    if (input.minute !== null && (!isInt(input.minute) || input.minute < 0 || input.minute > 59)) {
      return { error: 'Minuto inválido — use um valor entre 0 e 59.' }
    }
    ruleData.minute = input.minute
  }

  // Papel de destino: precisa gerar tarefas (fan-out por cliente).
  let roleChange: { before: string | null; after: string } | null = null
  if (input.defaultAssigneeRole !== undefined) {
    if (!FANOUT_ROLES.has(input.defaultAssigneeRole)) {
      return { error: 'Esse papel não gera tarefas por cliente — escolha Gestor, CS, CRM, Supervisor ou Head.' }
    }
    if (!rule.template) {
      return { error: 'Esta regra não tem modelo de tarefa vinculado — não é possível definir o responsável.' }
    }
    roleChange = { before: rule.template.defaultAssigneeRole, after: input.defaultAssigneeRole }
  }

  // Troca de modelo de tarefa: precisa existir e estar ativo.
  if (input.templateId !== undefined && input.templateId !== rule.templateId) {
    const tpl = await prisma.taskTemplate.findUnique({
      where: { id: input.templateId },
      select: { id: true, active: true },
    })
    if (!tpl) {
      return { error: 'Modelo de tarefa não encontrado.' }
    }
    if (!tpl.active) {
      return { error: 'Esse modelo de tarefa está desativado — reative o modelo ou escolha outro.' }
    }
    ruleData.templateId = input.templateId
  }

  // ── Monta before/after só dos campos que realmente mudaram ────────────────
  // Tipado como valores JSON concretos (não unknown): writeAuditLog exige
  // Prisma.InputJsonValue e `unknown` não é atribuível a ele no build real.
  const before: Record<string, string | number | null> = {}
  const after: Record<string, string | number | null> = {}
  const fields = ['frequency', 'dayOfWeek', 'dayOfMonth', 'hour', 'minute', 'templateId'] as const
  for (const f of fields) {
    const novo = ruleData[f]
    if (novo !== undefined && novo !== rule[f]) {
      before[f] = rule[f]
      after[f] = novo
    }
  }
  if (roleChange && roleChange.before !== roleChange.after) {
    before.defaultAssigneeRole = roleChange.before
    after.defaultAssigneeRole = roleChange.after
  }

  if (Object.keys(after).length === 0) {
    return { ok: true } // nada mudou
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(ruleData).length > 0) {
      await tx.taskRecurrenceRule.update({ where: { id: ruleId }, data: ruleData })
    }
    if (roleChange && rule.template && roleChange.before !== roleChange.after) {
      await tx.taskTemplate.update({
        where: { id: rule.template.id },
        data: { defaultAssigneeRole: roleChange.after },
      })
    }
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'recurrence.update',
    entityType: 'TaskRecurrenceRule',
    entityId: ruleId,
    metadata: { before, after },
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
