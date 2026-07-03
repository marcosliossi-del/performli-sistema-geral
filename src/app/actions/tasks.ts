'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Prisma, TaskPriority, TaskStatus, SupportCategory } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { assertClientMutationAccess, writeAuditLog } from '@/lib/audit'
import { assertCan } from '@/lib/permissions'
import { normalizeRole, can } from '@/lib/rbac'
import { checkTaskCompletion } from '@/services/task-completion-guard'
import { statusIdFor } from '@/lib/tasks/statusMap'
import { mutateTask, type TaskFieldPatch, type ActivityEntry } from '@/lib/tasks/mutate'
import { orderBetween } from '@/lib/tasks/fractional'
import { parseDateInput } from '@/lib/tasks/dateInput'
import {
  parseRecurrenceRule,
  computeNextOccurrence,
  type RecurrenceRule,
} from '@/lib/tasks/recurrence'
import { createRecurrenceOccurrence } from '@/lib/tasks/recurClone'
import { runTaskAutomations } from '@/services/task-automation'

type ActionResult = { ok: true; id?: string } | { error: string }

/**
 * RBAC v2: GESTOR_TRAFEGO só pode mover tarefas de coluna (status). Criar,
 * atribuir, reordenar, gerenciar dependências/seguidores e editar campos são
 * ações estruturais bloqueadas — exige `update` em `tarefas` na matriz (que o
 * GESTOR não tem; ele só tem `update_status_only`). Mensagem operacional.
 */
