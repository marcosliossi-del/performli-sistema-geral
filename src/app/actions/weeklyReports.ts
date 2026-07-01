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
  await requireSession()

  const clientId   = formData.get('clientId')   as string
  const clientSlug = formData.get('clientSlug') as string
  const yearStr    = formData.get('year')        as string | null
  const monthStr   = formData.get('month')       as string | null

  if (!clientId) return { error: 'Cliente não informado.' }

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
  await requireSession()

  const clientId   = formData.get('clientId')   as string
  const clientSlug = formData.get('clientSlug') as string
  const fromStr    = formData.get('from')        as string | null
  const toStr      = formData.get('to')          as string | null

  if (!clientId) return { error: 'Cliente não informado.' }

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
