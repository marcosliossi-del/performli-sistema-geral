/**
 * Motor de recorrência (BLOCO 3).
 *
 * Roda via cron. Para cada TaskRecurrenceRule ativa cujo agendamento bate com
 * hoje, gera tarefas a partir do template — fan-out POR CLIENTE ATIVO. O
 * responsável é resolvido POR PAPEL (defaultAssigneeRole), não mais só MANAGER:
 *   GESTOR/MANAGER → client.gestorId ?? ClientAssignment primária
 *   CS            → client.csId ?? fallback global (User operationalRole=CS)
 *   CRM           → client.crmId ?? fallback global (operationalRole=CRM)
 *   SUPERVISOR    → client.supervisorId ?? fallback global (SUPERVISOR)
 *   HEAD          → client.headId ?? fallback global (HEAD)
 *
 * Idempotência: chave (template + cliente + janela). Rodar o cron duas vezes no
 * mesmo período NÃO duplica. Toda geração grava AutomationLog (sucesso / falha /
 * duplicidade evitada). try/catch por cliente.
 */

import { prisma } from '@/lib/prisma'
import { getWeekRange } from '@/lib/utils'
import type { TaskType, TaskPriority, TaskStatus } from '@prisma/client'

// Papéis suportados pelo fan-out por cliente ativo.
const CLIENT_FANOUT_ROLES = new Set(['GESTOR', 'MANAGER', 'CS', 'CRM', 'SUPERVISOR', 'HEAD'])

function quarterOfMonth(month0: number): number {
  return Math.floor(month0 / 3) + 1 // month0: 0-11 → Q1..Q4
}

function shouldRunToday(
  frequency: string,
  dayOfWeek: number | null,
  dayOfMonth: number | null,
  anchorDate: Date | null,
  now: Date,
): boolean {
  const day = now.getDay() // 0=Dom..6=Sáb
  const dom = now.getDate()
  switch (frequency) {
    case 'DIARIA': return true
    case 'DIA_UTIL': return day >= 1 && day <= 5
    case 'SEMANAL':
    case 'QUINZENAL':
    case 'DIA_DA_SEMANA': return day === (dayOfWeek ?? 1)
    case 'MENSAL':
    case 'DIA_DO_MES': return dom === (dayOfMonth ?? 1)
    case 'TRIMESTRAL': {
      // Dispara no dia-âncora do ciclo de 90 dias. Se houver anchorDate, dispara
      // quando o dia-do-mês bate com o da âncora E estamos num mês de início de
      // trimestre relativo à âncora. Sem âncora: trata como MENSAL no dia 1, mas
      // só nos meses que abrem trimestre (jan/abr/jul/out → month0 % 3 === 0).
      if (anchorDate) {
        const anchorDom = anchorDate.getDate()
        if (dom !== anchorDom) return false
        const monthsDiff =
          (now.getFullYear() - anchorDate.getFullYear()) * 12 +
          (now.getMonth() - anchorDate.getMonth())
        return monthsDiff >= 0 && monthsDiff % 3 === 0
      }
      return dom === (dayOfMonth ?? 1) && now.getMonth() % 3 === 0
    }
    default: return false // POR_* são event-driven (BLOCO 6)
  }
}

function windowKey(frequency: string, now: Date): string {
  if (frequency === 'SEMANAL' || frequency === 'QUINZENAL' || frequency === 'DIA_DA_SEMANA') {
    return getWeekRange(now).start.toISOString().slice(0, 10)
  }
  if (frequency === 'MENSAL' || frequency === 'DIA_DO_MES') {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }
  if (frequency === 'TRIMESTRAL') {
    return `${now.getFullYear()}-Q${quarterOfMonth(now.getMonth())}`
  }
  return now.toISOString().slice(0, 10)
}

// Cache de fallbacks globais por papel operacional (um lookup por execução).
type RoleFallbacks = Partial<Record<'CS' | 'CRM' | 'SUPERVISOR' | 'HEAD', string | null>>

