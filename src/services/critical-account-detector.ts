/**
 * Critical Account Detector
 *
 * Detecta automaticamente contas que ativam o Protocolo de Conta Crítica:
 *
 * Gatilho 1 — ROAS_BELOW_TARGET_2W
 *   ROAS abaixo da meta por 2 semanas consecutivas completas (Dom-Sab).
 *   Dedup: não re-dispara se já existe protocolo ativo ou alerta nos últimos 7 dias.
 *
 * Gatilho 2 — FATURAMENTO_BELOW_70PCT_WEEK2
 *   Faturamento mensal abaixo de 70% da meta em qualquer dia da 2ª semana (dias 8–14).
 *   Dedup: não re-dispara se já existe protocolo ativo ou alerta nos últimos 28 dias.
 */

import { prisma } from '@/lib/prisma'
import { getWeekRange } from '@/lib/utils'
import { broadcastWhatsApp } from '@/lib/whatsapp'
import { AlertType } from '@prisma/client'

export async function detectCriticalAccounts(): Promise<{
  clientsChecked: number
  alertsFired: number
  failed: number
}> {
  const today = new Date()
  const dayOfMonth = today.getDate()

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
  let failed = 0

  // Resiliência (CLAUDE.md regra 7): isola cada cliente; falha de um não derruba a rotina.
  for (const client of clients) {
   try {
    const managerName = client.assignments[0]?.user?.name ?? 'Sem Gestor'

    // ── Gatilho 1: ROAS abaixo da meta por 2 semanas consecutivas ─────────
    const roasScores = await prisma.healthScore.findMany({
      where: {
        clientId: client.id,
        metric: 'ROAS',
        period: 'WEEKLY',
        periodStart: { in: [lastWeekStart, prevWeekStart] },
      },
      select: { achievementPct: true, periodStart: true },
    })

    if (
      roasScores.length === 2 &&
      roasScores.every((s) => Number(s.achievementPct) < 100)
    ) {
      const pcts = roasScores
        .sort((a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime())
        .map((s) => `${Number(s.achievementPct).toFixed(0)}%`)

      const fired = await fireProtocol(
        client.id,
        client.name,
        managerName,
        AlertType.ROAS_BELOW_TARGET_2W,
        buildWhatsAppMessage(
          client.name,
          managerName,
          'ROAS',
          `ROAS abaixo da meta há 2 semanas consecutivas (semana anterior: ${pcts[0]} da meta · última semana: ${pcts[1]} da meta).`,
        ),
        7,
      )
      if (fired) alertsFired++
    }

    // ── Gatilho 2: Faturamento < 70% da meta na 2ª semana (dias 8–14) ────
    if (dayOfMonth >= 8 && dayOfMonth <= 14) {
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
          buildWhatsAppMessage(
            client.name,
            managerName,
            'Faturamento',
            `Faturamento em *${pct}%* da meta mensal na virada da 2ª semana. Risco de não atingir a meta do mês.`,
          ),
          28,
        )
        if (fired) alertsFired++
      }
    }
   } catch (err) {
     failed++
     console.error(`[critical-account-detector] falha no cliente ${client.id}:`, err)
   }
  }

  return { clientsChecked: clients.length, alertsFired, failed }
}

function buildWhatsAppMessage(
  clientName: string,
  managerName: string,
  gatilho: string,
  detalhe: string,
): string {
  return [
    `🚨 *Protocolo de Conta Crítica Ativado*`,
    ``,
    `*Cliente:* ${clientName}`,
    `*Gestor:* ${managerName}`,
    `*Gatilho:* ${gatilho} abaixo da meta`,
    ``,
    detalhe,
    ``,
    `*Próximos passos obrigatórios:*`,
    `1️⃣ Gestor: documenta diagnóstico + hipótese de causa (até 24h)`,
    `2️⃣ Gestor: preenche briefing para o CS`,
    `3️⃣ CS: lê briefing e decide abordagem com o cliente (até 4h)`,
    ``,
    `_Acesse o painel › Anti-Churn › Protocolos Ativos para acompanhar._`,
  ].join('\n')
}

async function fireProtocol(
  clientId: string,
  clientName: string,
  managerName: string,
  trigger: AlertType,
  whatsappMessage: string,
  dedupDays: number,
): Promise<boolean> {
  // Não re-dispara se já existe protocolo ativo para esse cliente + gatilho
  const activeProtocol = await prisma.criticalProtocol.findFirst({
    where: {
      clientId,
      trigger,
      status: { not: 'ENCERRADO' },
    },
  })
  if (activeProtocol) return false

  // Não re-dispara se já foi disparado recentemente
  const recentAlert = await prisma.alert.findFirst({
    where: {
      clientId,
      type: trigger,
      createdAt: { gte: new Date(Date.now() - dedupDays * 86_400_000) },
    },
  })
  if (recentAlert) return false

  const triggerLabel = trigger === AlertType.ROAS_BELOW_TARGET_2W
    ? 'ROAS 2 semanas abaixo'
    : 'Faturamento <70% semana 2'

  await prisma.alert.create({
    data: {
      clientId,
      type: trigger,
      title: `Conta Crítica: ${clientName}`,
      body: `${triggerLabel}. Gestor: ${managerName}`,
    },
  })

  await prisma.criticalProtocol.create({
    data: { clientId, trigger },
  })

  try {
    await broadcastWhatsApp(whatsappMessage, false)
  } catch (err) {
    console.error('[critical-account-detector] WhatsApp falhou:', err)
  }

  return true
}
