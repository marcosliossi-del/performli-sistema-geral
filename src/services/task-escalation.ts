/**
 * BLOCO 6 — Escalonamento de tarefas atrasadas.
 *
 * Roda no cron diário. Tarefa aberta atrasada há 2+ dias e ainda não escalada é
 * marcada (tag "escalado"), tem a prioridade elevada e registra atividade — para
 * saltar na Central, no Meu Dia e na carga por gestor (sinal ao supervisor).
 *
 * Idempotente pela tag "escalado". try/catch por tarefa.
 */

import { prisma } from '@/lib/prisma'
import { statusIdFor } from '@/lib/tasks/statusMap'

const ESCALATE_AFTER_DAYS = 2

/**
 * #2 (padrão-raiz) — a escalação AVISA. Antes, `escalateOverdueTasks` só subia
 * prioridade + tag `escalado` e ninguém era notificado: a task crítica de
 * retenção morria em silêncio. Agora, quando a task escalada é CRÍTICA (ou de
 * origem AUTOMACAO com prioridade ALTA/CRITICA), abrimos um Alert operacional
 * direcionado ao cliente, nomeando o responsável e há quantos dias venceu.
 * Dedupe: 1 Alert por task por semana (type TASK_AUTOMATION + clientId + body
 * contendo o taskId, dentro da janela de 7 dias).
 */
const ESCALATION_ALERT_WINDOW_DAYS = 7

export async function escalateOverdueTasks(): Promise<{ checked: number; escalated: number; failed: number; alerts: number }> {
  const now = Date.now()
  const cutoff = new Date(now - ESCALATE_AFTER_DAYS * 86_400_000)

  const tasks = await prisma.task.findMany({
    where: {
      status: { notIn: ['CONCLUIDO', 'CANCELADO'] },
      dueDate: { lt: cutoff },
      NOT: { tags: { has: 'escalado' } },
    },
    select: {
      id: true,
      title: true,
      priority: true,
      origin: true,
      clientId: true,
      dueDate: true,
      user: { select: { name: true } },
    },
  })

  let escalated = 0
  let failed = 0
  let alerts = 0

  for (const t of tasks) {
    try {
      const bumped = t.priority === 'CRITICA' || t.priority === 'ALTA' ? t.priority : 'ALTA'
      await prisma.task.update({
        where: { id: t.id },
        data: {
          priority: bumped,
          tags: { push: 'escalado' },
          delayReason: `Atrasada há mais de ${ESCALATE_AFTER_DAYS} dias — escalada automaticamente.`,
          activities: { create: { actorId: null, action: 'escalated' } },
        },
      })
      await prisma.automationLog.create({ data: { status: 'SUCESSO', reason: `Tarefa ${t.id} escalada` } }).catch(() => {})
      escalated++

      // ── #2: Alert operacional para task crítica/automação escalada ──────────
      // Alert exige clientId — tasks sem cliente são puladas (só sobem prioridade).
      const critica =
        t.priority === 'CRITICA' ||
        (t.origin === 'AUTOMACAO' && (t.priority === 'ALTA' || t.priority === 'CRITICA'))
      if (critica && t.clientId) {
        try {
          const dias = t.dueDate
            ? Math.max(ESCALATE_AFTER_DAYS, Math.floor((now - new Date(t.dueDate).getTime()) / 86_400_000))
            : ESCALATE_AFTER_DAYS
          const windowStart = new Date(now - ESCALATION_ALERT_WINDOW_DAYS * 86_400_000)
          const existing = await prisma.alert.findFirst({
            where: {
              clientId: t.clientId,
              type: 'TASK_AUTOMATION',
              createdAt: { gte: windowStart },
              body: { contains: t.id },
            },
            select: { id: true },
          })
          if (!existing) {
            const responsavel = t.user?.name?.trim() || 'responsável não definido'
            await prisma.alert.create({
              data: {
                clientId: t.clientId,
                type: 'TASK_AUTOMATION',
                title: `Tarefa crítica vencida há ${dias} dias — ${responsavel} ainda não agiu`,
                body: `A tarefa "${t.title}" (responsável: ${responsavel}) venceu há ${dias} dias e foi escalada automaticamente. Cobre a ação ou reatribua antes que vire risco de churn. [task ${t.id}]`,
              },
            })
            alerts++
          }
        } catch (alertErr) {
          await prisma.automationLog
            .create({ data: { clientId: t.clientId, status: 'FALHA', reason: `Alert de escalação da tarefa ${t.id} — ${alertErr instanceof Error ? alertErr.message : String(alertErr)}` } })
            .catch(() => {})
        }
      }
    } catch (err) {
      await prisma.automationLog
        .create({ data: { status: 'FALHA', reason: err instanceof Error ? err.message : String(err) } })
        .catch(() => {})
      failed++
    }
  }

  return { checked: tasks.length, escalated, failed, alerts }
}

/**
 * Marca como ATRASADO tarefas vencidas que ainda não foram iniciadas nem
 * concluídas. Conservador: só transiciona A_FAZER e AJUSTES_SOLICITADOS (sinal
 * claro de "deveria estar feita e não está"), sem tocar em tarefas EM_ANDAMENTO,
 * EM_VALIDACAO, AGUARDANDO_* ou BLOQUEADO (estados intencionais). Roda no cron
 * diário ANTES da escalação. Idempotente (updateMany por condição).
 */
export async function markOverdueTasks(): Promise<{ marked: number }> {
  const now = new Date()
  const res = await prisma.task.updateMany({
    where: {
      dueDate: { lt: now },
      status: { in: ['A_FAZER', 'AJUSTES_SOLICITADOS'] },
    },
    // Espelho statusId (D-004): mantém a FK coerente com o enum.
    data: { status: 'ATRASADO', statusId: statusIdFor('ATRASADO') },
  })
  return { marked: res.count }
}
