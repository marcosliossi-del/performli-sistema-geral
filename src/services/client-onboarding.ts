/**
 * ClientOnboardingAgent (FASE 7).
 *
 * Quando um cliente novo entra na operação (createClient ou conversão de lead),
 * este serviço materializa AUTOMATICAMENTE a operação recorrente dele:
 *   1. As tarefas recorrentes (as "15 tarefas") já são criadas na hora, sem
 *      esperar o cron — via materializeRecurringTasksForClient.
 *   2. Um pequeno conjunto de tarefas INICIAIS de onboarding, atribuídas ao
 *      gestor do cliente (kick-off, checklist de acessos, acompanhamento 30d).
 *
 * Regras (CLAUDE.md):
 *  - Idempotente: rodar duas vezes NÃO duplica (recorrentes por idempotencyKey
 *    própria; iniciais por idempotencyKey `onboarding-init:<clientId>:<slug>`).
 *  - try/catch por tarefa — falha em uma não derruba o onboarding inteiro.
 *  - Toda automação gera log (AuditLog com as contagens).
 *  - Cliente sem gestor resolvível ainda recebe as iniciais via fallback HEAD
 *    global; loga e segue.
 */

import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import { statusIdFor } from '@/lib/tasks/statusMap'
import { materializeRecurringTasksForClient } from './recurrence-engine'
import { resolveClientOwner } from './owner-resolver'

type InitialTaskSpec = {
  slug: string
  title: string
  description: string
  dueInDays: number
  priority: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA'
  checklist?: { label: string; required: boolean }[]
}

// Tarefas iniciais de onboarding (não-recorrentes). Atribuídas ao gestor.
const INITIAL_TASKS: InitialTaskSpec[] = [
  {
    slug: 'kickoff',
    title: 'Kick-off com o cliente',
    description: 'Reunião inicial de alinhamento: expectativas, metas, canais e cadência de reporte.',
    dueInDays: 7,
    priority: 'ALTA',
  },
  {
    slug: 'acessos',
    title: 'Checklist de acessos',
    description: 'Coletar e validar acessos: Business Manager, GA4, Nuvemshop e domínios.',
    dueInDays: 5,
    priority: 'ALTA',
    checklist: [
      { label: 'Acesso ao Business Manager (Meta)', required: true },
      { label: 'Acesso ao GA4', required: true },
      { label: 'Acesso à Nuvemshop', required: true },
      { label: 'Acesso aos domínios / DNS', required: false },
    ],
  },
  {
    slug: 'acompanhamento-30d',
    title: 'Acompanhamento reforçado — primeiros 30 dias',
    description: 'Acompanhar de perto o cliente nos primeiros 30 dias para reduzir risco de churn precoce.',
    dueInDays: 30,
    priority: 'ALTA',
  },
]

export async function runClientOnboarding(clientId: string): Promise<{
  recurring: { created: number; skipped: number; failed: number }
  onboardingTasksCreated: number
}> {
  const now = new Date()

  // 1) Recorrentes (as "15 tarefas") — idempotente e com log próprio.
  const recurring = await materializeRecurringTasksForClient(clientId)

  // 2) Tarefas iniciais de onboarding.
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      status: true,
      gestorId: true,
      assignments: { where: { isPrimary: true }, select: { userId: true }, take: 1 },
    },
  })

  let onboardingTasksCreated = 0

  if (!client) {
    await writeAuditLog({
      action: 'client.onboarding',
      entityType: 'Client',
      entityId: clientId,
      clientId,
      metadata: { error: 'client_not_found', recurring },
    })
    return { recurring, onboardingTasksCreated: 0 }
  }

  // Área de onboarding (se existir) para popId/areaId das iniciais.
  const onboardingArea = await prisma.taskArea
    .findFirst({ where: { code: 'ONBOARDING' }, select: { id: true } })
    .catch(() => null)
  const areaId = onboardingArea?.id ?? null

  const { assigneeId, usedFallback } = await resolveClientOwner(client)

  if (!assigneeId) {
    await prisma.automationLog
      .create({
        data: {
          clientId: client.id,
          status: 'FALHA',
          reason: 'Onboarding: sem gestor resolvível e sem fallback HEAD global — tarefas iniciais não criadas',
        },
      })
      .catch(() => {})
  } else {
    for (const spec of INITIAL_TASKS) {
      try {
        const idempotencyKey = `onboarding-init:${client.id}:${spec.slug}`
        const existing = await prisma.task.findUnique({
          where: { idempotencyKey },
          select: { id: true },
        })
        if (existing) continue

        await prisma.task.create({
          data: {
            title: `${spec.title} — ${client.name}`,
            description: spec.description,
            type: 'ONBOARDING',
            priority: spec.priority,
            status: 'A_FAZER',
            statusId: statusIdFor('A_FAZER'), // espelho FK (D-004)
            origin: 'AUTOMACAO',
            clientId: client.id,
            assignedTo: assigneeId,
            areaId,
            requestedAt: now,
            dueDate: new Date(now.getTime() + spec.dueInDays * 86_400_000),
            idempotencyKey,
            ...(spec.checklist?.length
              ? {
                  checklist: {
                    create: spec.checklist.map((c, i) => ({
                      label: c.label,
                      required: c.required,
                      order: i,
                    })),
                  },
                }
              : {}),
            activities: { create: { actorId: null, action: 'created_by_onboarding' } },
          },
        })
        onboardingTasksCreated++
      } catch (err) {
        await prisma.automationLog
          .create({
            data: {
              clientId: client.id,
              status: 'FALHA',
              reason: `Onboarding: falha ao criar tarefa inicial "${spec.slug}": ${
                err instanceof Error ? err.message : String(err)
              }`,
            },
          })
          .catch(() => {})
      }
    }
  }

  await writeAuditLog({
    action: 'client.onboarding',
    entityType: 'Client',
    entityId: client.id,
    clientId: client.id,
    metadata: {
      recurring,
      onboardingTasksCreated,
      ownerAssigneeId: assigneeId,
      ownerUsedFallback: usedFallback,
    },
  })

  return { recurring, onboardingTasksCreated }
}