function assertTaskStructuralMutation(role: string): { error: string } | null {
  if (!can(normalizeRole(role), 'update', 'tarefas')) {
    return {
      error:
        'Como gestor você só pode mover a tarefa de coluna (mudar o status). Criar, atribuir ou editar tarefas é com o staff de operação.',
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// createTask — mantido (contrato existente, throw). Só agrega statusId espelho.
// ─────────────────────────────────────────────────────────────────────────────
const createSchema = z.object({
  title:       z.string().min(3, 'Título obrigatório').max(200, 'Título longo demais (máx. 200)'),
  description: z.string().max(10_000, 'Descrição longa demais (máx. 10.000)').optional(),
  priority:    z.nativeEnum(TaskPriority).default('MEDIA'),
  dueDate:     z.string().optional(),
  clientId:    z.string().optional(),
  assignedTo:  z.string().optional(),
})

export async function createTask(formData: FormData) {
  const session = await requireSession()
  const { userId } = session

  // GESTOR não cria tarefas (só muda status). Contrato deste action é throw.
  const structural = assertTaskStructuralMutation(session.role)
  if (structural) throw new Error(structural.error)

  const raw = {
    title:       formData.get('title'),
    description: formData.get('description') ?? undefined,
    priority:    formData.get('priority') ?? 'MEDIA',
    dueDate:     formData.get('dueDate') ?? undefined,
    clientId:    formData.get('clientId') ?? undefined,
    assignedTo:  formData.get('assignedTo') ?? undefined,
  }

  const parsed = createSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(', '))
  }

  const { title, description, priority, dueDate, clientId, assignedTo } = parsed.data

  // Posse: tarefa vinculada a cliente exige papel + atribuição (CS acompanha).
  if (clientId) {
    await assertClientMutationAccess(session, clientId, { allowCS: true })
  }

  // Responsável: usa o informado (validando que existe e está ativo) ou, se
  // vazio, o próprio criador. Mantém assignedTo (espelho principal, D-005) sempre
  // válido — nenhuma FK órfã.
  let assigneeId = userId
  if (assignedTo && assignedTo !== userId) {
    const assignee = await prisma.user.findFirst({ where: { id: assignedTo, active: true }, select: { id: true } })
    if (!assignee) throw new Error('Responsável informado não existe ou está inativo.')
    assigneeId = assignee.id
  }

  const task = await prisma.task.create({
    data: {
      title,
      description: description || null,
      priority,
      status: 'A_FAZER',
      statusId: statusIdFor('A_FAZER'),
      dueDate: dueDate ? parseDateInput(dueDate) : null,
      clientId: clientId || null,
      assignedTo: assigneeId,
      requesterId: userId,
      requestedAt: new Date(), // data do pedido
      activities: { create: { actorId: userId, action: 'created' } },
    },
  })

  // Motor de automação v0 (A5 §2): hook LEVE e best-effort (nunca derruba o create).
  try {
    await runTaskAutomations({ type: 'task.created', taskId: task.id })
  } catch (err) {
    console.error('[task-automation] hook created falhou:', err)
  }

  revalidatePath('/tasks')
  revalidatePath('/operacional')
  return { ok: true, id: task.id }
}

// ─────────────────────────────────────────────────────────────────────────────
// updateTaskStatus — REFATORADA (assinatura e comportamento visível preservados).
// Novidades: espelho statusId na MESMA transação, writeAuditLog e clone
// on-complete quando recurrenceRule.mode === 'onComplete'.
// CONTRATO: bloqueio do guard RETORNA { error } (nunca lança) — throw de server
// action em produção é redigido pelo Next ("Server Components render... digest")
// e o usuário perde o motivo operacional. Mesmo contrato de decideTaskValidation.
// ─────────────────────────────────────────────────────────────────────────────
export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
): Promise<{ ok: true } | { error: string }> {
  const session = await requireSession()
  const { userId } = session

  const current = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      status: true, popId: true, type: true, clientId: true, assignedTo: true,
      dueDate: true, priority: true, tags: true, title: true, description: true,
      areaId: true, isSupport: true, supportDirection: true, supportCategory: true,
      requiresEvidence: true, requiresReview: true, reviewerId: true,
      riskScore: true, sourcePopCode: true,
      recurrenceRule: true,
      client: { select: { name: true } },
      checklist: { select: { label: true, required: true, order: true } },
      auxAssignees: { select: { userId: true } },
    },
  })
  if (!current) throw new Error('Tarefa não encontrada.')

  // Mutação em tarefa de cliente: valida papel + posse (CS acompanha, pode atualizar).
  if (current.clientId) {
    await assertClientMutationAccess(session, current.clientId, { allowCS: true })
  } else {
    // Tarefa interna (sem cliente): permitida ao responsável principal ou a um
    // responsável auxiliar; nas demais, assertCan barra papéis sem escrita.
    const isOwner = current.assignedTo === session.userId
    const isAux = current.auxAssignees.some((a) => a.userId === session.userId)
    if (!isOwner && !isAux) {
      await assertCan(session, 'task.write', {})
    }
  }

  const isConcluir = status === 'CONCLUIDO'
  const concluindoAgora = isConcluir && current.status !== 'CONCLUIDO'

  // FASE 5 — TaskCompletionGuard: só bloqueia tarefas críticas flag-gated (roda ANTES).
  if (concluindoAgora) {
    const guard = await checkTaskCompletion(taskId)
    if (!guard.allowed) {
      await prisma.task.update({
        where: { id: taskId },
        data: { blockReason: guard.reason ?? 'Conclusão bloqueada: requisitos obrigatórios pendentes.' },
      })
      return { error: guard.reason ?? 'Não é possível concluir: requisitos obrigatórios pendentes.' }
    }
  }

  // Update + Activity + espelho statusId na MESMA transação (D-004).
  await prisma.$transaction([
    prisma.task.update({
      where: { id: taskId },
      data: {
        status,
        statusId: statusIdFor(status),
        ...(isConcluir
          ? { completedAt: new Date(), completedById: userId, blockReason: null }
          : { completedAt: null, completedById: null }),
      },
    }),
    prisma.taskActivity.create({
      data: { taskId, actorId: userId, action: 'status_changed', fromValue: current.status, toValue: status },
    }),
  ])

  await writeAuditLog({
    actorId: userId,
    actorRole: session.role,
    action: 'status_changed',
    entityType: 'Task',
    entityId: taskId,
    clientId: current.clientId,
    metadata: { from: current.status, to: status },
  })

  // Clone on-complete (D-010): ao concluir com recurrenceRule mode 'onComplete',
  // regenera a task para a próxima ocorrência. Best-effort: nunca quebra a
  // conclusão. Reutiliza a MESMA montagem do modo schedule (recurClone) — zero
  // duplicação de lógica (missão A5 §1).
  if (concluindoAgora) {
    const rule = parseRecurrenceRule(current.recurrenceRule)
    if (rule && rule.mode === 'onComplete') {
      try {
        // Base = agora (data da conclusão), padrão ClickUp "recur on complete":
        // concluir uma task atrasada gera a próxima ocorrência no FUTURO, nunca
        // um clone já vencido.
        const nextDue = computeNextOccurrence(rule, new Date())
        await createRecurrenceOccurrence({
          source: {
            id: taskId,
            title: current.title,
            description: current.description,
            type: current.type,
            priority: current.priority,
            clientId: current.clientId,
            assignedTo: current.assignedTo,
            areaId: current.areaId,
            popId: current.popId,
            isSupport: current.isSupport,
            supportDirection: current.supportDirection,
            supportCategory: current.supportCategory,
            requiresEvidence: current.requiresEvidence,
            requiresReview: current.requiresReview,
            reviewerId: current.reviewerId,
            riskScore: current.riskScore,
            sourcePopCode: current.sourcePopCode,
            tags: current.tags,
            checklist: current.checklist,
            auxAssignees: current.auxAssignees,
          },
          rule,
          dueDate: nextDue,
          actorId: userId,
          carryRule: true, // cadeia on-complete: a próxima também recorre ao concluir
        })
      } catch (err) {
        console.error('[recur:onComplete] falha ao regenerar tarefa recorrente:', err)
      }
    }
  }

  // BLOCO 6 — evento: concluir ONB-04 gera o acompanhamento dos 30 dias (ONB-05).
  if (concluindoAgora && current.popId === 'pop_onb_04' && current.clientId) {
    try {
      const idempotencyKey = `onboarding-30d:${current.clientId}`
      const exists = await prisma.task.findUnique({ where: { idempotencyKey }, select: { id: true } })
      if (!exists) {
        await prisma.task.create({
          data: {
            title: `Acompanhamento 30 dias — ${current.client?.name ?? 'cliente'}`,
            description: 'Revisar os primeiros 30 dias do cliente: resultados, expectativas, saúde e próximos passos.',
            type: 'ONBOARDING',
            priority: 'MEDIA',
            status: 'A_FAZER',
            statusId: statusIdFor('A_FAZER'),
            origin: 'AUTOMACAO',
            clientId: current.clientId,
            assignedTo: current.assignedTo,
            areaId: 'area_onboarding',
            popId: 'pop_onb_05',
            requesterId: userId,
            requestedAt: new Date(),
            dueDate: new Date(Date.now() + 30 * 86_400_000),
            idempotencyKey,
            checklist: {
              create: [
                { label: 'Revisar resultados dos primeiros 30 dias', required: true, order: 0 },
                { label: 'Conferir alinhamento de expectativas com o cliente', required: true, order: 1 },
                { label: 'Avaliar saúde e risco de churn', required: true, order: 2 },
                { label: 'Definir próximos passos / plano do mês 2', required: false, order: 3 },
              ],
            },
            activities: { create: { actorId: userId, action: 'created' } },
          },
        })
      }
    } catch {
      // best-effort: não quebra a conclusão da tarefa
    }
  }

  // Motor de automação v0 (A5 §2): hook LEVE e best-effort DEPOIS da transação —
  // nunca derruba a mudança de status (igual ao clone acima).
  try {
    await runTaskAutomations({ type: 'task.status_changed', taskId, from: current.status, to: status })
  } catch (err) {
    console.error('[task-automation] hook status_changed falhou:', err)
  }

  revalidatePath('/tasks')
  revalidatePath('/operacional')
  revalidatePath('/suporte')
  revalidatePath('/meu-dia')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// updateTaskFields — edição inline de campos (contrato 3.3, {ok}|{error}).
