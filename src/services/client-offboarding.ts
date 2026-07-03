/**
 * ClientOffboardingAgent (FASE 7).
 *
 * Quando um cliente é cancelado (status vira CHURNED), este serviço executa o
 * offboarding operacional AUTOMATICAMENTE. Espelha o padrão do
 * client-onboarding.ts (idempotência, writeAuditLog, try/catch por passo).
 *
 * Passos (nenhum passo derruba os outros; nunca lança de forma a quebrar o
 * cancelamento que o caller já persistiu):
 *   1. Cancela as tarefas recorrentes FUTURAS/abertas do cliente (origin
 *      RECORRENCIA, status não-terminal) → CANCELADO (updateMany). Nada é
 *      apagado; o histórico é preservado.
 *   2. Cria (idempotente, idempotencyKey `offboarding:<clientId>`) UMA tarefa de
 *      offboarding com o checklist do POP, atribuída à CS (fallbacks abaixo).
 *   3. Marca client.healthStatus = ARQUIVADO (mantém status CHURNED do caller —
 *      NÃO reativa). Todo o histórico é preservado.
 *   4. writeAuditLog action 'client.offboarding'.
 *
 * IMPORTANTE (recorrências): as TaskRecurrenceRule são GLOBAIS (por template),
 * não por cliente. Este serviço NÃO desativa nenhuma rule global. A suspensão
 * das recorrências FUTURAS do cliente cancelado acontece naturalmente porque o
 * motor (recurrence-engine.ts) só faz fan-out para clientes status ACTIVE — e o
 * caller já colocou o cliente em CHURNED.
 */

import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import { statusIdFor } from '@/lib/tasks/statusMap'
import type { TaskStatus } from '@prisma/client'

// Status terminais que NÃO devem ser cancelados (já fechados).
const TERMINAL_STATUSES: TaskStatus[] = ['CONCLUIDO', 'CANCELADO']

// Checklist do POP de offboarding.
const OFFBOARDING_CHECKLIST: { label: string; required: boolean }[] = [
  { label: 'Motivo real do cancelamento', required: true },
  { label: 'Checklist operacional (acessos, campanhas, fatura)', required: false },
  { label: 'Mensagem de encerramento enviada', required: false },
  { label: 'Aprendizado registrado', required: false },
  { label: 'Registrar na Biblioteca de Padrões', required: false },
]

/**
 * Resolve o responsável da tarefa de offboarding:
 *   client.csId ?? fallback global CS ?? gestor do cliente ?? fallback HEAD.
 * Retorna null só se nada disso existir (nesse caso a task não é criada).
 */
