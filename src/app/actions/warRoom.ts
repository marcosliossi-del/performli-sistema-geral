'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { assertClientMutationAccess, writeAuditLog } from '@/lib/audit'
import { MetricType, WarRoomOutcome, Prisma } from '@prisma/client'

export type WarRoomPlanInput = {
  diagnosis: string
  exitCriteria: string
  exitMetric?: MetricType | null
  exitTarget?: number | null
  responsibleId: string
  deadline: string // ISO (yyyy-mm-dd)
}

type ActionResult = { ok: true } | { error: string }

/**
 * WAR-14 — Define/atualiza o plano da War Room.
 * Regra inegociável do dossiê: nenhuma War Room avança sem critério de saída
 * mensurável, responsável e prazo. Valida auth + papel + posse e registra AuditLog.
 */
export async function saveWarRoomPlan(
  protocolId: string,
  input: WarRoomPlanInput,
): Promise<ActionResult> {
  const session = await requireSession()

  const protocol = await prisma.criticalProtocol.findUnique({
    where: { id: protocolId },
    select: { id: true, clientId: true, status: true, client: { select: { name: true } } },
  })
  if (!protocol) return { error: 'War Room não encontrada.' }
  if (protocol.status === 'ENCERRADO') {
    return { error: 'Esta War Room já foi encerrada.' }
  }

  // auth + papel + posse (War Room é processo da CS → allowCS)
  try {
    await assertClientMutationAccess(session, protocol.clientId, { allowCS: true })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Sem permissão.' }
  }

  // Validações de evidência mínima (linguagem operacional nas mensagens)
  if (!input.diagnosis?.trim()) {
    return { error: 'Diagnóstico é obrigatório: descreva a hipótese de causa.' }
  }
  if (!input.exitCriteria?.trim()) {
    return { error: 'Critério de saída é obrigatório — nenhuma War Room avança sem ele.' }
  }
  if (!input.responsibleId) {
    return { error: 'Defina o responsável pela War Room.' }
  }
  if (!input.deadline) {
    return { error: 'Defina o prazo da War Room.' }
  }
  const deadline = new Date(input.deadline)
  if (isNaN(deadline.getTime())) {
    return { error: 'Prazo inválido.' }
  }
  if (input.exitTarget != null && (isNaN(input.exitTarget) || input.exitTarget < 0)) {
    return { error: 'Valor-alvo do critério inválido.' }
  }

  // O responsável precisa existir e estar ativo
  const responsible = await prisma.user.findFirst({
    where: { id: input.responsibleId, active: true },
    select: { id: true },
  })
  if (!responsible) return { error: 'Responsável inválido ou inativo.' }

  await prisma.criticalProtocol.update({
    where: { id: protocolId },
    data: {
      diagnosis: input.diagnosis.trim(),
      exitCriteria: input.exitCriteria.trim(),
      exitMetric: input.exitMetric ?? null,
      exitTarget:
        input.exitTarget != null ? new Prisma.Decimal(input.exitTarget) : null,
      responsibleId: input.responsibleId,
      deadline,
      // Plano definido move o protocolo de ATIVADO → EM_EXECUCAO
      ...(protocol.status === 'ATIVADO' ? { status: 'EM_EXECUCAO' as const } : {}),
    },
  })

  // WAR-14 → Central Operacional: a War Room vira uma tarefa CRÍTICA do responsável,
  // visível em /operacional, /meu-dia e na carga por gestor. Idempotente por War Room.
  await upsertWarRoomTask({
    protocolId,
    clientId: protocol.clientId,
    clientName: protocol.client?.name ?? 'Cliente',
    responsibleId: input.responsibleId,
    deadline,
    diagnosis: input.diagnosis.trim(),
    exitCriteria: input.exitCriteria.trim(),
    actorId: session.userId,
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'warroom.set_plan',
    entityType: 'CriticalProtocol',
    entityId: protocolId,
    clientId: protocol.clientId,
    metadata: {
      exitCriteria: input.exitCriteria.trim(),
      responsibleId: input.responsibleId,
      deadline: deadline.toISOString(),
    },
  })

  revalidatePath('/anti-churn')
  revalidatePath('/operacional')
  return { ok: true }
}

/**
 * Cria ou atualiza a tarefa operacional que espelha a War Room (WAR-14).
 * Idempotente: chave `warroom:<protocolId>`. Reaponta responsável/prazo se mudarem.
 */
