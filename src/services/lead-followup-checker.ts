/**
 * CAP-01 — Follow-up comercial.
 *
 * Roda no cron diário. Encontra leads em negociação ativa (quentes) que estão SEM
 * próximo contato (nenhuma atividade recente) e que ainda não têm uma tarefa de
 * follow-up aberta, e gera uma Task FOLLOWUP vinculada ao lead — para que nenhum
 * lead quente seja esquecido.
 *
 * Reusa Task + AgencyLead (sem model novo). Idempotente por lead (não duplica
 * follow-up aberto). try/catch por lead. AutomationLog por resultado.
 */

import { prisma } from '@/lib/prisma'
import { statusIdFor } from '@/lib/tasks/statusMap'
import type { AgencyLeadStatus } from '@prisma/client'

// Estágios "quentes" (em negociação) — NOVO/FECHADO/PERDIDO ficam de fora.
const HOT_STATUSES: AgencyLeadStatus[] = ['EM_CONTATO', 'REUNIAO_AGENDADA', 'PROPOSTA_ENVIADA', 'PROPOSTA_ACEITA']
const STALE_DAYS = 3

export async function checkLeadFollowups(): Promise<{ leadsChecked: number; created: number; skipped: number; failed: number }> {
  const now = new Date()
  const staleBefore = new Date(now.getTime() - STALE_DAYS * 86_400_000)

  const leads = await prisma.agencyLead.findMany({
    where: { status: { in: HOT_STATUSES }, deletedAt: null, convertedClientId: null },
    select: {
      id: true,
      name: true,
      status: true,
      expectedCloseAt: true,
      activities: { orderBy: { occurredAt: 'desc' }, take: 1, select: { occurredAt: true, userId: true } },
    },
  })

  // Usuário comercial de fallback (ADMIN ativo) caso o lead não tenha dono por atividade.
  const fallback = await prisma.user.findFirst({
    where: { active: true, role: 'ADMIN' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })

  let created = 0
  let skipped = 0
  let failed = 0

  for (const lead of leads) {
    try {
      const lastAt = lead.activities[0]?.occurredAt ?? null
      // Tem contato recente → não precisa de follow-up agora.
      if (lastAt && new Date(lastAt).getTime() >= staleBefore.getTime()) { skipped++; continue }

      // Já existe follow-up aberto para este lead → não duplica.
      const open = await prisma.task.findFirst({
        where: { leadId: lead.id, type: 'FOLLOWUP', status: { notIn: ['CONCLUIDO', 'CANCELADO'] } },
        select: { id: true },
      })
      if (open) { skipped++; continue }

      const assignee = lead.activities[0]?.userId ?? fallback?.id
      if (!assignee) {
        await prisma.automationLog.create({ data: { status: 'FALHA', reason: `Lead ${lead.name}: sem responsável p/ follow-up` } })
        failed++
        continue
      }

      const diasSemContato = lastAt ? Math.floor((now.getTime() - new Date(lastAt).getTime()) / 86_400_000) : null

      await prisma.task.create({
        data: {
          title: `Follow-up comercial — ${lead.name}`,
          description: diasSemContato != null
            ? `Lead quente sem contato há ${diasSemContato} dias. Definir e registrar o próximo passo.`
            : 'Lead quente sem nenhum contato registrado. Fazer o primeiro follow-up e registrar.',
          type: 'FOLLOWUP',
          priority: 'ALTA',
          status: 'A_FAZER',
          statusId: statusIdFor('A_FAZER'), // espelho FK (D-004)
          origin: 'AUTOMACAO',
          assignedTo: assignee,
          leadId: lead.id,
          areaId: 'area_comercial',
          popId: 'pop_cap_01',
          requestedAt: now,
          dueDate: new Date(now.getTime() + 86_400_000),
          slaHours: 24,
          idempotencyKey: `lead-followup:${lead.id}:${now.toISOString().slice(0, 10)}`,
          activities: { create: { actorId: null, action: 'created' } },
        },
      })

      await prisma.automationLog.create({ data: { status: 'SUCESSO', reason: `Follow-up criado p/ lead ${lead.name}` } })
      created++
    } catch (err) {
      await prisma.automationLog
        .create({ data: { status: 'FALHA', reason: err instanceof Error ? err.message : String(err) } })
        .catch(() => {})
      failed++
    }
  }

  return { leadsChecked: leads.length, created, skipped, failed }
}
