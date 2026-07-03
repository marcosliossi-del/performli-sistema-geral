'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { assertClientMutationAccess, writeAuditLog } from '@/lib/audit'
import { statusIdFor } from '@/lib/tasks/statusMap'
import { parseDateInput } from '@/lib/tasks/dateInput'
import {
  diagnosticoGestorSchema,
  decisoesCsSchema,
  shortHash,
  NIVEL_FRAMEWORK_LABELS,
} from '@/lib/warroom/forms'
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
      statusId: statusIdFor('EM_ANDAMENTO'), // espelho FK (D-004)
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
        statusId: statusIdFor(newStatus), // espelho FK (D-004)
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

// ═══════════════════════════════════════════════════════════════════════════
// WAR-14/15 — Diagnóstico do gestor + Decisões da CS (substitui os 2 PDFs)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Publica uma mensagem do SISTEMA no canal interno do cliente (réplica local do
 * helper de client-lifecycle-automations, que não é exportado). Autor = actor.
 */
async function postSystemChatMessage(clientId: string, authorUserId: string, content: string): Promise<void> {
  const chat = await prisma.clientChat.upsert({
    where: { clientId },
    create: { clientId },
    update: {},
    select: { id: true },
  })
  await prisma.clientChatMessage.create({ data: { chatId: chat.id, userId: authorUserId, content } })
}

/**
 * WAR-14 — Salva o diagnóstico do gestor (o doc que ia no chat até quarta).
 * Auth: gestor da carteira + ADMIN/SUPERVISOR (allowCS false — CS não diagnostica).
 * Espelha o campo `diagnosis` existente com a hipótese e POSTA um resumo no chat
 * do cliente, substituindo o envio manual.
 */
export async function saveDiagnosticoGestor(
  protocolId: string,
  data: unknown,
): Promise<ActionResult> {
  const session = await requireSession()

  const parsed = diagnosticoGestorSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Diagnóstico incompleto.' }
  }
  const d = parsed.data

  const protocol = await prisma.criticalProtocol.findUnique({
    where: { id: protocolId },
    select: { id: true, clientId: true, status: true, client: { select: { name: true } } },
  })
  if (!protocol) return { error: 'War Room não encontrada.' }
  if (protocol.status === 'ENCERRADO') return { error: 'Esta War Room já foi encerrada.' }

  // auth + papel + posse — diagnóstico é do gestor (CS não preenche → allowCS false)
  try {
    await assertClientMutationAccess(session, protocol.clientId, { allowCS: false })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Sem permissão.' }
  }

  const nivelLabel = NIVEL_FRAMEWORK_LABELS[d.nivelFramework]

  await prisma.criticalProtocol.update({
    where: { id: protocolId },
    data: {
      diagnosticoGestor: d as unknown as Prisma.InputJsonValue,
      // Espelha o campo texto existente com a hipótese resumida (compatibilidade
      // com o restante da tela e do monitor).
      diagnosis: `[${nivelLabel}] ${d.hipotese}`,
    },
  })

  // Substitui o envio manual no chat: resumo operacional automático.
  const resumoChat =
    `📋 Diagnóstico da War Room — ${protocol.client.name}\n` +
    `Situação: ${d.situacao}\n` +
    `Hipótese (${nivelLabel}): ${d.hipotese}\n` +
    `Teste: ${d.teste} · Prazo: ${new Date(parseDateInput(d.prazoTeste)).toLocaleDateString('pt-BR')}`
  try {
    await postSystemChatMessage(protocol.clientId, session.userId, resumoChat)
  } catch (err) {
    console.error('[warroom] falha ao postar diagnóstico no chat:', err)
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'warroom.diagnostico_gestor',
    entityType: 'CriticalProtocol',
    entityId: protocolId,
    clientId: protocol.clientId,
    metadata: { nivelFramework: d.nivelFramework, prazoTeste: d.prazoTeste },
  })

  revalidatePath('/anti-churn')
  return { ok: true }
}

type DecisoesResult =
  | { ok: true; tasksCriadas: number; tasksCanceladas: number }
  | { error: string }

