/**
 * Motor de automação de tasks v0 (gatilho → condição → ação) — missão A5 §2.
 *
 * TaskAutomationRule (schema) guarda a regra; este executor a roda. Duas ações:
 *   - `notify` : cria um Alert (AlertType TASK_AUTOMATION) no cliente da task;
 *   - `assign` : troca o responsável (assignedTo) + TaskActivity.
 *
 * Condições v0 (JSON em `conditions`, fallback legado em `condition`):
 *   { listId?, clientId?, status? } — AND entre os presentes.
 * Parâmetros da ação (JSON em `actionConfig`):
 *   { assignTo?, alertTitle?, alertBody? }
 *
 * Onde é chamado: hook LEVE e best-effort em src/app/actions/tasks.ts
 * (updateTaskStatus → 'task.status_changed'; createTask → 'task.created'),
 * SEMPRE depois da transação e nunca derrubando a mutação (igual ao clone).
 *
 * try/catch POR regra; AutomationLog por execução (SUCESSO / DUPLICIDADE_EVITADA
 * / FALHA). Nenhuma chamada externa (sem timeout necessário aqui).
 */

import { z } from 'zod'
import { TaskStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type TaskAutomationEvent = {
  type: 'task.created' | 'task.status_changed'
  taskId: string
  from?: string
  to?: string
}

export type TaskAutomationResult = {
  evaluated: number // regras ativas com trigger == event.type
  matched: number   // regras cujas condições bateram (ação tentada)
  applied: number   // SUCESSO
  skipped: number   // DUPLICIDADE_EVITADA
  failed: number    // FALHA
}

const conditionsSchema = z
  .object({
    listId: z.string().optional(),
    clientId: z.string().optional(),
    status: z.nativeEnum(TaskStatus).optional(),
  })
  .partial()

const actionConfigSchema = z
  .object({
    assignTo: z.string().optional(),
    alertTitle: z.string().optional(),
    alertBody: z.string().optional(),
  })
  .partial()

type Conditions = z.infer<typeof conditionsSchema>
type ActionConfig = z.infer<typeof actionConfigSchema>

/** Lê condições do JSON tipado `conditions`; se ausente, tenta o legado `condition` (string JSON). */
function parseConditions(conditions: unknown, legacy: string | null): Conditions {
  const primary = conditionsSchema.safeParse(conditions)
  if (primary.success) return primary.data
  if (legacy) {
    try {
      const legacyParsed = conditionsSchema.safeParse(JSON.parse(legacy))
      if (legacyParsed.success) return legacyParsed.data
    } catch {
      /* legado não-JSON: sem condições estruturadas */
    }
  }
  return {}
}

function parseActionConfig(actionConfig: unknown): ActionConfig {
  const parsed = actionConfigSchema.safeParse(actionConfig)
  return parsed.success ? parsed.data : {}
}

type TaskForAutomation = {
  id: string
  title: string
  listId: string | null
  clientId: string | null
  status: TaskStatus
  assignedTo: string
}

function conditionsMatch(cond: Conditions, task: TaskForAutomation): boolean {
  if (cond.listId && cond.listId !== task.listId) return false
  if (cond.clientId && cond.clientId !== task.clientId) return false
  if (cond.status && cond.status !== task.status) return false
  return true
}

export async function runTaskAutomations(event: TaskAutomationEvent): Promise<TaskAutomationResult> {
  const result: TaskAutomationResult = { evaluated: 0, matched: 0, applied: 0, skipped: 0, failed: 0 }

  const rules = await prisma.taskAutomationRule.findMany({
    where: { active: true, trigger: event.type },
  })
  if (rules.length === 0) return result
  result.evaluated = rules.length

  const task = await prisma.task.findUnique({
    where: { id: event.taskId },
    select: { id: true, title: true, listId: true, clientId: true, status: true, assignedTo: true },
  })
  if (!task) return result

  for (const rule of rules) {
    try {
      const cond = parseConditions(rule.conditions, rule.condition)
      if (!conditionsMatch(cond, task)) continue // condições não bateram: não é execução
      result.matched++

      const cfg = parseActionConfig(rule.actionConfig)
      const outcome = await runAction(rule.id, rule.name, rule.actionType, cfg, task)

      if (outcome === 'SUCESSO') result.applied++
      else if (outcome === 'DUPLICIDADE_EVITADA') result.skipped++
      else result.failed++
    } catch (err) {
      result.failed++
      await prisma.automationLog
        .create({
          data: {
            ruleId: rule.id,
            clientId: task.clientId ?? null,
            status: 'FALHA',
            reason: `Automação "${rule.name}": ${err instanceof Error ? err.message : String(err)}`,
          },
        })
        .catch(() => {})
    }
  }

  return result
}

type ActionOutcome = 'SUCESSO' | 'DUPLICIDADE_EVITADA' | 'FALHA'

async function runAction(
  ruleId: string,
  ruleName: string,
  actionType: string,
  cfg: ActionConfig,
  task: TaskForAutomation,
): Promise<ActionOutcome> {
  switch (actionType) {
    case 'notify':
      return runNotify(ruleId, ruleName, cfg, task)
    case 'assign':
      return runAssign(ruleId, ruleName, cfg, task)
    default: {
      await prisma.automationLog.create({
        data: {
          ruleId,
          clientId: task.clientId ?? null,
          status: 'FALHA',
          reason: `Ação não suportada no motor v0: "${actionType}"`,
        },
      })
      return 'FALHA'
    }
  }
}

async function runNotify(
  ruleId: string,
  ruleName: string,
  cfg: ActionConfig,
  task: TaskForAutomation,
): Promise<ActionOutcome> {
  // Alert é POR CLIENTE (clientId obrigatório no model). Task sem cliente não
  // tem onde notificar no motor v0 → registra o motivo operacional (não é dupe).
  if (!task.clientId) {
    await prisma.automationLog.create({
      data: {
        ruleId,
        status: 'FALHA',
        reason: `Automação "${ruleName}": ação notify requer tarefa vinculada a cliente (tarefa "${task.title}" sem cliente)`,
      },
    })
    return 'FALHA'
  }

  const title = cfg.alertTitle ?? `Automação: ${ruleName}`
  const body = cfg.alertBody ?? `A regra "${ruleName}" foi disparada pela tarefa "${task.title}".`

  // Dedupe leve: não recria um alerta idêntico ainda não lido do mesmo cliente
  // (evita spam a cada mudança de status). Marcar como lido reabre o disparo.
  const existing = await prisma.alert.findFirst({
    where: { clientId: task.clientId, type: 'TASK_AUTOMATION', title, read: false },
    select: { id: true },
  })
  if (existing) {
    await prisma.automationLog.create({
      data: {
        ruleId,
        clientId: task.clientId,
        status: 'DUPLICIDADE_EVITADA',
        reason: `Alerta "${title}" já existe (não lido) para o cliente`,
      },
    })
    return 'DUPLICIDADE_EVITADA'
  }

  const alert = await prisma.alert.create({
    data: { clientId: task.clientId, type: 'TASK_AUTOMATION', title, body },
    select: { id: true },
  })
  await prisma.automationLog.create({
    data: {
      ruleId,
      clientId: task.clientId,
      status: 'SUCESSO',
      reason: `Alerta criado (${alert.id}) para a tarefa ${task.id}`,
    },
  })
  return 'SUCESSO'
}

async function runAssign(
  ruleId: string,
  ruleName: string,
  cfg: ActionConfig,
  task: TaskForAutomation,
): Promise<ActionOutcome> {
  const userId = cfg.assignTo
  if (!userId) {
    await prisma.automationLog.create({
      data: {
        ruleId,
        clientId: task.clientId ?? null,
        status: 'FALHA',
        reason: `Automação "${ruleName}": ação assign sem "assignTo" configurado`,
      },
    })
    return 'FALHA'
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
  if (!user) {
    await prisma.automationLog.create({
      data: {
        ruleId,
        clientId: task.clientId ?? null,
        status: 'FALHA',
        reason: `Automação "${ruleName}": responsável "${userId}" não existe`,
      },
    })
    return 'FALHA'
  }

  // Já atribuída ao alvo: nada a fazer (idempotente).
  if (task.assignedTo === userId) {
    await prisma.automationLog.create({
      data: {
        ruleId,
        clientId: task.clientId ?? null,
        assigneeId: userId,
        status: 'DUPLICIDADE_EVITADA',
        reason: `Tarefa ${task.id} já atribuída a ${user.name}`,
      },
    })
    return 'DUPLICIDADE_EVITADA'
  }

  await prisma.$transaction([
    prisma.task.update({ where: { id: task.id }, data: { assignedTo: userId } }),
    prisma.taskActivity.create({
      data: {
        taskId: task.id,
        actorId: null, // sistema (automação)
        action: 'field_changed',
        fromValue: `responsável: ${task.assignedTo}`,
        toValue: `responsável: ${user.name} (automação)`,
      },
    }),
  ])
  await prisma.automationLog.create({
    data: {
      ruleId,
      clientId: task.clientId ?? null,
      assigneeId: userId,
      createdTaskId: task.id,
      status: 'SUCESSO',
      reason: `Tarefa ${task.id} reatribuída a ${user.name} por automação`,
    },
  })
  return 'SUCESSO'
}
