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
import { getWeekRange, saoPauloDateString, startOfTodaySaoPaulo } from '@/lib/utils'
import { parseDateInput } from '@/lib/tasks/dateInput'
import { statusIdFor } from '@/lib/tasks/statusMap'
import type { TaskType, TaskPriority, TaskStatus } from '@prisma/client'

// Papéis suportados pelo fan-out por cliente ativo.
const CLIENT_FANOUT_ROLES = new Set(['GESTOR', 'MANAGER', 'CS', 'CRM', 'SUPERVISOR', 'HEAD'])

function quarterOfMonth(month0: number): number {
  return Math.floor(month0 / 3) + 1 // month0: 0-11 → Q1..Q4
}

// T-18: agendamento calculado no fuso da operação (America/Sao_Paulo), NÃO no
// fuso do servidor. Extrai a data-parede SP e deriva dia-da-semana/dia-do-mês
// via meio-dia UTC do MESMO dia-calendário (imune a off-by-one).
type SpParts = { year: number; month0: number; dom: number; dow: number; lastDay: number }

function saoPauloParts(instant: Date): SpParts {
  const ds = saoPauloDateString(instant) // 'YYYY-MM-DD' na parede de SP
  const [y, m, d] = ds.split('-').map(Number)
  const noon = new Date(`${ds}T12:00:00Z`)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate() // último dia do mês
  return { year: y, month0: m - 1, dom: d, dow: noon.getUTCDay(), lastDay }
}

// T-18: prazo (dueDate) ancorado na data-parede SP + n dias corridos, meio-dia
// UTC (padrão spDatePlus/parseDateInput do resto do sistema). Evita o clone
// nascer com prazo de ontem por diferença de fuso.
function spDatePlus(days: number, now: Date): Date {
  const anchor = new Date(`${saoPauloDateString(now)}T12:00:00Z`)
  const target = new Date(anchor.getTime() + days * 86_400_000)
  return parseDateInput(target.toISOString().slice(0, 10))
}

/**
 * Verdadeiro se a regra dispara na data-parede SP de `now`. Exportado para a
 * tela /recorrencias calcular a "próxima execução" real reusando EXATAMENTE a
 * mesma régua do cron (T-30) — sem duplicar a lógica de agendamento.
 */
export function shouldRunToday(
  frequency: string,
  dayOfWeek: number | null,
  dayOfMonth: number | null,
  anchorDate: Date | null,
  now: Date,
): boolean {
  const { year, month0, dom, dow: day, lastDay } = saoPauloParts(now)
  switch (frequency) {
    case 'DIARIA': return true
    case 'DIA_UTIL': return day >= 1 && day <= 5
    case 'SEMANAL':
    case 'QUINZENAL':
    case 'DIA_DA_SEMANA': return day === (dayOfWeek ?? 1)
    case 'MENSAL':
    case 'DIA_DO_MES': {
      // T-18: clamp ao último dia do mês — dia 29/30/31 dispara no último dia de
      // meses curtos (fev, abr, …) em vez de ser pulado silenciosamente.
      const target = Math.min(dayOfMonth ?? 1, lastDay)
      return dom === target
    }
    case 'TRIMESTRAL': {
      // Dispara no dia-âncora do ciclo de 90 dias. Se houver anchorDate, dispara
      // quando o dia-do-mês bate com o da âncora E estamos num mês de início de
      // trimestre relativo à âncora. Sem âncora: trata como MENSAL no dia 1, mas
      // só nos meses que abrem trimestre (jan/abr/jul/out → month0 % 3 === 0).
      if (anchorDate) {
        const ap = saoPauloParts(anchorDate)
        const anchorDom = Math.min(ap.dom, lastDay) // clamp igual ao mensal
        if (dom !== anchorDom) return false
        const monthsDiff = (year - ap.year) * 12 + (month0 - ap.month0)
        return monthsDiff >= 0 && monthsDiff % 3 === 0
      }
      const target = Math.min(dayOfMonth ?? 1, lastDay)
      return dom === target && month0 % 3 === 0
    }
    default: return false // POR_* são event-driven (BLOCO 6)
  }
}

/**
 * T-16/T-17: registra UMA falha por regra por dia (dedupe determinístico por
 * recurrenceId + reason + janela do dia SP). Evita floodar o AutomationLog a
 * cada rodada do cron, mas garante que a série parada aparece no radar. NÃO lança.
 */
