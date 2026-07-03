'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { assertClientMutationAccess, writeAuditLog } from '@/lib/audit'
import { getWeekRange } from '@/lib/utils'

type ActionResult = { ok: true } | { error: string }

export type CheckinContent = {
  resultadoSemana: string
  oQueFoiFeito: string
  proximosPassos: string
}

/**
 * OPE-06 — Gestor preenche/atualiza o check-in semanal de um cliente.
 * Evidência mínima: os três campos são obrigatórios. Move para PREENCHIDO.
 */
// Janela de correção pós-reprovação: o gestor pode reenviar a semana REPROVADA
// por até 14 dias após a reprovação da CS (T-05). Depois disso, corrige na
// semana atual — a passada fica no histórico.
const CORRECTION_WINDOW_MS = 14 * 86_400_000

export async function submitCheckin(
  clientId: string,
  content: CheckinContent,
  weekStartStr?: string,
): Promise<ActionResult> {
  const session = await requireSession()

  // Preencher é papel do gestor (ADMIN ou MANAGER atribuído). CS revisa, não preenche.
  try {
    await assertClientMutationAccess(session, clientId)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Sem permissão.' }
  }

  if (!content.resultadoSemana?.trim() || !content.oQueFoiFeito?.trim() || !content.proximosPassos?.trim()) {
    return { error: 'Preencha os três campos — o check-in só vale com evidência mínima.' }
  }

  const now = new Date()
  let weekStart = getWeekRange().start
  let correctingPastWeek = false

  // T-05 — reenvio direcionado a uma semana passada REPROVADA (janela de correção).
  if (weekStartStr !== undefined) {
    // Validação de formato + parse UTC explícito. @db.Date volta como UTC-midnight;
    // parse com 'T00:00:00.000Z' reproduz exatamente a chave da linha existente
    // (lição do bug de fuso — não usar new Date('YYYY-MM-DD') cru).
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartStr)) {
      return { error: 'Semana de correção inválida.' }
    }
    const targetWeek = new Date(`${weekStartStr}T00:00:00.000Z`)

    const rejected = await prisma.clientWeeklyCheckin.findUnique({
      where: { clientId_weekStart: { clientId, weekStart: targetWeek } },
      select: { status: true, reviewedAt: true },
    })
    if (!rejected || rejected.status !== 'REPROVADO' || !rejected.reviewedAt) {
      return { error: 'Só é possível corrigir uma semana que a CS reprovou.' }
    }
    if (now.getTime() - rejected.reviewedAt.getTime() > CORRECTION_WINDOW_MS) {
      return {
        error:
          'A janela de correção desta semana (14 dias após a reprovação) já encerrou. Faça o check-in da semana atual.',
      }
    }
    weekStart = targetWeek
    correctingPastWeek = true
  }

  const data = {
    resultadoSemana: content.resultadoSemana.trim(),
    oQueFoiFeito: content.oQueFoiFeito.trim(),
    proximosPassos: content.proximosPassos.trim(),
    status: 'PREENCHIDO' as const,
    submittedAt: now,
    // Nova submissão limpa a revisão anterior
    reviewedById: null,
    reviewedAt: null,
    reviewNote: null,
  }

  await prisma.clientWeeklyCheckin.upsert({
    where: { clientId_weekStart: { clientId, weekStart } },
    create: { clientId, weekStart, managerId: session.userId, ...data },
    update: data,
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'checkin.submit',
    entityType: 'ClientWeeklyCheckin',
    entityId: clientId,
    clientId,
    metadata: { weekStart: weekStart.toISOString(), correctingPastWeek },
  })

  revalidatePath('/check-ins')
  return { ok: true }
}

/**
 * OPE-06 — CS revisa um check-in: aprova ou reprova (com motivo obrigatório).
 */
export async function reviewCheckin(
  checkinId: string,
  approved: boolean,
  note?: string,
): Promise<ActionResult> {
  const session = await requireSession()

  // Revisar é papel da CS / ADMIN.
  if (session.role !== 'ADMIN' && session.role !== 'CS') {
    return { error: 'Apenas ADMIN ou CS podem revisar check-ins.' }
  }

  const checkin = await prisma.clientWeeklyCheckin.findUnique({
    where: { id: checkinId },
    select: { id: true, clientId: true, status: true },
  })
  if (!checkin) return { error: 'Check-in não encontrado.' }
  if (checkin.status !== 'PREENCHIDO') {
    return { error: 'Só é possível revisar check-ins preenchidos e aguardando validação.' }
  }

  if (!approved && !note?.trim()) {
    return { error: 'Informe o motivo da reprovação para o gestor corrigir.' }
  }

  await prisma.clientWeeklyCheckin.update({
    where: { id: checkinId },
    data: {
      status: approved ? 'APROVADO' : 'REPROVADO',
      reviewedById: session.userId,
      reviewedAt: new Date(),
      reviewNote: note?.trim() || null,
    },
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: approved ? 'checkin.approve' : 'checkin.reject',
    entityType: 'ClientWeeklyCheckin',
    entityId: checkinId,
    clientId: checkin.clientId,
    metadata: { approved, note: note?.trim() ?? null },
  })

  revalidatePath('/check-ins')
  return { ok: true }
}
