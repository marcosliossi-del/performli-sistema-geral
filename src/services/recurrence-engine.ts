/**
 * Motor de recorrência (BLOCO 3).
 *
 * Roda via cron. Para cada TaskRecurrenceRule ativa cujo agendamento bate com
 * hoje, gera tarefas a partir do template — fan-out POR CLIENTE ATIVO (templates
 * com defaultAssigneeRole = MANAGER são atribuídos ao gestor primário).
 *
 * Idempotência: chave (template + cliente + janela). Rodar o cron duas vezes no
 * mesmo período NÃO duplica. Toda geração grava AutomationLog (sucesso / falha /
 * duplicidade evitada). try/catch por cliente.
 */

import { prisma } from '@/lib/prisma'
import { getWeekRange } from '@/lib/utils'

function shouldRunToday(frequency: string, dayOfWeek: number | null, dayOfMonth: number | null, now: Date): boolean {
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
  return now.toISOString().slice(0, 10)
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

  for (const rule of rules) {
    const tpl = rule.template
    if (!tpl || !tpl.active) continue
    if (!opts.force && !shouldRunToday(rule.frequency, rule.dayOfWeek, rule.dayOfMonth, now)) continue

    const wkey = windowKey(rule.frequency, now)

    // Fan-out por cliente ativo (templates de gestor)
    if (tpl.defaultAssigneeRole === 'MANAGER') {
      const clients = await prisma.client.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          assignments: { where: { isPrimary: true }, select: { userId: true }, take: 1 },
        },
      })

      for (const c of clients) {
        try {
          const managerId = c.assignments[0]?.userId
          if (!managerId) {
            await prisma.automationLog.create({
              data: { recurrenceId: rule.id, clientId: c.id, status: 'FALHA', reason: 'Cliente sem gestor primário' },
            })
            failed++
            continue
          }

          const idempotencyKey = `${tpl.id}:${c.id}:${wkey}`
          const existing = await prisma.task.findUnique({ where: { idempotencyKey }, select: { id: true } })
          if (existing) {
            await prisma.automationLog.create({
              data: { recurrenceId: rule.id, clientId: c.id, status: 'DUPLICIDADE_EVITADA', reason: idempotencyKey },
            })
            skipped++
            continue
          }

          const due = tpl.relativeDueDays != null
            ? new Date(now.getTime() + tpl.relativeDueDays * 86_400_000)
            : null

          const task = await prisma.task.create({
            data: {
              title: `${tpl.name} — ${c.name}`,
              type: tpl.defaultType,
              priority: tpl.defaultPriority,
              status: tpl.defaultStatus,
              origin: 'RECORRENCIA',
              clientId: c.id,
              assignedTo: managerId,
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
            data: { recurrenceId: rule.id, clientId: c.id, assigneeId: managerId, createdTaskId: task.id, status: 'SUCESSO' },
          })
          created++
        } catch (err) {
          await prisma.automationLog
            .create({
              data: { recurrenceId: rule.id, clientId: c.id, status: 'FALHA', reason: err instanceof Error ? err.message : String(err) },
            })
            .catch(() => {})
          failed++
        }
      }
    }

    await prisma.taskRecurrenceRule.update({ where: { id: rule.id }, data: { lastRunAt: now } })
  }

  return { rulesProcessed: rules.length, created, skipped, failed }
}