async function resolveOffboardingOwner(client: {
  csId: string | null
  gestorId: string | null
}): Promise<string | null> {
  if (client.csId) return client.csId

  const cs = await prisma.user
    .findFirst({
      where: { operationalRole: 'CS', active: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
    .catch(() => null)
  if (cs?.id) return cs.id

  if (client.gestorId) return client.gestorId

  const head = await prisma.user
    .findFirst({
      where: { operationalRole: 'HEAD', active: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
    .catch(() => null)
  return head?.id ?? null
}

export async function runClientOffboarding(
  clientId: string,
  opts?: { motivo?: string },
): Promise<{
  tasksClosed: number
  automationTasksClosed: number
  protocolsClosed: number
  offboardingTaskCreated: boolean
}> {
  const now = new Date()
  const motivo = opts?.motivo ?? null

  let tasksClosed = 0
  let automationTasksClosed = 0
  let protocolsClosed = 0
  let offboardingTaskCreated = false

  const client = await prisma.client
    .findUnique({
      where: { id: clientId },
      select: { id: true, name: true, csId: true, gestorId: true },
    })
    .catch(() => null)

  if (!client) {
    await writeAuditLog({
      action: 'client.offboarding',
      entityType: 'Client',
      entityId: clientId,
      clientId,
      metadata: { error: 'client_not_found' },
    })
    return { tasksClosed: 0, automationTasksClosed: 0, protocolsClosed: 0, offboardingTaskCreated: false }
  }

  // Passo 1 — cancela as tarefas recorrentes abertas do cliente. NÃO apaga nada.
  try {
    const res = await prisma.task.updateMany({
      where: {
        clientId: client.id,
        origin: 'RECORRENCIA',
        status: { notIn: TERMINAL_STATUSES },
      },
      // Espelho statusId (D-004): mantém a FK coerente com o enum.
      data: { status: 'CANCELADO', statusId: statusIdFor('CANCELADO') },
    })
    tasksClosed = res.count
  } catch (err) {
    await prisma.automationLog
      .create({
        data: {
          clientId: client.id,
          status: 'FALHA',
          reason: `Offboarding: falha ao cancelar tarefas recorrentes abertas: ${
            err instanceof Error ? err.message : String(err)
          }`,
        },
      })
      .catch(() => {})
  }

  // Passo 1b (T-07) — cancela as tarefas de AUTOMACAO abertas do cliente. São
  // tarefas geradas por automações (anti-churn, 2ª semana sem check-in, War Room
  // etc.) que viram RUÍDO ETERNO num cliente cancelado. NÃO tocamos tasks MANUAIS
  // (decisão conservadora — podem ter pendência operacional real, ex.: acessos,
  // fatura em aberto; encerrar automaticamente esconderia trabalho pendente).
  try {
    const openAutomationTasks = await prisma.task.findMany({
      where: {
        clientId: client.id,
        origin: 'AUTOMACAO',
        status: { notIn: TERMINAL_STATUSES },
      },
      select: { id: true },
    })
    if (openAutomationTasks.length > 0) {
      const res = await prisma.task.updateMany({
        where: { id: { in: openAutomationTasks.map((t) => t.id) } },
        // Espelho statusId (D-004): mantém a FK coerente com o enum.
        data: { status: 'CANCELADO', statusId: statusIdFor('CANCELADO') },
      })
      automationTasksClosed = res.count
      await prisma.taskActivity.createMany({
        data: openAutomationTasks.map((t) => ({
          taskId: t.id,
          actorId: null,
          action: 'cancelled_by_offboarding',
        })),
      })
    }
  } catch (err) {
    await prisma.automationLog
      .create({
        data: {
          clientId: client.id,
          status: 'FALHA',
          reason: `Offboarding: falha ao cancelar tarefas de automação abertas: ${
            err instanceof Error ? err.message : String(err)
          }`,
        },
      })
      .catch(() => {})
  }

  // Passo 1c (T-07) — encerra a War Room (CriticalProtocol) ativa. Cliente
  // cancelado com protocolo ATIVO segue sendo cobrado/escalado pelo monitor.
  try {
    const active = await prisma.criticalProtocol.findFirst({
      where: { clientId: client.id, status: { not: 'ENCERRADO' } },
      select: { id: true },
    })
    if (active) {
      await prisma.criticalProtocol.update({
        where: { id: active.id },
        data: {
          status: 'ENCERRADO',
          closedAt: now,
          closedOutcome: 'PERDIDO_CHURN',
        },
      })
      protocolsClosed = 1
      await writeAuditLog({
        actorId: null,
        actorRole: 'SYSTEM',
        action: 'warroom.close',
        entityType: 'CriticalProtocol',
        entityId: active.id,
        clientId: client.id,
        metadata: { motivo: 'offboarding', outcome: 'PERDIDO_CHURN' },
      })
    }
  } catch (err) {
    await prisma.automationLog
      .create({
        data: {
          clientId: client.id,
          status: 'FALHA',
          reason: `Offboarding: falha ao encerrar War Room ativa: ${
            err instanceof Error ? err.message : String(err)
          }`,
        },
      })
      .catch(() => {})
  }

  // Passo 2 — cria (idempotente) a tarefa de offboarding atribuída à CS.
  try {
    const idempotencyKey = `offboarding:${client.id}`
    const existing = await prisma.task.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    })

    if (!existing) {
      const assigneeId = await resolveOffboardingOwner(client)

      if (!assigneeId) {
        await prisma.automationLog
          .create({
            data: {
              clientId: client.id,
              status: 'FALHA',
              reason:
                'Offboarding: sem CS/gestor resolvível e sem fallback global — tarefa de offboarding não criada',
            },
          })
          .catch(() => {})
      } else {
        await prisma.task.create({
          data: {
            title: `Offboarding — ${client.name}`,
            description:
              'Encerramento operacional do cliente cancelado: registrar motivo real, checklist de encerramento (acessos, campanhas, fatura), mensagem de encerramento, aprendizado e registro na Biblioteca de Padrões.',
            type: 'ONBOARDING',
            priority: 'ALTA',
            status: 'A_FAZER',
            statusId: statusIdFor('A_FAZER'), // espelho FK (D-004)
            origin: 'AUTOMACAO',
            clientId: client.id,
            assignedTo: assigneeId,
            requestedAt: now,
            dueDate: new Date(now.getTime() + 7 * 86_400_000),
            idempotencyKey,
            checklist: {
              create: OFFBOARDING_CHECKLIST.map((c, i) => ({
                label: c.label,
                required: c.required,
                order: i,
              })),
            },
            activities: { create: { actorId: null, action: 'created_by_offboarding' } },
          },
        })
        offboardingTaskCreated = true
      }
    }
  } catch (err) {
    await prisma.automationLog
      .create({
        data: {
          clientId: client.id,
          status: 'FALHA',
          reason: `Offboarding: falha ao criar tarefa de offboarding: ${
            err instanceof Error ? err.message : String(err)
          }`,
        },
      })
      .catch(() => {})
  }

  // Passo 3 — arquiva o cliente (mantém status CHURNED; NÃO reativa; preserva histórico).
  try {
    await prisma.client.update({
      where: { id: client.id },
      data: { healthStatus: 'ARQUIVADO' },
    })
  } catch (err) {
    await prisma.automationLog
      .create({
        data: {
          clientId: client.id,
          status: 'FALHA',
          reason: `Offboarding: falha ao arquivar cliente (healthStatus=ARQUIVADO): ${
            err instanceof Error ? err.message : String(err)
          }`,
        },
      })
      .catch(() => {})
  }

  // Passo 4 — auditoria.
  await writeAuditLog({
    action: 'client.offboarding',
    entityType: 'Client',
    entityId: client.id,
    clientId: client.id,
    metadata: { motivo, tasksClosed, automationTasksClosed, protocolsClosed, offboardingTaskCreated },
  })

  return { tasksClosed, automationTasksClosed, protocolsClosed, offboardingTaskCreated }
}