async function loadRoleFallbacks(): Promise<RoleFallbacks> {
  const roles = ['CS', 'CRM', 'SUPERVISOR', 'HEAD'] as const
  const out: RoleFallbacks = {}
  for (const r of roles) {
    const u = await prisma.user.findFirst({
      where: { operationalRole: r, active: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
    out[r] = u?.id ?? null
  }
  return out
}

type FanoutClient = {
  id: string
  name: string
  gestorId: string | null
  csId: string | null
  supervisorId: string | null
  headId: string | null
  crmId: string | null
  assignments: { userId: string }[]
}

function resolveAssignee(role: string, c: FanoutClient, fb: RoleFallbacks): string | null {
  switch (role) {
    case 'GESTOR':
    case 'MANAGER':
      return c.gestorId ?? c.assignments[0]?.userId ?? null
    case 'CS':
      return c.csId ?? fb.CS ?? null
    case 'CRM':
      return c.crmId ?? fb.CRM ?? null
    case 'SUPERVISOR':
      return c.supervisorId ?? fb.SUPERVISOR ?? null
    case 'HEAD':
      return c.headId ?? fb.HEAD ?? null
    default:
      return null
  }
}

// Tipos mínimos compartilhados pelo helper de criação. O helper recebe rule e
// template SEPARADOS (o template já não-nulo, garantido pelo chamador), então o
// tipo da regra só precisa de id + frequency (evita o mismatch com template anulável).
type RuleRef = {
  id: string
  frequency: string
}

type TemplateWithSteps = {
  id: string
  name: string
  active: boolean
  defaultAssigneeRole: string | null
  defaultType: TaskType
  defaultPriority: TaskPriority
  defaultStatus: TaskStatus
  relativeDueDays: number | null
  slaHours: number | null
  areaId: string | null
  popId: string | null
  steps: { label: string; required: boolean; order: number }[]
}

/**
 * Cria (idempotente) a tarefa recorrente de UMA regra para UM cliente na janela
 * atual. Compartilhado por runTaskRecurrences (cron) e por
 * materializeRecurringTasksForClient (onboarding). Grava AutomationLog em todos
 * os desfechos (sucesso / duplicidade evitada / falha). NÃO lança.
 */
async function createTaskForClientRule(
  rule: RuleRef,
  tpl: TemplateWithSteps,
  client: FanoutClient,
  fallbacks: RoleFallbacks,
  now: Date,
): Promise<'created' | 'skipped' | 'failed'> {
  const role = tpl.defaultAssigneeRole
  try {
    const assigneeId = role ? resolveAssignee(role, client, fallbacks) : null
    if (!assigneeId) {
      await prisma.automationLog.create({
        data: {
          recurrenceId: rule.id,
          clientId: client.id,
          status: 'FALHA',
          reason: `Sem responsável para o papel ${role} (cliente sem ${String(role).toLowerCase()} e sem fallback global)`,
        },
      })
      return 'failed'
    }

    const wkey = windowKey(rule.frequency, now)
    const idempotencyKey = `${tpl.id}:${client.id}:${wkey}`
    const existing = await prisma.task.findUnique({ where: { idempotencyKey }, select: { id: true } })
    if (existing) {
      await prisma.automationLog.create({
        data: { recurrenceId: rule.id, clientId: client.id, status: 'DUPLICIDADE_EVITADA', reason: idempotencyKey },
      })
      return 'skipped'
    }

    const due = tpl.relativeDueDays != null
      ? new Date(now.getTime() + tpl.relativeDueDays * 86_400_000)
      : null

    const task = await prisma.task.create({
      data: {
        title: `${tpl.name} — ${client.name}`,
        type: tpl.defaultType,
        priority: tpl.defaultPriority,
        status: tpl.defaultStatus,
        origin: 'RECORRENCIA',
        clientId: client.id,
        assignedTo: assigneeId,
        areaId: tpl.areaId,
        popId: tpl.popId,
        templateId: tpl.id,
        recurrenceId: rule.id,
        slaHours: tpl.slaHours,
        dueDate: due,
        requestedAt: now,
        idempotencyKey,
        ...(tpl.steps.length
          ? { checklist: { create: tpl.steps.map((s) => ({ label: s.label, required: s.required, order: s.order })) } }
          : {}),
        activities: { create: { actorId: null, action: 'created_by_recurrence' } },
      },
      select: { id: true },
    })

    await prisma.automationLog.create({
      data: { recurrenceId: rule.id, clientId: client.id, assigneeId, createdTaskId: task.id, status: 'SUCESSO' },
    })
    return 'created'
  } catch (err) {
    await prisma.automationLog
      .create({
        data: { recurrenceId: rule.id, clientId: client.id, status: 'FALHA', reason: err instanceof Error ? err.message : String(err) },
      })
      .catch(() => {})
    return 'failed'
  }
}

export async function runTaskRecurrences(opts: { force?: boolean } = {}): Promise<{
  rulesProcessed: number
  created: number
  skipped: number
  failed: number
}> {
  const now = new Date()
  const rules = await prisma.taskRecurrenceRule.findMany({
    where: { active: true },
    include: { template: { include: { steps: true } } },
  })

  let created = 0
  let skipped = 0
  let failed = 0

  // Carrega fallbacks globais uma única vez (lazy: só se algum template precisar).
  let fallbacks: RoleFallbacks | null = null

  for (const rule of rules) {
    const tpl = rule.template
    if (!tpl || !tpl.active) continue
    if (
      !opts.force &&
      !shouldRunToday(rule.frequency, rule.dayOfWeek, rule.dayOfMonth, rule.anchorDate ?? null, now)
    ) {
      continue
    }

    const role = tpl.defaultAssigneeRole
    // Fan-out por cliente ativo para QUALQUER papel suportado.
    if (role && CLIENT_FANOUT_ROLES.has(role)) {
      if (!fallbacks) fallbacks = await loadRoleFallbacks()

      const clients = await prisma.client.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          gestorId: true,
          csId: true,
          supervisorId: true,
          headId: true,
          crmId: true,
          assignments: { where: { isPrimary: true }, select: { userId: true }, take: 1 },
        },
      })

      for (const c of clients) {
        const outcome = await createTaskForClientRule(rule, tpl, c, fallbacks, now)
        if (outcome === 'created') created++
        else if (outcome === 'skipped') skipped++
        else failed++
      }
    }

    await prisma.taskRecurrenceRule.update({ where: { id: rule.id }, data: { lastRunAt: now } })
  }

  return { rulesProcessed: rules.length, created, skipped, failed }
}

