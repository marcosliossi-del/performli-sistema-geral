'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { assertClientMutationAccess, writeAuditLog } from '@/lib/audit'
import { getWeekRange } from '@/lib/utils'
import { generateWeeklyReportForClient, generateMonthlyReportForClient } from '@/services/weekly-report-generator'

export type ReportState = {
  error?: string
  success?: boolean
  content?: string
}

/** Generate (or regenerate) the monthly report for a specific client */
export async function generateClientMonthlyReport(
  prevState: ReportState,
  formData: FormData
): Promise<ReportState> {
  const session = await requireSession()

  const clientId   = formData.get('clientId')   as string
  const clientSlug = formData.get('clientSlug') as string
  const yearStr    = formData.get('year')        as string | null
  const monthStr   = formData.get('month')       as string | null

  if (!clientId) return { error: 'Cliente não informado.' }

  // Posse: só ADMIN/CS ou o gestor atribuído geram relatório deste cliente.
  try {
    await assertClientMutationAccess(session, clientId, { allowCS: true })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Sem permissão.' }
  }

  try {
    const year  = yearStr  ? parseInt(yearStr)  : undefined
    const month = monthStr ? parseInt(monthStr) : undefined // 0-indexed
    const content = await generateMonthlyReportForClient(clientId, year, month)
    if (!content) return { error: 'Relatório vazio — cliente não encontrado.' }
    revalidatePath(`/clients/${clientSlug}`)
    return { success: true, content }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { error: msg }
  }
}

/** Generate (or regenerate) the weekly report for a specific client */
export async function generateClientReport(
  prevState: ReportState,
  formData: FormData
): Promise<ReportState> {
  const session = await requireSession()

  const clientId   = formData.get('clientId')   as string
  const clientSlug = formData.get('clientSlug') as string
  const fromStr    = formData.get('from')        as string | null
  const toStr      = formData.get('to')          as string | null

  if (!clientId) return { error: 'Cliente não informado.' }

  // Posse: só ADMIN/CS ou o gestor atribuído geram relatório deste cliente.
  try {
    await assertClientMutationAccess(session, clientId, { allowCS: true })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Sem permissão.' }
  }

  try {
    const content = await generateWeeklyReportForClient(
      clientId,
      fromStr || undefined,
      toStr   || undefined,
    )
    if (!content) return { error: 'Relatório vazio — cliente não encontrado.' }
    revalidatePath(`/clients/${clientSlug}`)
    return { success: true, content }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { error: msg }
  }
}

export type MarkSentResult = { ok: true } | { error: string }

/**
 * FASE 1.2 — Marca o relatório semanal de um cliente como ENVIADO ao cliente.
 *
 * Fecha o elo "gerado → enviado" do funil de prestação de contas: sem isto o
 * sistema nunca sabia se a prestação de contas chegou ao cliente (Bloco 5 da
 * auditoria de churn silencioso). Grava sentAt=now / sentBy=userId.
 *
 * Auth: requireSession + assertClientMutationAccess (allowCS true — a CS também
 * confirma envios). Gestor só na própria carteira.
 *
 * Idempotente: se já houver sentAt, NÃO sobrescreve o carimbo original (o envio
 * verdadeiro foi o primeiro) — retorna { ok } sem tocar no registro.
 */
export async function markWeeklyReportSent(
  clientId: string,
  weekStartStr: string,
  clientSlug?: string,
): Promise<MarkSentResult> {
  const session = await requireSession()

  try {
    await assertClientMutationAccess(session, clientId, { allowCS: true })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Sem permissão.' }
  }

  // weekStart é @db.Date — Postgres/Prisma devolve MEIA-NOITE UTC; a busca usa
  // UTC explícito ('...T00:00:00.000Z'). Parse local dependeria do fuso do
  // runtime e poderia recuar 1 dia (bug de round-trip pego pelo guardião).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartStr)) return { error: 'Semana inválida.' }
  const weekStart = new Date(`${weekStartStr}T00:00:00.000Z`)
  if (Number.isNaN(weekStart.getTime())) return { error: 'Semana inválida.' }

  try {
    const report = await prisma.weeklyReport.findUnique({
      where: { clientId_weekStart: { clientId, weekStart } },
      select: { id: true, sentAt: true },
    })
    if (!report) return { error: 'Relatório desta semana ainda não foi gerado.' }

    // Idempotência: já enviado → não sobrescreve o carimbo original.
    if (report.sentAt) {
      if (clientSlug) revalidatePath(`/clients/${clientSlug}`)
      return { ok: true }
    }

    await prisma.weeklyReport.update({
      where: { id: report.id },
      data: { sentAt: new Date(), sentBy: session.userId },
    })

    await writeAuditLog({
      actorId: session.userId,
      actorRole: session.role,
      action: 'weekly_report.marked_sent',
      entityType: 'WeeklyReport',
      entityId: report.id,
      clientId,
      metadata: { weekStart: weekStart.toISOString() },
    })

    if (clientSlug) revalidatePath(`/clients/${clientSlug}`)
    revalidatePath('/reports')
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export type CheckinInput = {
  problema: string
  oQueFoiFeito: string
  resultadoSemana: string
  proximosPassos: string
  pedidosCliente: string
  novosSeguidores: number | null
}

/**
 * Salva o check-in do gestor (6 perguntas) e, em seguida, gera o relatório
 * (semanal ou mensal) cruzando o prompt oficial + o contexto do check-in +
 * os dados do sistema. Fonte única da verdade no Performli.
 *
 * Fluxo: valida sessão + posse → upsert do ClientWeeklyCheckin da semana atual
 * → gera o relatório → revalida a página do cliente.
 */
export async function saveCheckinAndGenerate(
  clientId: string,
  period: 'weekly' | 'monthly',
  checkin: CheckinInput,
  clientSlug?: string,
): Promise<ReportState> {
  const session = await requireSession()

  // Preencher/gerar é papel do gestor (ADMIN ou MANAGER atribuído).
  try {
    await assertClientMutationAccess(session, clientId)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Sem permissão.' }
  }

  const { start: weekStart } = getWeekRange()
  const now = new Date()

  const data = {
    problema:        checkin.problema?.trim()        || null,
    oQueFoiFeito:    checkin.oQueFoiFeito?.trim()     || null,
    resultadoSemana: checkin.resultadoSemana?.trim() || null,
    proximosPassos:  checkin.proximosPassos?.trim()  || null,
    pedidosCliente:  checkin.pedidosCliente?.trim()  || null,
    novosSeguidores: checkin.novosSeguidores ?? null,
    status: 'PREENCHIDO' as const,
    submittedAt: now,
    reviewedById: null,
    reviewedAt: null,
    reviewNote: null,
  }

  try {
    await prisma.clientWeeklyCheckin.upsert({
      where: { clientId_weekStart: { clientId, weekStart } },
      create: { clientId, weekStart, managerId: session.userId, ...data },
      update: data,
    })

    await writeAuditLog({
      actorId: session.userId,
      actorRole: session.role,
      action: 'checkin.saveAndGenerate',
      entityType: 'ClientWeeklyCheckin',
      entityId: clientId,
      clientId,
      metadata: { weekStart: weekStart.toISOString(), period },
    })

    const content =
      period === 'monthly'
        ? await generateMonthlyReportForClient(clientId)
        : await generateWeeklyReportForClient(clientId)

    if (!content) return { error: 'Relatório vazio — cliente não encontrado.' }

    if (clientSlug) revalidatePath(`/clients/${clientSlug}`)
    revalidatePath('/check-ins')
    return { success: true, content }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { error: msg }
  }
}
