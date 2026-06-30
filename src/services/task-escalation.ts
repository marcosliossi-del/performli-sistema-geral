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

const ESCALATE_AFTER_DAYS = 2

export async function escalateOverdueTasks(): Promise<{ checked: number; escalated: number; failed: number }> {
  const cutoff = new Date(Date.now() - ESCALATE_AFTER_DAYS * 86_400_000)

  const tasks = await prisma.task.findMany({
    where: {
      status: { notIn: ['CONCLUIDO', 'CANCELADO'] },
      dueDate: { lt: cutoff },
      NOT: { tags: { has: 'escalado' } },
    },
    select: { id: true, priority: true },
  })

  let escalated = 0
  let failed = 0

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
    } catch (err) {
      await prisma.automationLog
        .create({ data: { status: 'FALHA', reason: err instanceof Error ? err.message : String(err) } })
        .catch(() => {})
      failed++
    }
  }

  return { checked: tasks.length, escalated, failed }
}
