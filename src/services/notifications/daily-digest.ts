/**
 * Daily Digest WhatsApp
 *
 * Monta o resumo diário da agência e envia via WhatsApp às 09:00 BRT.
 * Inclui: saúde geral, clientes em risco, alertas críticos do dia.
 */

import { prisma } from '@/lib/prisma'
import { broadcastWhatsApp } from '@/lib/whatsapp'
import { getWeekRange, getMonthRange } from '@/lib/utils'

function emoji(status: string | null) {
  if (status === 'OTIMO')   return '✅'
  if (status === 'REGULAR') return '⚠️'
  if (status === 'RUIM')    return '🔴'
  return '⚪'
}

export async function sendDailyDigest(): Promise<{ sent: number; skipped: boolean }> {
  const instanceId = process.env.ZAPI_INSTANCE_ID
  const hasRecipient = process.env.WHATSAPP_GROUP_ID || process.env.WHATSAPP_NOTIFY_NUMBERS
  if (!instanceId || !hasRecipient) return { sent: 0, skipped: true }

  const now        = new Date()
  const { start: weekStart }  = getWeekRange()
  const { start: monthStart } = getMonthRange()
  const fetchFrom  = monthStart < weekStart ? monthStart : weekStart
  const yesterday  = new Date(now); yesterday.setDate(yesterday.getDate() - 1)

  // Fetch all active clients with latest health scores
  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true, name: true,
      healthScores: {
        where:   { periodStart: { gte: fetchFrom } },
        orderBy: { calculatedAt: 'desc' },
        take: 1,
        select: { status: true },
      },
      assignments: {
        where: { isPrimary: true },
        select: { user: { select: { name: true } } },
        take: 1,
      },
    },
    orderBy: { name: 'asc' },
  })

  // Health distribution
  let otimo = 0, regular = 0, ruim = 0, semMeta = 0
  const atRisk: { name: string; manager: string }[] = []

  for (const c of clients) {
    const status = c.healthScores[0]?.status ?? null
    if (status === 'OTIMO')        otimo++
    else if (status === 'REGULAR') regular++
    else if (status === 'RUIM') {
      ruim++
      atRisk.push({ name: c.name, manager: c.assignments[0]?.user.name ?? '—' })
    } else semMeta++
  }

  // Critical alerts from last 24h (unread)
  const criticalAlerts = await prisma.alert.findMany({
    where: {
      type:      { in: ['STATUS_DROPPED_TO_RUIM', 'BUDGET_EXHAUSTED', 'SYNC_FAILED'] },
      read:      false,
      createdAt: { gte: yesterday },
    },
    select: { title: true },
    take: 5,
  })

  // Build message
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
  const lines: string[] = []

  lines.push(`*📊 Performli — Resumo Diário*`)
  lines.push(`_${dateStr}_`)
  lines.push('')
  lines.push(`*Saúde dos Clientes*`)
  lines.push(`✅ Ótimo: *${otimo}*   ⚠️ Regular: *${regular}*   🔴 Ruim: *${ruim}*   ⚪ Sem meta: *${semMeta}*`)
  lines.push(`Total: ${clients.length} clientes ativos`)

  if (atRisk.length > 0) {
    lines.push('')
    lines.push(`*🔴 Clientes em Risco (${atRisk.length})*`)
    for (const c of atRisk.slice(0, 8)) {
      lines.push(`• ${c.name} _(${c.manager})_`)
    }
    if (atRisk.length > 8) lines.push(`• ...e mais ${atRisk.length - 8} clientes`)
  }

  if (criticalAlerts.length > 0) {
    lines.push('')
    lines.push(`*🚨 Alertas Críticos (últimas 24h)*`)
    for (const a of criticalAlerts) {
      lines.push(`• ${a.title}`)
    }
  }

  lines.push('')
  lines.push(`_Acesse o painel para mais detalhes._`)

  const message = lines.join('\n')
  const sent = await broadcastWhatsApp(message)
  return { sent, skipped: false }
}