// `priority: null` é aceito e interpretado como 'MEDIA' (coluna NOT NULL com
// default MEDIA; a UI mostra MEDIA como "Normal"). Não existe "sem prioridade".
// ─────────────────────────────────────────────────────────────────────────────
const updateFieldsSchema = z.object({
  title:           z.string().min(3, 'Título deve ter ao menos 3 caracteres').max(200, 'Título longo demais (máx. 200)').optional(),
  description:     z.string().max(10_000, 'Descrição longa demais (máx. 10.000)').nullable().optional(),
  assignedTo:      z.string().min(1).optional(),
  dueDate:         z.string().nullable().optional(),
  startDate:       z.string().nullable().optional(),
  // A coluna Task.priority é NOT NULL (@default(MEDIA)) — "sem prioridade" não
  // existe no enum. Aceitamos `null` do cliente e o interpretamos como 'MEDIA'
  // (a UI exibe MEDIA como "Normal"), preservando o contrato NOT NULL.
  priority:        z.nativeEnum(TaskPriority).nullable().optional(),
  supportCategory: z.nativeEnum(SupportCategory).nullable().optional(),
  tags:            z.array(z.string()).optional(),
})

export type UpdateTaskFieldsInput = z.infer<typeof updateFieldsSchema>

function fmtDate(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : '—'
}

