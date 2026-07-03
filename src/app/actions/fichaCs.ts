'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { writeAuditLog, assertClientMutationAccess } from '@/lib/audit'
import { onFichaCsUpdated } from '@/services/client-lifecycle-automations'
import type { ClientNps, ClientRelacionamento, ClientCurva } from '@prisma/client'

type ActionResult = { ok: true } | { error: string }

export type FichaCsInput = {
  nps: ClientNps | null
  relacionamento: ClientRelacionamento | null
  curva: ClientCurva | null
  feedbackNegativo: number
  // D — War Room manual pela CS (opcional; ausência = não altera). false→true
  // abre o pacote A2; true→false encerra o protocolo crítico (saída limpa).
  salaDeGuerra?: boolean
}

/**
 * Ficha de CS — atualiza NPS, Relacionamento, Curva e Feedback negativo do cliente.
 * Valida papel + posse: ADMIN, CS, ou gestor atribuído ao cliente. Registra AuditLog.
 */
export async function updateFichaCs(clientId: string, input: FichaCsInput): Promise<ActionResult> {
  const session = await requireSession()

  // Papel + posse via engine: ADMIN/CS/SUPERVISOR/ANALISTA (staff amplo) editam
  // qualquer cliente; GESTOR_TRAFEGO só a carteira. allowCS mantém a CS habilitada.
  try {
    await assertClientMutationAccess(session, clientId, { allowCS: true })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Seu papel não permite editar a ficha de CS.' }
  }

  let fb = Number.isFinite(input.feedbackNegativo) ? Math.max(0, Math.min(99, Math.trunc(input.feedbackNegativo))) : 0

  // Snapshot ANTES do update para os hooks de ciclo de vida (transições NPS/feedback).
  const anterior = await prisma.client.findUnique({
    where: { id: clientId },
    select: { nps: true, feedbackNegativo: true, salaDeGuerra: true },
  })

  // ── Automação B: NPS ruim (DETRATOR) conta como 1º feedback negativo ───────
  // Quando o NPS PASSA a DETRATOR, o Performli soma automaticamente 1 feedback
  // (feedbackNegativo = max(1, atual)) — a CS não precisa mais somar de cabeça.
  // Feito ANTES do update para valer numa única atualização; o valor final
  // alimenta os hooks, então A1/A3 disparam em cascata pelo mesmo evento.
  const virouDetrator = input.nps === 'DETRATOR' && anterior?.nps !== 'DETRATOR'
  if (virouDetrator) fb = Math.max(1, fb)

  await prisma.client.update({
    where: { id: clientId },
    data: {
      nps: input.nps,
      relacionamento: input.relacionamento,
      curva: input.curva,
      feedbackNegativo: fb,
      ...(input.salaDeGuerra !== undefined ? { salaDeGuerra: input.salaDeGuerra } : {}),
      fichaCsUpdatedAt: new Date(),
    },
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'client.ficha_cs.update',
    entityType: 'Client',
    entityId: clientId,
    clientId,
    metadata: { nps: input.nps, relacionamento: input.relacionamento, curva: input.curva, feedbackNegativo: fb, npsContouFeedback: virouDetrator },
  })

  // Hooks de ciclo de vida (possível churn, 1º feedback, War Room) — best-effort:
  // nunca quebram o salvamento da ficha. Cada regra tem seu try/catch interno.
  try {
    await onFichaCsUpdated(clientId, {
      npsAnterior: anterior?.nps ?? null,
      npsNovo: input.nps,
      feedbackNegativoAnterior: anterior?.feedbackNegativo ?? 0,
      feedbackNegativoNovo: fb,
      salaDeGuerraAnterior: anterior?.salaDeGuerra ?? undefined,
      salaDeGuerraNovo: input.salaDeGuerra,
    })
  } catch {
    /* best-effort: automação não interrompe a ficha de CS */
  }

  revalidatePath(`/clients`)
  return { ok: true }
}
