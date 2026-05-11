/**
 * Critical Account Detector
 *
 * Detecta automaticamente contas que ativam o Protocolo de Conta Crítica:
 *
 * Gatilho 1 — ROAS_BELOW_TARGET_2W
 *   ROAS abaixo da meta por 2 semanas consecutivas completas (Dom-Sab).
 *   Dedup: não re-dispara se já foi disparado nos últimos 7 dias.
 *
 * Gatilho 2 — FATURAMENTO_BELOW_70PCT_WEEK2
 *   Faturamento mensal abaixo de 70% da meta no dia 14 do mês.
 *   Dedup: não re-dispara se já foi disparado nos últimos 28 dias.
 */

import { prisma } from '@/lib/prisma'
import { getWeekRange } from '@/lib/utils'
import { broadcastWhatsApp } from '@/lib/whatsapp'
import { AlertType } from '@prisma/client'

export async function detectCriticalAccounts(): Promise<{
  clientsChecked: number
  alertsFired: number
}> {
  const today = new Date()

  // Semanas completas Dom-Sab: última e retrasada
  const lastWeekStart = getWeekRange(new Date(today.getTime() - 7 * 86_400_000)).start
  const prevWeekStart = getWeekRange(new Date(today.getTime() - 14 * 86_400_000)).start

  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      assignments: {
        where: { isPrimary: true },
        select: { user: { select: { name: true } } },
        take: 1,
      },
    },
  })

  let alertsFired = 0

  for (const client of clients) {
    const managerName = client.assignments[0]?.user?.name ?? 'Sem Gestor'

    // ── Gatilho 1: ROAS abaixo da meta por 2 semanas consecutivas ─────────
    const roasScores = await prisma.healthScore.findMany({
      where: {
        clientId: client.id,
        metric: 'ROAS',
        period: 'WEEKLY',
        periodStart: { in: [lastWeekStart, prevWeekStart] },
      },
      select: { achievementPct: true },
    })

    if (
      roasScores.length === 2 &&
      roasScores.every((s) => Number(s.achievementPct) < 100)
    ) {
      const fired = await fireProtocol(
        client.id,
        client.name,
        managerName,
        AlertType.ROAS_BELOW_TARGET_2W,
        `🚨 Conta Crítica: ${client.name}`,
        `ROAS abaixo da meta por 2 semanas consecutivas. Acione o protocolo imediatamente.\nGestor responsável: ${managerName}`,
        7,
      )
      if (fired) alertsFired++
    }

    // ── Gatilho 2: Faturamento < 70% da meta no dia 14 do mês ─────────────
    if (today.getDate() === 14) {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

      const fatScore = await prisma.healthScore.findFirst({
        where: {
          clientId: client.id,
          metric: 'FATURAMENTO',
          period: 'MONTHLY',
          periodStart: monthStart,
        },
        select: { achievementPct: true },
      })

      if (fatScore && Number(fatScore.achievementPct) < 70) {
        const pct = Number(fatScore.achievementPct).toFixed(1)
        const fired = await fireProtocol(
          client.id,
          client.name,
          managerName,
          AlertType.FATURAMENTO_BELOW_70PCT_WEEK2,
          `🚨 Conta Crítica: ${client.name}`,
          `Faturamento em ${pct}% da meta mensal na virada da 2ª semana. Acione o protocolo imediatamente.\nGestor responsável: ${managerName}`,
          28,
        )
        if (fired) alertsFired++
      }
    }
  }

  return { clientsChecked: clients.length, alertsFired }
}

async function fireProtocol(
  clientId: string,
  clientName: string,
  managerName: string,
  type: AlertType,
  title: string,
  body: string,
  dedupDays: number,
): Promise<boolean> {
  const recent = await prisma.alert.findFirst({
    where: {
      clientId,
      type,
      createdAt: { gte: new Date(Date.now() - dedupDays * 86_400_000) },
    },
  })
  if (recent) return false

  await prisma.alert.create({ data: { clientId, type, title, body } })

  const wppMsg = [
    title,
    '',
    body,
    '',
    `_Acesse o painel › ${clientName} para ver o histórico completo._`,
  ].join('\n')

  try {
    await broadcastWhatsApp(wppMsg, false)
  } catch (err) {
    console.error('[critical-account-detector] WhatsApp falhou:', err)
  }

  return true
}