/**
 * Materializa AGORA as tarefas recorrentes (fan-out por papel) de UM cliente —
 * usado no onboarding para o cliente já nascer com todas as recorrentes da
 * janela atual, sem esperar o cron. Reutiliza EXATAMENTE a mesma lógica de
 * runTaskRecurrences (resolveAssignee, windowKey, idempotencyKey, criação de
 * Task + checklist + AutomationLog) via createTaskForClientRule.
 *
 * Por padrão (onboarding) materializa a janela atual de TODAS as regras ativas
 * (equivalente a `force` para aquele cliente). Se opts.onlyDueToday, respeita
 * shouldRunToday.
 *
 * Idempotente: a idempotencyKey `${tpl.id}:${clientId}:${wkey}` garante que
 * rodar de novo não duplica. Cliente não-ACTIVE não materializa (retorna zeros).
 */
export async function materializeRecurringTasksForClient(
  clientId: string,
  opts: { onlyDueToday?: boolean } = {},
): Promise<{ created: number; skipped: number; failed: number }> {
  const now = new Date()

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      status: true,
      gestorId: true,
      csId: true,
      supervisorId: true,
      headId: true,
      crmId: true,
      assignments: { where: { isPrimary: true }, select: { userId: true }, take: 1 },
    },
  })

  if (!client) {
    return { created: 0, skipped: 0, failed: 0 }
  }

  if (client.status !== 'ACTIVE') {
    await prisma.automationLog
      .create({
        data: {
          clientId: client.id,
          status: 'FALHA',
          reason: `Materialização de recorrentes ignorada: cliente não está ACTIVE (status=${client.status})`,
        },
      })
      .catch(() => {})
    return { created: 0, skipped: 0, failed: 0 }
  }

  const rules = await prisma.taskRecurrenceRule.findMany({
    where: { active: true },
    include: { template: { include: { steps: true } } },
  })

  const fallbacks = await loadRoleFallbacks()

  let created = 0
  let skipped = 0
  let failed = 0

  for (const rule of rules) {
    const tpl = rule.template
    if (!tpl || !tpl.active) continue

    const role = tpl.defaultAssigneeRole
    if (!role || !CLIENT_FANOUT_ROLES.has(role)) continue

    if (
      opts.onlyDueToday &&
      !shouldRunToday(rule.frequency, rule.dayOfWeek, rule.dayOfMonth, rule.anchorDate ?? null, now)
    ) {
      continue
    }

    const outcome = await createTaskForClientRule(rule, tpl, client, fallbacks, now)
    if (outcome === 'created') created++
    else if (outcome === 'skipped') skipped++
    else failed++
  }

  return { created, skipped, failed }
}