/**
 * WAR-15 — Salva as decisões documentadas pela CS na call de quinta. Cada ação
 * vira uma Task de automação (idempotente por hash da ação, para re-salvar sem
 * duplicar). Se houver próxima reunião, cria/atualiza uma task de acompanhamento.
 * Auth: processo da CS (allowCS true).
 */
export async function saveDecisoesCs(
  protocolId: string,
  data: unknown,
): Promise<DecisoesResult> {
  const session = await requireSession()

  const parsed = decisoesCsSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Decisões incompletas.' }
  }
  const d = parsed.data

  const protocol = await prisma.criticalProtocol.findUnique({
    where: { id: protocolId },
    select: {
      id: true,
      clientId: true,
      status: true,
      responsibleId: true,
      client: {
        select: {
          name: true,
          assignments: { where: { isPrimary: true }, select: { userId: true }, take: 1 },
        },
      },
    },
  })
  if (!protocol) return { error: 'War Room não encontrada.' }
  if (protocol.status === 'ENCERRADO') return { error: 'Esta War Room já foi encerrada.' }

  // auth + papel + posse — documentação de decisões é processo da CS
  try {
    await assertClientMutationAccess(session, protocol.clientId, { allowCS: true })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Sem permissão.' }
  }

  // Valida responsáveis das ações: precisam existir e estar ativos.
  const responsavelIds = Array.from(
    new Set(d.problemas.flatMap((p) => p.acoes.map((a) => a.responsavelId))),
  )
  const activeUsers = await prisma.user.findMany({
    where: { id: { in: responsavelIds }, active: true },
    select: { id: true },
  })
  const activeSet = new Set(activeUsers.map((u) => u.id))
  const invalido = responsavelIds.find((id) => !activeSet.has(id))
  if (invalido) return { error: 'Uma das ações tem responsável inválido ou inativo.' }

  await prisma.criticalProtocol.update({
    where: { id: protocolId },
    data: {
      decisoesCs: d as unknown as Prisma.InputJsonValue,
      lastReviewedAt: new Date(),
    },
  })

  // ── Cada ação → Task de automação (idempotente por hash do texto da ação) ──
  // A idempotencyKey é `auto:warroom-decisao:{protocolId}:{hash(acao)}`. Isso
  // garante que re-salvar as MESMAS ações não duplique tasks. Duas ações com o
  // MESMO hash no mesmo save (colisão) são sufixadas -2, -3... via `usedKeys`
  // para que nenhuma ação seja silenciosamente pulada. As keys efetivamente
  // usadas neste save são registradas em `keysDoSave` para a reconciliação.
  const prefixDecisao = `auto:warroom-decisao:${protocolId}:`
  const usedKeys = new Map<string, number>() // hash base → nº de vezes visto neste save
  const keysDoSave = new Set<string>()
  let tasksCriadas = 0

  for (const problema of d.problemas) {
    for (const acao of problema.acoes) {
      const base = `${prefixDecisao}${shortHash(acao.acao)}`
      const seen = usedKeys.get(base) ?? 0
      usedKeys.set(base, seen + 1)
      const idempotencyKey = seen === 0 ? base : `${base}-${seen + 1}`
      keysDoSave.add(idempotencyKey)

      const exists = await prisma.task.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      })
      if (exists) continue

      await prisma.task.create({
        data: {
          title: `War Room — ${acao.acao}`,
          description: `Cliente: ${protocol.client.name}\nProblema: ${problema.problema}\nAção decidida na War Room de ${new Date().toLocaleDateString('pt-BR')}.`,
          type: 'WAR_ROOM',
          priority: 'ALTA',
          status: 'A_FAZER',
          statusId: statusIdFor('A_FAZER'),
          origin: 'AUTOMACAO',
          clientId: protocol.clientId,
          assignedTo: acao.responsavelId,
          areaId: 'area_war',
          popId: 'pop_war_14',
          requesterId: session.userId,
          requestedAt: new Date(),
          dueDate: parseDateInput(acao.prazo),
          requiresEvidence: false,
          idempotencyKey,
          activities: { create: { actorId: session.userId, action: 'created' } },
        },
      })
      tasksCriadas++
    }
  }

  // ── RECONCILIAÇÃO — cancela tasks de ações removidas/editadas ──────────────
  // Ao editar o texto de uma ação, seu hash muda → nasce uma task nova com key
  // nova. A task antiga (key que NÃO está mais no save atual) ficaria órfã na
  // fila de alguém. Aqui buscamos toda task de ação deste protocolo cuja key
  // não pertence ao save atual e ainda está aberta, e a CANCELAMOS (espelho
  // statusId + TaskActivity + AutomationLog com motivo). Assim editar/remover
  // uma ação não deixa task fantasma.
  const tasksAntigas = await prisma.task.findMany({
    where: {
      clientId: protocol.clientId,
      idempotencyKey: { startsWith: prefixDecisao },
      status: { notIn: ['CONCLUIDO', 'CANCELADO'] },
    },
    select: { id: true, status: true, idempotencyKey: true },
  })
  let tasksCanceladas = 0
  for (const t of tasksAntigas) {
    if (t.idempotencyKey && keysDoSave.has(t.idempotencyKey)) continue // ainda vigente
    await prisma.task.update({
      where: { id: t.id },
      data: {
        status: 'CANCELADO',
        statusId: statusIdFor('CANCELADO'), // espelho FK (D-004)
        activities: {
          create: {
            actorId: session.userId,
            action: 'status_changed',
            fromValue: t.status,
            toValue: 'CANCELADO',
          },
        },
      },
    })
    await prisma.automationLog
      .create({
        data: {
          clientId: protocol.clientId,
          status: 'SUCESSO',
          reason: 'warroom-decisao — ação removida/editada no re-save das decisões; task cancelada para não ficar órfã',
        },
      })
      .catch(() => {})
    tasksCanceladas++
  }

  // ── Próxima reunião → task de acompanhamento ───────────────────────────────
  if (d.proximaReuniao) {
    const followAssignee = protocol.responsibleId ?? protocol.client.assignments[0]?.userId ?? null
    if (followAssignee) {
      const dueDate = parseDateInput(d.proximaReuniao)
      const baseKey = `auto:warroom-proxima-reuniao:${protocolId}`
      const existing = await prisma.task.findUnique({
        where: { idempotencyKey: baseKey },
        select: { id: true, status: true },
      })
      // Se a task-base ainda está aberta, apenas reaponta responsável/prazo.
      // Se já foi CONCLUÍDA/CANCELADA, não reabrimos: geramos uma NOVA task com
      // key sufixada pela data da reunião (uma reunião nova é outra ocorrência).
      if (existing && existing.status !== 'CONCLUIDO' && existing.status !== 'CANCELADO') {
        await prisma.task.update({
          where: { id: existing.id },
          data: { assignedTo: followAssignee, dueDate },
        })
      } else {
        const idempotencyKey = existing ? `${baseKey}:${d.proximaReuniao}` : baseKey
        const dupe = existing
          ? await prisma.task.findUnique({ where: { idempotencyKey }, select: { id: true } })
          : null
        if (!dupe) {
          await prisma.task.create({
            data: {
              title: `War Room — próxima reunião de ${protocol.client.name}`,
              description: 'Reunião de acompanhamento definida na War Room. Revise a evolução do critério de saída.',
              type: 'WAR_ROOM',
              priority: 'ALTA',
              status: 'A_FAZER',
              statusId: statusIdFor('A_FAZER'),
              origin: 'AUTOMACAO',
              clientId: protocol.clientId,
              assignedTo: followAssignee,
              areaId: 'area_war',
              popId: 'pop_war_14',
              requesterId: session.userId,
              requestedAt: new Date(),
              dueDate,
              requiresEvidence: false,
              idempotencyKey,
              activities: { create: { actorId: session.userId, action: 'created' } },
            },
          })
          tasksCriadas++
        }
      }
    }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'warroom.decisoes_cs',
    entityType: 'CriticalProtocol',
    entityId: protocolId,
    clientId: protocol.clientId,
    metadata: {
      problemas: d.problemas.length,
      tasksCriadas,
      tasksCanceladas,
      proximaReuniao: d.proximaReuniao,
    },
  })

  revalidatePath('/anti-churn')
  revalidatePath('/operacional')
  return { ok: true, tasksCriadas, tasksCanceladas }
}
