/**
 * Check-in Monitor (OPE-06)
 *
 * Roda no cron diário. Alertas:
 *  1. CHECKIN_MISSING — cliente ativo sem check-in preenchido na semana.
 *     Só dispara de quarta em diante (prazo de preenchimento), dedup ~semanal.
 *  2. CHECKIN_REJECTED_STALE — check-in reprovado há > 2 dias sem nova submissão.
 *  3. (#13) Check-in em degraus — quando o cliente também NÃO teve check-in na
 *     semana ANTERIOR (2ª semana consecutiva sem prestação de contas), a falha
 *     deixa de ser esquecimento e vira gargalo do gestor: cria uma TASK CRÍTICA
 *     ao gestor (owner-resolver) para prestar contas HOJE + um Alert de
 *     escalação (mesmo tipo CHECKIN_MISSING, com tag de dedupe semanal). O
 *     comportamento 1/2 permanece intacto.
 *
 * try/catch POR cliente. Dedup por cliente + tipo (alerts) e por
 * idempotencyKey `auto:checkin-2sem:{clientId}:{weekKey}` (task).
 */

import { prisma } from '@/lib/prisma'
import { getWeekRange, saoPauloDateString } from '@/lib/utils'
import { statusIdFor } from '@/lib/tasks/statusMap'
import { parseDateInput } from '@/lib/tasks/dateInput'
import { resolveClientOwner } from './owner-resolver'

const DAY_MS = 86_400_000
const MISSING_DEDUP_DAYS = 5
const STALE_DEDUP_DAYS = 3
const REJECTED_GRACE_DAYS = 2

// Tag de dedupe do Alert de escalação (#13) — 1 por cliente por semana.
const TAG_2SEM = '[checkin:2sem]'

async function hasRecentAlert(
  clientId: string,
  type: 'CHECKIN_MISSING' | 'CHECKIN_REJECTED_STALE',
  days: number,
): Promise<boolean> {
  const found = await prisma.alert.findFirst({
    where: { clientId, type, createdAt: { gte: new Date(Date.now() - days * DAY_MS) } },
    select: { id: true },
  })
  return !!found
}

/** Data-parede SP de hoje + n dias corridos, como Date de prazo (meio-dia UTC). */
function spDatePlus(days: number, now: Date): Date {
  const anchor = new Date(`${saoPauloDateString(now)}T12:00:00Z`)
  const target = new Date(anchor.getTime() + days * DAY_MS)
  return parseDateInput(target.toISOString().slice(0, 10))
}

/**
 * Cria a TASK crítica da 2ª semana sem check-in ao gestor, com dedupe semanal
 * por idempotencyKey (padrão client-lifecycle-automations). Espelho statusId
 * (D-004), origin AUTOMACAO, TaskActivity 'created', AutomationLog.
 */
async function createCheckin2SemTask(opts: {
  clientId: string
  clientName: string
  assignedTo: string
  weekKey: string
  now: Date
}): Promise<boolean> {
  const idempotencyKey = `auto:checkin-2sem:${opts.clientId}:${opts.weekKey}`
  const exists = await prisma.task.findUnique({ where: { idempotencyKey }, select: { id: true } })
  if (exists) {
    await prisma.automationLog
      .create({
        data: {
          clientId: opts.clientId,
          status: 'DUPLICIDADE_EVITADA',
          reason: `checkin-2sem — task já criada nesta semana (${opts.weekKey})`,
        },
      })
      .catch(() => {})
    return false
  }
  const task = await prisma.task.create({
    data: {
      title: `🔴 2ª semana sem check-in — ${opts.clientName}: prestar contas HOJE`,
      description:
        `${opts.clientName} está há DUAS semanas seguidas sem check-in preenchido — não há prestação de contas nem visibilidade de resultado. O gestor precisa preencher o check-in e prestar contas da conta HOJE; segunda semana sem registro é gargalo do gestor, não esquecimento pontual.`,
      type: 'DEMANDA_INTERNA',
      priority: 'CRITICA',
      status: 'A_FAZER',
      statusId: statusIdFor('A_FAZER'),
      origin: 'AUTOMACAO',
      clientId: opts.clientId,
      assignedTo: opts.assignedTo,
      areaId: 'area_trafego',
      popId: 'pop_ope_06',
      requestedAt: opts.now,
      dueDate: spDatePlus(0, opts.now),
      requiresEvidence: true,
      idempotencyKey,
      isSupport: true,
      supportDirection: 'NOS_PARA_CLIENTE',
      supportCategory: 'TRAFEGO',
      activities: { create: { actorId: null, action: 'created' } },
    },
    select: { id: true },
  })
  await prisma.automationLog.create({
    data: {
      clientId: opts.clientId,
      createdTaskId: task.id,
      assigneeId: opts.assignedTo,
      status: 'SUCESSO',
      reason: `checkin-2sem — task criada (${opts.weekKey})`,
    },
  })
  return true
}

