/**
 * Monitor anti-esquecimento de clientes PAUSED (T-23).
 *
 * Um cliente pausado silencia INTENCIONALMENTE os crons operacionais — mas
 * "pausa" não pode virar limbo eterno. Um cliente PAUSED há muito tempo é um
 * risco próprio: ou retoma a operação, ou vira churn assumido (contável), mas
 * não pode ficar esquecido, invisível para os radares que ele mesmo desligou.
 *
 * Regra: cliente PAUSED com pausedAt há mais de 45 dias → 1 Alert
 * ANTICHURN_ACTION_NEEDED por cliente, deduplicado por SEMANA via tag no body
 * ([paused-stale:{clientId}]) — mesmo padrão determinístico do retention-watchdog.
 * try/catch por cliente: falha em um não derruba os demais.
 */

import { prisma } from '@/lib/prisma'

const PAUSED_STALE_DAYS = 45
const DEDUP_DAYS = 7

export async function runPausedStaleMonitor(): Promise<{
  checked: number
  alerts: number
  failed: number
}> {
  const now = Date.now()
  const windowStart = new Date(now - DEDUP_DAYS * 86_400_000)
  const cutoff = new Date(now - PAUSED_STALE_DAYS * 86_400_000)

  // Só clientes efetivamente pausados há mais de 45 dias (pausedAt <= cutoff).
  // pausedAt nulo (dado legado de pausa sem carimbo) não dispara aqui.
  const stale = await prisma.client.findMany({
    where: { status: 'PAUSED', pausedAt: { not: null, lte: cutoff } },
    select: { id: true, name: true, pausedAt: true, pauseReason: true },
  })

  let alerts = 0
  let failed = 0

  for (const c of stale) {
    try {
      if (!c.pausedAt) continue
      const dias = Math.floor((now - new Date(c.pausedAt).getTime()) / 86_400_000)
      const tag = `[paused-stale:${c.id}]`

      const existing = await prisma.alert.findFirst({
        where: {
          clientId: c.id,
          type: 'ANTICHURN_ACTION_NEEDED',
          createdAt: { gte: windowStart },
          body: { contains: tag },
        },
        select: { id: true },
      })
      if (existing) continue

      const motivo = c.pauseReason?.trim() || 'sem motivo registrado'
      await prisma.alert.create({
        data: {
          clientId: c.id,
          type: 'ANTICHURN_ACTION_NEEDED',
          title: `Cliente pausado há ${dias} dias — retomar ou encerrar?: ${c.name}`,
          body:
            `Este cliente está pausado há ${dias} dias (motivo: ${motivo}). ` +
            `Uma pausa longa demais vira limbo: ou a operação volta, ou é um cancelamento não assumido. ` +
            `Decidir hoje — retomar a operação ou encerrar formalmente o contrato. ${tag}`,
        },
      })
      alerts++
    } catch (err) {
      failed++
      console.error(`[paused-stale-monitor] falha no cliente ${c.id}:`, err)
    }
  }

  await prisma.automationLog
    .create({
      data: {
        status: 'SUCESSO',
        reason: `paused-stale-monitor — ${stale.length} pausados verificados / ${alerts} alertas`,
      },
    })
    .catch(() => {})

  return { checked: stale.length, alerts, failed }
}
