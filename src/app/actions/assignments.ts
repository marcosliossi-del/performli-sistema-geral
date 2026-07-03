'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { writeAuditLog } from '@/lib/audit'
import type { TaskStatus } from '@prisma/client'

// Status considerados EM ABERTO (uma tarefa órfã só faz sentido se ainda
// precisa de ação). Concluídas/canceladas ficam intocadas (S2-017).
const OPEN_TASK_STATUSES: TaskStatus[] = [
  'A_FAZER',
  'EM_ANDAMENTO',
  'AGUARDANDO_CLIENTE',
  'AGUARDANDO_GESTOR',
  'AGUARDANDO_CS',
  'EM_VALIDACAO',
  'AJUSTES_SOLICITADOS',
  'BLOQUEADO',
  'ATRASADO',
]

export async function updateClientPrimaryManager(
  clientId: string,
  managerId: string,
): Promise<{ error?: string }> {
  const session = await requireSession()
  if (session.role !== 'ADMIN') return { error: 'Sem permissão.' }

  if (!clientId || !managerId) return { error: 'Dados inválidos.' }

  // Verify manager exists and is active
  const manager = await prisma.user.findFirst({
    where: { id: managerId, active: true },
    select: { id: true },
  })
  if (!manager) return { error: 'Gestor não encontrado.' }

  // Gestor anterior (assignment primária vigente) — antes de trocar, para
  // sabermos de quem herdar as tarefas automáticas órfãs (S2-017).
  const previousPrimary = await prisma.clientAssignment.findFirst({
    where: { clientId, isPrimary: true },
    select: { userId: true },
  })
  const previousManagerId = previousPrimary?.userId ?? null

  let reassignedTasks = 0

  // Tudo na MESMA transação: troca da carteira + sync de Client.gestorId +
  // reatribuição das tarefas automáticas em aberto do gestor antigo.
  try {
    reassignedTasks = await prisma.$transaction(async (tx) => {
      // Remove primary flag from all existing assignments for this client
      await tx.clientAssignment.updateMany({
        where: { clientId, isPrimary: true },
        data: { isPrimary: false },
      })

      // Upsert the new primary assignment
      await tx.clientAssignment.upsert({
        where: { clientId_userId: { clientId, userId: managerId } },
        create: { clientId, userId: managerId, isPrimary: true },
        update: { isPrimary: true },
      })

      // Mantém Client.gestorId (dono canônico) em sincronia com a assignment
      // primária, para a precedência do resultado-engine (S2-016) não divergir.
      await tx.client.update({
        where: { id: clientId },
        data: { gestorId: managerId },
      })

      // Reatribui tarefas AUTOMÁTICAS EM ABERTO do gestor antigo para o novo.
      // Conservador (S2-017): só toca tasks do cliente, geradas por automação
      // (origin=AUTOMACAO), que ainda estão em aberto e cujo responsável era o
      // gestor ANTIGO. NÃO mexe em concluídas/canceladas, nem em tasks manuais
      // ou de outros responsáveis. Só reatribui assignedTo (não altera status,
      // logo não há espelho statusId a atualizar — D-005 não se aplica).
      if (previousManagerId && previousManagerId !== managerId) {
        const res = await tx.task.updateMany({
          where: {
            clientId,
            assignedTo: previousManagerId,
            origin: 'AUTOMACAO',
            status: { in: OPEN_TASK_STATUSES },
          },
          data: { assignedTo: managerId },
        })
        return res.count
      }
      return 0
    })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Falha ao trocar o gestor.' }
  }

  // Auditoria da reatribuição (CLAUDE.md #8), com a contagem.
  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'client.reatribuicaoTarefas',
    entityType: 'Client',
    entityId: clientId,
    clientId,
    metadata: {
      previousManagerId,
      newManagerId: managerId,
      reassignedTasks,
      criteria: 'origin=AUTOMACAO, status em aberto, assignedTo=gestorAnterior',
    },
  })

  // Revalidate all pages that show manager/assignment data
  revalidatePath('/managers')
  revalidatePath('/managers/assignments')
  revalidatePath('/cockpit')
  revalidatePath('/clients')
  revalidatePath('/team')

  return {}
}