export async function updateTaskFields(taskId: string, patch: UpdateTaskFieldsInput): Promise<ActionResult> {
  const session = await requireSession()

  const parsed = updateFieldsSchema.safeParse(patch)
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(', ') }
  }
  const input = parsed.data

  const current = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      title: true, description: true, assignedTo: true, dueDate: true, startDate: true,
      priority: true, supportCategory: true, tags: true,
    },
  })
  if (!current) return { error: 'Tarefa não encontrada.' }

  // Valida que o novo responsável existe (evita FK órfã).
  let newAssigneeName: string | null = null
  if (input.assignedTo !== undefined && input.assignedTo !== current.assignedTo) {
    const user = await prisma.user.findUnique({ where: { id: input.assignedTo }, select: { name: true } })
    if (!user) return { error: 'Responsável informado não existe.' }
    newAssigneeName = user.name
  }

  const data: TaskFieldPatch = {}
  const activities: ActivityEntry[] = []

  if (input.title !== undefined && input.title !== current.title) {
    data.title = input.title
    activities.push({ action: 'field_changed', fromValue: `título: ${current.title}`, toValue: `título: ${input.title}` })
  }
  if (input.description !== undefined && (input.description ?? null) !== current.description) {
    data.description = input.description ?? null
    activities.push({ action: 'field_changed', fromValue: 'descrição anterior', toValue: input.description ? 'descrição atualizada' : 'descrição removida' })
  }
  if (input.assignedTo !== undefined && input.assignedTo !== current.assignedTo) {
    const oldUser = await prisma.user.findUnique({ where: { id: current.assignedTo }, select: { name: true } })
    data.assignedTo = input.assignedTo
    activities.push({ action: 'field_changed', fromValue: `responsável: ${oldUser?.name ?? current.assignedTo}`, toValue: `responsável: ${newAssigneeName}` })
  }
  if (input.dueDate !== undefined) {
    const newDue = input.dueDate ? parseDateInput(input.dueDate) : null
    if ((newDue?.getTime() ?? null) !== (current.dueDate?.getTime() ?? null)) {
      data.dueDate = newDue
      activities.push({ action: 'field_changed', fromValue: `prazo: ${fmtDate(current.dueDate)}`, toValue: `prazo: ${fmtDate(newDue)}` })
    }
  }
  if (input.startDate !== undefined) {
    const newStart = input.startDate ? parseDateInput(input.startDate) : null
    if ((newStart?.getTime() ?? null) !== (current.startDate?.getTime() ?? null)) {
      data.startDate = newStart
      activities.push({ action: 'field_changed', fromValue: `início: ${fmtDate(current.startDate)}`, toValue: `início: ${fmtDate(newStart)}` })
    }
  }
  if (input.priority !== undefined) {
    // null = "sem prioridade" na UI → MEDIA (coluna NOT NULL, default MEDIA).
    const nextPriority: TaskPriority = input.priority ?? 'MEDIA'
    if (nextPriority !== current.priority) {
      data.priority = nextPriority
      activities.push({ action: 'field_changed', fromValue: `prioridade: ${current.priority}`, toValue: `prioridade: ${nextPriority}` })
    }
  }
  if (input.supportCategory !== undefined && (input.supportCategory ?? null) !== current.supportCategory) {
    data.supportCategory = input.supportCategory ?? null
    activities.push({ action: 'field_changed', fromValue: `categoria: ${current.supportCategory ?? '—'}`, toValue: `categoria: ${input.supportCategory ?? '—'}` })
  }
  if (input.tags !== undefined) {
    const a = [...current.tags].sort().join(',')
    const b = [...input.tags].sort().join(',')
    if (a !== b) {
      data.tags = input.tags
      activities.push({ action: 'field_changed', fromValue: `tags: ${current.tags.join(', ') || '—'}`, toValue: `tags: ${input.tags.join(', ') || '—'}` })
    }
  }

  if (activities.length === 0) return { ok: true }

  // D-005: se o novo responsável principal já existia como auxiliar da task,
  // remove-o de TaskAuxAssignee na MESMA transação do update (não pode ser
  // principal e auxiliar ao mesmo tempo). O antigo principal é descartado
  // (não é rebaixado a auxiliar) — comportamento desejado.
  const extraOps: Prisma.PrismaPromise<unknown>[] = []
  if (data.assignedTo !== undefined && typeof data.assignedTo === 'string') {
    extraOps.push(
      prisma.taskAuxAssignee.deleteMany({ where: { taskId, userId: data.assignedTo } }),
    )
  }

  const result = await mutateTask(taskId, session, data, activities, extraOps)
  if ('error' in result) return result

  revalidatePath('/operacional')
  revalidatePath('/suporte')
  revalidatePath('/meu-dia')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// setTaskRecurrence — grava/limpa a regra de recorrência da task (D-010).