async function upsertWarRoomTask(args: {
  protocolId: string
  clientId: string
  clientName: string
  responsibleId: string
  deadline: Date
  diagnosis: string
  exitCriteria: string
  actorId: string
}): Promise<void> {
  const idempotencyKey = `warroom:${args.protocolId}`
  const title = `War Room — ${args.clientName}`
  const description = `Diagnóstico: ${args.diagnosis}\n\nCritério de saída: ${args.exitCriteria}`

  const existing = await prisma.task.findUnique({
    where: { idempotencyKey },
    select: { id: true, status: true },
  })

  if (existing) {
    // Não reabre tarefa já concluída/cancelada; apenas atualiza dados do plano.
    await prisma.task.update({
      where: { id: existing.id },
      data: {
        title,
        description,
        assignedTo: args.responsibleId,
        dueDate: args.deadline,
      },
    })
    return
  }

  await prisma.task.create({
    data: {
      title,
      description,
      type: 'WAR_ROOM',
      priority: 'CRITICA',
      status: 'EM_ANDAMENTO',
      origin: 'AUTOMACAO',
      clientId: args.clientId,
      assignedTo: args.responsibleId,
      popId: 'pop_war_14',
      areaId: 'area_war',
      dueDate: args.deadline,
      requesterId: args.actorId,
      requestedAt: new Date(),
      idempotencyKey,
      activities: { create: { actorId: args.actorId, action: 'created' } },
    },
  })
}

/**
 * WAR-14 — Encerra a War Room com um desfecho.
 * Não encerra sem critério de saída definido (evidência mínima).
 */
export async function closeWarRoom(
  protocolId: string,
  outcome: WarRoomOutcome,
): Promise<ActionResult> {
  const session = await requireSession()

  const protocol = await prisma.criticalProtocol.findUnique({
    where: { id: protocolId },
    select: { id: true, clientId: true, exitCriteria: true, status: true },
  })
  if (!protocol) return { error: 'War Room não encontrada.' }
  if (protocol.status === 'ENCERRADO') {
    return { error: 'Esta War Room já está encerrada.' }
  }

  try {
    await assertClientMutationAccess(session, protocol.clientId, { allowCS: true })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Sem permissão.' }
  }

  if (!protocol.exitCriteria?.trim()) {
    return { error: 'Defina o critério de saída antes de encerrar a War Room.' }
  }

  await prisma.criticalProtocol.update({
    where: { id: protocolId },
    data: {
      status: 'ENCERRADO',
      closedAt: new Date(),
      closedOutcome: outcome,
      ...(outcome === 'RESOLVIDO_POSITIVO' ? { exitMetAt: new Date() } : {}),
    },
  })

  // Fecha a tarefa operacional espelho da War Room, se existir e ainda aberta.
  const linked = await prisma.task.findUnique({
    where: { idempotencyKey: `warroom:${protocolId}` },
    select: { id: true, status: true },
  })
  if (linked && linked.status !== 'CONCLUIDO' && linked.status !== 'CANCELADO') {
    const newStatus = outcome === 'RESOLVIDO_POSITIVO' ? 'CONCLUIDO' : 'CANCELADO'
    await prisma.task.update({
      where: { id: linked.id },
      data: {
        status: newStatus,
        ...(newStatus === 'CONCLUIDO' ? { completedAt: new Date(), completedById: session.userId } : {}),
        activities: { create: { actorId: session.userId, action: 'status_changed', fromValue: linked.status, toValue: newStatus } },
      },
    })
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'warroom.close',
    entityType: 'CriticalProtocol',
    entityId: protocolId,
    clientId: protocol.clientId,
    metadata: { outcome },
  })

  revalidatePath('/anti-churn')
  revalidatePath('/operacional')
  return { ok: true }
}

/**
 * WAR-16 — Registra a revisão semanal de uma War Room.
 * Marca lastReviewedAt (limpa o alerta de "sem revisão"). Se `met`, registra que
 * o critério de saída foi atingido (exitMetAt) e move para MONITORANDO.
 */
export async function registerWarRoomReview(
  protocolId: string,
  met: boolean,
  note?: string,
): Promise<ActionResult> {
  const session = await requireSession()

  const protocol = await prisma.criticalProtocol.findUnique({
    where: { id: protocolId },
    select: { id: true, clientId: true, status: true, exitCriteria: true, notes: true },
  })
  if (!protocol) return { error: 'War Room não encontrada.' }
  if (protocol.status === 'ENCERRADO') {
    return { error: 'Esta War Room já foi encerrada.' }
  }

  try {
    await assertClientMutationAccess(session, protocol.clientId, { allowCS: true })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Sem permissão.' }
  }

  if (!protocol.exitCriteria?.trim()) {
    return { error: 'Defina o critério de saída antes de registrar revisões.' }
  }

  const now = new Date()
  const appendedNote = note?.trim()
    ? `${protocol.notes ? protocol.notes + '\n' : ''}[${now.toLocaleDateString('pt-BR')}] Revisão: ${note.trim()}`
    : protocol.notes

  await prisma.criticalProtocol.update({
    where: { id: protocolId },
    data: {
      lastReviewedAt: now,
      notes: appendedNote,
      ...(met ? { exitMetAt: now, status: 'MONITORANDO' as const } : {}),
    },
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'warroom.review',
    entityType: 'CriticalProtocol',
    entityId: protocolId,
    clientId: protocol.clientId,
    metadata: { met, note: note?.trim() ?? null },
  })

  revalidatePath('/anti-churn')
  return { ok: true }
}