async function logRuleFailureDaily(recurrenceId: string, reason: string, now: Date): Promise<void> {
  try {
    const dayStart = startOfTodaySaoPaulo(now)
    const existing = await prisma.automationLog.findFirst({
      where: { recurrenceId, status: 'FALHA', reason, createdAt: { gte: dayStart } },
      select: { id: true },
    })
    if (existing) return
    await prisma.automationLog.create({ data: { recurrenceId, status: 'FALHA', reason } })
  } catch {
    // best-effort: o log de falha nunca pode derrubar o motor.
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

    // T-18: prazo ancorado na parede SP (meio-dia UTC), não no fuso do servidor.
    const due = tpl.relativeDueDays != null ? spDatePlus(tpl.relativeDueDays, now) : null

    const task = await prisma.task.create({
      data: {
        title: `${tpl.name} — ${client.name}`,
        type: tpl.defaultType,
        priority: tpl.defaultPriority,
        status: tpl.defaultStatus,
        statusId: statusIdFor(tpl.defaultStatus), // espelho FK (D-004)
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
  // T-19: regra arquivada NUNCA roda — está fora do motor de forma definitiva.
  const rules = await prisma.taskRecurrenceRule.findMany({
    where: { active: true, archivedAt: null },
    include: { template: { include: { steps: true } } },
  })

  let created = 0
  let skipped = 0
  let failed = 0

  // Carrega fallbacks globais uma única vez (lazy: só se algum template precisar).
  let fallbacks: RoleFallbacks | null = null

  for (const rule of rules) {
    // try/catch por regra (CLAUDE.md #7): uma regra problemática NÃO pode
    // derrubar o processamento das demais recorrências.
    try {
      const tpl = rule.template
      const ruleLabel = tpl?.name ?? 'sem modelo'
      // T-16: regra ativa apontando para modelo desativado/inexistente para de
      // gerar tarefas em silêncio. Registra 1x/dia e NÃO avança lastRunAt (a
      // série fica "parada" no radar de rotinas).
      if (!tpl || !tpl.active) {
        await logRuleFailureDaily(
          rule.id,
          `Regra "${ruleLabel}" aponta para modelo de tarefa ${tpl ? 'desativado' : 'inexistente'} — série parada, nenhuma tarefa será criada`,
          now,
        )
        continue
      }
      if (
        !opts.force &&
        !shouldRunToday(rule.frequency, rule.dayOfWeek, rule.dayOfMonth, rule.anchorDate ?? null, now)
      ) {
        continue
      }

      const role = tpl.defaultAssigneeRole
      // T-17: papel que o fan-out não sabe resolver (ADMIN/ANALYST/nulo) gera
      // ZERO tarefas silenciosamente. Registra 1x/dia e NÃO avança lastRunAt.
      if (!role || !CLIENT_FANOUT_ROLES.has(role)) {
        await logRuleFailureDaily(
          rule.id,
          `Papel "${role ?? 'não definido'}" não gera tarefas por cliente — corrigir a regra "${ruleLabel}"`,
          now,
        )
        continue
      }

      // Fan-out por cliente ativo. Contadores POR REGRA para o lastRunAt honesto.
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

      let ruleCreated = 0
      let ruleFailed = 0
      for (const c of clients) {
        const outcome = await createTaskForClientRule(rule, tpl, c, fallbacks, now)
        if (outcome === 'created') { created++; ruleCreated++ }
        else if (outcome === 'skipped') { skipped++ }
        else { failed++; ruleFailed++ }
      }

      // T-10: lastRunAt HONESTO. Só marca "rodou" se a regra criou ≥1 tarefa OU
      // rodou sem NENHUMA falha (idempotência já resolvida / zero clientes = nada
      // a fazer, e isso é sucesso). Se todas as tentativas falharam (0 criadas,
      // ≥1 falha), a série pode estar morta: NÃO avança lastRunAt — o sinal
      // "rotina parada" (dal) passa a refletir a realidade — e registra a falha.
      if (ruleCreated >= 1 || ruleFailed === 0) {
        await prisma.taskRecurrenceRule.update({ where: { id: rule.id }, data: { lastRunAt: now } })
      } else {
        await logRuleFailureDaily(
          rule.id,
          `Regra "${ruleLabel}": ${ruleFailed} falha(s), 0 tarefa(s) criada(s) — série pode estar morta`,
          now,
        )
      }
    } catch (err) {
      failed++
      console.error(
        `[recurrence-engine] regra ${rule.id} falhou — pulando para a próxima:`,
        err instanceof Error ? err.message : err,
      )
      continue
    }
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

  // T-19: regra arquivada não materializa nem no onboarding.
  const rules = await prisma.taskRecurrenceRule.findMany({
    where: { active: true, archivedAt: null },
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