export async function checkCheckins(): Promise<{
  missingAlerts: number
  staleRejectedAlerts: number
  reincidenciaTasks: number
  reincidenciaAlerts: number
}> {
  const { start: weekStart } = getWeekRange()
  const prevWeekStart = new Date(weekStart.getTime() - 7 * DAY_MS)
  const weekKey = weekStart.toISOString().slice(0, 10)
  const nowDate = new Date()
  const dayOfWeek = nowDate.getDay() // 0=Dom ... 3=Qua
  const now = nowDate.getTime()

  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      gestorId: true,
      assignments: { where: { isPrimary: true }, take: 1, select: { userId: true } },
      weeklyCheckins: {
        where: { weekStart: { in: [weekStart, prevWeekStart] } },
        select: { weekStart: true, status: true, reviewedAt: true },
      },
    },
  })

  let missingAlerts = 0
  let staleRejectedAlerts = 0
  let reincidenciaTasks = 0
  let reincidenciaAlerts = 0

  for (const c of clients) {
    try {
      const checkin = c.weeklyCheckins.find(
        (w: (typeof c.weeklyCheckins)[number]) => w.weekStart.getTime() === weekStart.getTime(),
      )
      const prevCheckin = c.weeklyCheckins.find(
        (w: (typeof c.weeklyCheckins)[number]) => w.weekStart.getTime() === prevWeekStart.getTime(),
      )
      const submitted = !!checkin && checkin.status !== 'PENDENTE'
      const prevSubmitted = !!prevCheckin && prevCheckin.status !== 'PENDENTE'

      // 1. Sem check-in (de quarta em diante)
      if (!submitted && dayOfWeek >= 3) {
        if (!(await hasRecentAlert(c.id, 'CHECKIN_MISSING', MISSING_DEDUP_DAYS))) {
          await prisma.alert.create({
            data: {
              clientId: c.id,
              type: 'CHECKIN_MISSING',
              title: `Cliente sem check-in esta semana: ${c.name}`,
              body: `O check-in semanal de ${c.name} ainda não foi preenchido. Sem ele não há prestação de contas nem visibilidade de resultado.`,
            },
          })
          missingAlerts++
        }

        // 3. (#13) Reincidência — também não teve check-in na semana anterior:
        //    2ª semana consecutiva sem prestação de contas → escala.
        if (!prevSubmitted) {
          const { assigneeId: gestorId } = await resolveClientOwner({
            gestorId: c.gestorId,
            assignments: c.assignments,
          })
          if (gestorId) {
            const created = await createCheckin2SemTask({
              clientId: c.id,
              clientName: c.name,
              assignedTo: gestorId,
              weekKey,
              now: nowDate,
            })
            if (created) reincidenciaTasks++
          } else {
            await prisma.automationLog
              .create({
                data: {
                  clientId: c.id,
                  status: 'FALHA',
                  reason: `checkin-2sem — sem gestor/dono resolvível para ${c.name}; task não criada`,
                },
              })
              .catch(() => {})
          }

          // Alert de escalação (mesmo AlertType, dedupe semanal por tag).
          const escalated = await prisma.alert.findFirst({
            where: {
              clientId: c.id,
              type: 'CHECKIN_MISSING',
              createdAt: { gte: weekStart },
              body: { contains: TAG_2SEM },
            },
            select: { id: true },
          })
          if (!escalated) {
            await prisma.alert.create({
              data: {
                clientId: c.id,
                type: 'CHECKIN_MISSING',
                title: `2ª semana consecutiva sem check-in — gestor precisa prestar contas hoje: ${c.name}`,
                body: `${c.name} está há duas semanas seguidas sem check-in preenchido. Não é mais esquecimento pontual — o gestor precisa prestar contas da conta hoje. ${TAG_2SEM}`,
              },
            })
            reincidenciaAlerts++
          }
        }
      }

      // 2. Reprovado sem correção há > 2 dias
      if (checkin?.status === 'REPROVADO' && checkin.reviewedAt) {
        const daysSinceReview = Math.floor((now - new Date(checkin.reviewedAt).getTime()) / DAY_MS)
        if (daysSinceReview >= REJECTED_GRACE_DAYS) {
          if (!(await hasRecentAlert(c.id, 'CHECKIN_REJECTED_STALE', STALE_DEDUP_DAYS))) {
            await prisma.alert.create({
              data: {
                clientId: c.id,
                type: 'CHECKIN_REJECTED_STALE',
                title: `Check-in reprovado sem correção: ${c.name}`,
                body: `O check-in de ${c.name} foi reprovado há ${daysSinceReview} dias e ainda não foi corrigido pelo gestor.`,
              },
            })
            staleRejectedAlerts++
          }
        }
      }
    } catch (err) {
      console.error(`[checkin-monitor] falha no cliente ${c.id}:`, err)
    }
  }

  return { missingAlerts, staleRejectedAlerts, reincidenciaTasks, reincidenciaAlerts }
}