// ─────────────────────────────────────────────────────────────────────────────
export async function setTaskRecurrence(taskId: string, rule: RecurrenceRule | null): Promise<ActionResult> {
  const session = await requireSession()

  let stored: Prisma.InputJsonValue | typeof Prisma.DbNull
  let toValue: string
  if (rule === null) {
    stored = Prisma.DbNull
    toValue = 'não repetir'
  } else {
    const valid = parseRecurrenceRule(rule)
    if (!valid) return { error: 'Regra de recorrência inválida.' }
    stored = valid as unknown as Prisma.InputJsonValue
    toValue = `${valid.freq.toLowerCase()} · intervalo ${valid.interval} · ${valid.mode === 'onComplete' ? 'ao concluir' : 'agendada'}`
  }

  const result = await mutateTask(
    taskId,
    session,
    { recurrenceRule: stored },
    { action: 'recurrence_changed', toValue },
  )
  if ('error' in result) return result

  revalidatePath('/operacional')
  revalidatePath('/suporte')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// reorderTask — reposiciona via fractional indexing (D-003). 1 UPDATE.
// ─────────────────────────────────────────────────────────────────────────────
export async function reorderTask(
  taskId: string,
  beforeOrderIndex: string | null,
  afterOrderIndex: string | null,
): Promise<ActionResult> {
  const session = await requireSession()

  let newIndex: string
  try {
    newIndex = orderBetween(beforeOrderIndex, afterOrderIndex)
  } catch {
    return { error: 'Não foi possível calcular a nova posição da tarefa.' }
  }

  const result = await mutateTask(
    taskId,
    session,
    { orderIndex: newIndex },
    { action: 'reordered', toValue: newIndex },
  )
  if ('error' in result) return result

  revalidatePath('/operacional')
  revalidatePath('/suporte')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// assignTask / unassignTask — M:N via TaskAuxAssignee com espelho assignedTo
// (D-005): assignedTo é o responsável principal e NUNCA fica órfão.
// ─────────────────────────────────────────────────────────────────────────────
type OwnershipOk = { task: { clientId: string | null; assignedTo: string } }
type OwnershipErr = { error: string }

async function ownershipGuard(taskId: string, session: { userId: string; role: string }): Promise<OwnershipOk | OwnershipErr> {
  // GESTOR não atribui/segue tarefas — mutação estrutural bloqueada.
  const structural = assertTaskStructuralMutation(session.role)
  if (structural) return structural

  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { clientId: true, assignedTo: true } })
  if (!task) return { error: 'Tarefa não encontrada.' }
  // Papel + posse SEMPRE (CLAUDE.md #2). Task interna (sem cliente) atribuída
  // ao próprio usuário é permitida (executar o próprio trabalho); nas demais,
  // assertCan barra papéis sem escrita (ex.: ANALYST em task alheia).
  const ownClientlessTask = !task.clientId && task.assignedTo === session.userId
  if (!ownClientlessTask) {
    try {
      await assertCan(session, 'task.write', { clientId: task.clientId ?? undefined })
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Sem permissão.' }
    }
  }
  return { task }
}

export async function assignTask(taskId: string, userId: string): Promise<ActionResult> {
  const session = await requireSession()
  const guard = await ownershipGuard(taskId, session)
  if ('error' in guard) return guard

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
  if (!user) return { error: 'Usuário informado não existe.' }

  try {
    await prisma.$transaction([
      prisma.taskAuxAssignee.upsert({
        where: { taskId_userId: { taskId, userId } },
        create: { taskId, userId },
        update: {},
      }),
      prisma.taskActivity.create({
        data: { taskId, actorId: session.userId, action: 'assignee_added', toValue: user.name },
      }),
    ])
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Falha ao atribuir responsável.' }
  }

  await writeAuditLog({
    actorId: session.userId, actorRole: session.role, action: 'assignee_added',
    entityType: 'Task', entityId: taskId, clientId: guard.task.clientId, metadata: { userId },
  })
  revalidatePath('/operacional')
  revalidatePath('/meu-dia')
  return { ok: true }
}

