/**
 * Daily Digest WhatsApp
 *
 * Resumo diário da agência enviado às 09:00 BRT.
 * Formato: visão geral + breakdown completo por gestor.
 */

import { prisma } from '@/lib/prisma'
import { broadcastWhatsApp } from '@/lib/whatsapp'
import { getMonthRange, getWeekRange } from '@/lib/utils'

function emoji(status: string | null) {
  if (status === 'OTIMO')   return '✅'
  if (status === 'REGULAR') return '⚠️'
  if (status === 'RUIM')    return '🔴'
  return '⚪'
}

function statusOrder(status: string | null): number {
  if (status === 'RUIM')    return 0
  if (status === 'REGULAR') return 1
  if (status === 'OTIMO')   return 2
  return 3
}

export async function sendDailyDigest(): Promise<{ sent: number; skipped: boolean }> {
  const instanceId   = process.env.ZAPI_INSTANCE_ID
  const token        = process.env.ZAPI_TOKEN
  const hasRecipient = process.env.WHATSAPP_GROUP_ID || process.env.WHATSAPP_NOTIFY_NUMBERS
  if (!instanceId || !token || !hasRecipient) {
    const missing = [
      !instanceId   && 'ZAPI_INSTANCE_ID',
      !token        && 'ZAPI_TOKEN',
      !hasRecipient && 'WHATSAPP_GROUP_ID (or WHATSAPP_NOTIFY_NUMBERS)',
    ].filter(Boolean).join(', ')
    console.warn(`[daily-digest] Skipped — missing env vars: ${missing}`)
    return { sent: 0, skipped: true }
  }

  const now       = new Date()
  const { start: weekStart }  = getWeekRange()
  const { start: monthStart } = getMonthRange()
  const fetchFrom = monthStart < weekStart ? monthStart : weekStart
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)

  // Fetch all active clients with health score + primary manager
  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      healthScores: {
        where:   { periodStart: { gte: fetchFrom } },
        orderBy: { calculatedAt: 'desc' },
        take: 1,
        select: { status: true },
      },
      assignments: {
        where: { isPrimary: true },
        select: { user: { select: { id: true, name: true } } },
        take: 1,
      },
    },
    orderBy: { name: 'asc' },
  })

  // Critical alerts from last 24h (unread)
  const criticalAlerts = await prisma.alert.findMany({
    where: {
      type:      { in: ['STATUS_DROPPED_TO_RUIM', 'BUDGET_EXHAUSTED', 'SYNC_FAILED'] },
      read:      false,
      createdAt: { gte: yesterday },
    },
    select: { title: true },
    take: 10,
  })

  // ── Aggregate totals ───────────────────────────────────────────────────────
  let otimo = 0, regular = 0, ruim = 0, semDados = 0

  type ClientRow = {
    name: string
    status: string | null
    managerName: string
    managerId: string
  }

  const rows: ClientRow[] = clients.map((c) => {
    const status     = c.healthScores[0]?.status ?? null
    const assignment = c.assignments[0]?.user
    if (status === 'OTIMO')        otimo++
    else if (status === 'REGULAR') regular++
    else if (status === 'RUIM')    ruim++
    else                           semDados++
    return {
      name:        c.name,
      status,
      managerName: assignment?.name ?? 'Sem Gestor',
      managerId:   assignment?.id   ?? '__none__',
    }
  })

  // ── Group by manager ───────────────────────────────────────────────────────
  const managerOrder: string[] = []
  const byManager = new Map<string, { name: string; clients: ClientRow[] }>()

  for (const row of rows) {
    if (!byManager.has(row.managerId)) {
      managerOrder.push(row.managerId)
      byManager.set(row.managerId, { name: row.managerName, clients: [] })
    }
    byManager.get(row.managerId)!.clients.push(row)
  }

  // Sort each manager's clients: RUIM → REGULAR → OTIMO → sem dados
  for (const entry of byManager.values()) {
    entry.clients.sort((a, b) => statusOrder(a.status) - statusOrder(b.status))
  }

  // Sort manager order: most critical clients first
  managerOrder.sort((a, b) => {
    const ga = byManager.get(a)!.clients.filter((c) => c.status === 'RUIM').length
    const gb = byManager.get(b)!.clients.filter((c) => c.status === 'RUIM').length
    return gb - ga
  })

  // ── Build message ──────────────────────────────────────────────────────────
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
  const lines: string[] = []

  lines.push(`*📊 Performli — Resumo Diário*`)
  lines.push(`_${dateStr}_`)
  lines.push('')
  lines.push(`*Saúde Geral da Agência*`)
  lines.push(`✅ Ótimo: *${otimo}*  ⚠️ Regular: *${regular}*  🔴 Ruim: *${ruim}*  ⚪ Sem dados: *${semDados}*`)
  lines.push(`Total: *${clients.length}* clientes ativos`)

  // Breakdown por gestor
  lines.push('')
  lines.push('─────────────────────')

  for (const managerId of managerOrder) {
    const { name, clients: mClients } = byManager.get(managerId)!
    const mRuim    = mClients.filter((c) => c.status === 'RUIM').length
    const mRegular = mClients.filter((c) => c.status === 'REGULAR').length
    const mOtimo   = mClients.filter((c) => c.status === 'OTIMO').length

    lines.push('')
    lines.push(`*👤 ${name}* — ${mClients.length} cliente${mClients.length !== 1 ? 's' : ''}  (✅${mOtimo} ⚠️${mRegular} 🔴${mRuim})`)

    for (const c of mClients) {
      lines.push(`${emoji(c.status)} ${c.name}`)
    }
  }

  // Alertas críticos
  if (criticalAlerts.length > 0) {
    lines.push('')
    lines.push('─────────────────────')
    lines.push(`*🚨 Alertas Críticos (últimas 24h)*`)
    for (const a of criticalAlerts) {
      lines.push(`• ${a.title}`)
    }
  }

  lines.push('')
  lines.push(`_Acesse o painel para mais detalhes._`)

  const message = lines.join('\n')
  // mentionAll = true: menciona todos os participantes do grupo ao final
  const sent = await broadcastWhatsApp(message, true)
  return { sent, skipped: false }
}
