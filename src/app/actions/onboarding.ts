'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { assertClientMutationAccess, writeAuditLog } from '@/lib/audit'
import { runClientOnboarding } from '@/services/client-onboarding'

export type ApplyOnboardingResult =
  | { ok: true; created: number; skipped: number; alreadyApplied: boolean; message: string }
  | { error: string }

/**
 * Aplica o "onboarding" do cliente em 1 clique (FATIA 4).
 *
 * Onboarding no Performli NÃO é um conjunto de linhas `TaskTemplate` marcadas —
 * é o serviço canônico `runClientOnboarding`, o MESMO caminho usado na criação
 * do cliente e reaproveitado pelo cron de recorrência
 * (`materializeRecurringTasksForClient`). Ele materializa:
 *   1. as tarefas recorrentes da janela atual (fan-out por papel), e
 *   2. as tarefas iniciais de onboarding (kick-off, acessos, acompanhamento 30d).
 *
 * Idempotência: garantida pelo próprio serviço — recorrentes por
 * idempotencyKey `${templateId}:${clientId}:<janela>` e iniciais por
 * `onboarding-init:${clientId}:<slug>`. Rodar de novo NÃO duplica (tarefa já
 * originada do mesmo template na janela é pulada).
 *
 * Autorização (CLAUDE.md #2): autenticação (requireSession) + papel + posse
 * (assertClientMutationAccess — ADMIN/SUPERVISOR/ANALISTA amplo, CS acompanha,
 * GESTOR só na carteira própria). AuditLog da ação (regra #8) + revalidatePath.
 */
export async function applyOnboardingTemplates(clientId: string): Promise<ApplyOnboardingResult> {
  if (!clientId) return { error: 'Cliente não informado.' }

  const session = await requireSession()

  // Papel + posse. Lança string operacional quando negado.
  try {
    await assertClientMutationAccess(session, clientId, { allowCS: true })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Sem permissão para aplicar o onboarding deste cliente.' }
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, slug: true, status: true },
  })
  if (!client) return { error: 'Cliente não encontrado.' }
  if (client.status !== 'ACTIVE') {
    return { error: 'Só é possível aplicar o onboarding em clientes ativos.' }
  }

  let result: { recurring: { created: number; skipped: number; failed: number }; onboardingTasksCreated: number }
  try {
    result = await runClientOnboarding(client.id)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Falha ao aplicar o onboarding.' }
  }

  const created = result.recurring.created + result.onboardingTasksCreated
  const skipped = result.recurring.skipped
  const alreadyApplied = created === 0

  // Auditoria da ação manual (o serviço já loga a automação; aqui registra QUEM
  // disparou o botão, para separar do disparo automático de criação de cliente).
  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'client.onboarding.apply_manual',
    entityType: 'Client',
    entityId: client.id,
    clientId: client.id,
    metadata: {
      created,
      skipped,
      recurringCreated: result.recurring.created,
      onboardingTasksCreated: result.onboardingTasksCreated,
    },
  })

  revalidatePath(`/clients/${client.slug}`)
  revalidatePath('/operacional')

  const message = alreadyApplied
    ? 'Cliente já tem onboarding aplicado — nenhuma tarefa nova foi criada.'
    : `${created} tarefa${created > 1 ? 's' : ''} de onboarding criada${created > 1 ? 's' : ''}.`

  return { ok: true, created, skipped, alreadyApplied, message }
}