export async function unassignTask(taskId: string, userId: string): Promise<ActionResult> {
  const session = await requireSession()
  const guard = await ownershipGuard(taskId, session)
  if ('error' in guard) return guard

  const primary = guard.task.assignedTo
  const aux = await prisma.taskAuxAssignee.findMany({ where: { taskId }, select: { userId: true } })
  const assigneeSet = new Set<string>([primary, ...aux.map((a) => a.userId)])

  if (!assigneeSet.has(userId)) return { error: 'Este usuário não é responsável pela tarefa.' }
  if (assigneeSet.size <= 1) return { error: 'Não é possível remover o único responsável da tarefa.' }

  const ops: Prisma.PrismaPromise<unknown>[] = []

  if (userId === primary) {
    // Promove outro responsável a principal (mantém assignedTo sempre válido).
    const replacement = aux.find((a) => a.userId !== userId)?.userId
    if (!replacement) return { error: 'Não é possível remover o único responsável da tarefa.' }
    ops.push(
      prisma.task.update({ where: { id: taskId }, data: { assignedTo: replacement } }),
      prisma.taskAuxAssignee.deleteMany({ where: { taskId, userId: replacement } }),
    )
  } else {
    ops.push(prisma.taskAuxAssignee.deleteMany({ where: { taskId, userId } }))
  }
  ops.push(
    prisma.taskActivity.create({ data: { taskId, actorId: session.userId, action: 'assignee_removed', fromValue: userId } }),
  )

  try {
    await prisma.$transaction(ops)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Falha ao remover responsável.' }
  }

  await writeAuditLog({
    actorId: session.userId, actorRole: session.role, action: 'assignee_removed',
    entityType: 'Task', entityId: taskId, clientId: guard.task.clientId, metadata: { userId },
  })
  revalidatePath('/operacional')
  revalidatePath('/meu-dia')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// toggleWatcher — segue/deixa de seguir a task (TaskWatcher existente).
// ─────────────────────────────────────────────────────────────────────────────
export async function toggleWatcher(taskId: string, userId: string): Promise<ActionResult> {
  const session = await requireSession()
  const guard = await ownershipGuard(taskId, session)
  if ('error' in guard) return guard

  const watcherUser = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
  if (!watcherUser) return { error: 'Usuário informado não existe.' }

  const existing = await prisma.taskWatcher.findUnique({ where: { taskId_userId: { taskId, userId } }, select: { id: true } })

  try {
    if (existing) {
      await prisma.$transaction([
        prisma.taskWatcher.delete({ where: { taskId_userId: { taskId, userId } } }),
        prisma.taskActivity.create({ data: { taskId, actorId: session.userId, action: 'watcher_removed', fromValue: userId } }),
      ])
    } else {
      await prisma.$transaction([
        prisma.taskWatcher.create({ data: { taskId, userId } }),
        prisma.taskActivity.create({ data: { taskId, actorId: session.userId, action: 'watcher_added', toValue: userId } }),
      ])
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Falha ao atualizar seguidores.' }
  }

  await writeAuditLog({
    actorId: session.userId, actorRole: session.role,
    action: existing ? 'watcher_removed' : 'watcher_added',
    entityType: 'Task', entityId: taskId, clientId: guard.task.clientId, metadata: { userId },
  })
  revalidatePath('/operacional')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// addTaskDependency — cria dependência com detecção de ciclo (DFS).
// Semântica: blockingId BLOQUEIA waitingId (waitingId depende de blockingId).
// ─────────────────────────────────────────────────────────────────────────────
export async function addTaskDependency(blockingId: string, waitingId: string): Promise<ActionResult> {
  const session = await requireSession()

  const structural = assertTaskStructuralMutation(session.role)
  if (structural) return structural

  if (blockingId === waitingId) return { error: 'Uma tarefa não pode depender de si mesma.' }

  const [blocking, waiting] = await Promise.all([
    prisma.task.findUnique({ where: { id: blockingId }, select: { id: true, clientId: true, title: true } }),
    prisma.task.findUnique({ where: { id: waitingId }, select: { id: true, clientId: true, title: true } }),
  ])
  if (!blocking || !waiting) return { error: 'Tarefa de dependência não encontrada.' }

  // Posse dos DOIS lados: muta a tarefa que espera E referencia a bloqueadora
  // (evita vazar título/vínculo de cliente que o ator não possui).
  try {
    await assertCan(session, 'task.write', { clientId: waiting.clientId ?? undefined })
    await assertCan(session, 'task.write', { clientId: blocking.clientId ?? undefined })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Sem permissão.' }
  }

  const existing = await prisma.taskDependency.findUnique({
    where: { dependentId_blockingId: { dependentId: waitingId, blockingId } },
    select: { id: true },
  })
  if (existing) return { error: 'Essa dependência já existe.' }

  // Detecção de ciclo: a nova aresta faz waitingId depender de blockingId.
  // Há ciclo se blockingId já depende (transitivamente) de waitingId.
  // Grafo dependsOn: para um nó, os "blockings" são as tarefas das quais ele
  // depende (TaskDependency.blockingId onde dependentId = nó).
  const visited = new Set<string>()
  const stack: string[] = [blockingId]
  const MAX_GRAPH_NODES = 500 // trava de segurança contra grafos patológicos
  while (stack.length > 0) {
    const node = stack.pop() as string
    if (node === waitingId) {
      return { error: `Dependência criaria um ciclo: "${blocking.title}" já depende de "${waiting.title}".` }
    }
    if (visited.has(node)) continue
    visited.add(node)
    if (visited.size > MAX_GRAPH_NODES) {
      return { error: 'Cadeia de dependências grande demais para validar. Simplifique as dependências.' }
    }
    const deps = await prisma.taskDependency.findMany({ where: { dependentId: node }, select: { blockingId: true } })
    for (const d of deps) stack.push(d.blockingId)
  }

  try {
    await prisma.$transaction([
      prisma.taskDependency.create({ data: { dependentId: waitingId, blockingId } }),
      prisma.taskActivity.create({ data: { taskId: waitingId, actorId: session.userId, action: 'dependency_added', toValue: blocking.title } }),
    ])
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Falha ao criar dependência.' }
  }

  await writeAuditLog({
    actorId: session.userId, actorRole: session.role, action: 'dependency_added',
    entityType: 'Task', entityId: waitingId, clientId: waiting.clientId, metadata: { blockingId },
  })
  revalidatePath('/operacional')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// removeTaskDependency — desfaz a dependência (blockingId BLOQUEIA waitingId).
// Mesma authz do addTaskDependency: posse dos DOIS lados (assertCan).
// ─────────────────────────────────────────────────────────────────────────────
export async function removeTaskDependency(blockingId: string, waitingId: string): Promise<ActionResult> {
  const session = await requireSession()

  const structural = assertTaskStructuralMutation(session.role)
  if (structural) return structural

  const [blocking, waiting] = await Promise.all([
    prisma.task.findUnique({ where: { id: blockingId }, select: { id: true, clientId: true, title: true } }),
    prisma.task.findUnique({ where: { id: waitingId }, select: { id: true, clientId: true, title: true } }),
  ])
  if (!blocking || !waiting) return { error: 'Tarefa de dependência não encontrada.' }

  // Posse dos DOIS lados (mesma checagem do addTaskDependency): não expõe/altera
  // vínculo de cliente que o ator não possui.
  try {
    await assertCan(session, 'task.write', { clientId: waiting.clientId ?? undefined })
    await assertCan(session, 'task.write', { clientId: blocking.clientId ?? undefined })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Sem permissão.' }
  }

  const existing = await prisma.taskDependency.findUnique({
    where: { dependentId_blockingId: { dependentId: waitingId, blockingId } },
    select: { id: true },
  })
  if (!existing) return { error: 'Essa dependência não existe.' }

  try {
    await prisma.$transaction([
      prisma.taskDependency.delete({ where: { id: existing.id } }),
      prisma.taskActivity.create({ data: { taskId: waitingId, actorId: session.userId, action: 'dependency_removed', fromValue: blocking.title } }),
    ])
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Falha ao remover dependência.' }
  }

  await writeAuditLog({
    actorId: session.userId, actorRole: session.role, action: 'dependency_removed',
    entityType: 'Task', entityId: waitingId, clientId: waiting.clientId, metadata: { blockingId },
  })
  revalidatePath('/operacional')
  return { ok: true }
}
