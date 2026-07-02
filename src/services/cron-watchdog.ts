import 'server-only'
import { prisma } from '@/lib/prisma'
import { readCronHeartbeat, CRON_STALE_HOURS } from '@/lib/cron-heartbeat'
import { writeAuditLog } from '@/lib/audit'
import { startOfTodaySaoPaulo } from '@/lib/utils'

/**
 * WATCHDOG de cron (S1-007) — detecção que roda em outro cron VIVO.
 *
 * O cron diário (/api/cron/daily, 11:00 UTC) não se auto-denuncia quando morre.
 * O digest (11:30 UTC) roda 30min depois; se o daily não gravou seu heartbeat
 * hoje, este watchdog registra o incidente para ninguém descobrir tarde demais
 * (health/churn congelam e as telas mostram dado velho como atual — CLAUDE.md #9/#10).
 *
 * Registro via AuditLog (dedup por dia): AuditLog aceita clientId null, ideal para
 * um incidente de infraestrutura sem cliente associado. O model Alert exige
 * clientId (não há "cliente-sistema"), então NÃO abrimos Alert aqui — a superfície
 * de aviso ao Marcos é o banner do Cockpit (getCronHealth em dal.ts), que já cobre
 * o caso mesmo se o digest também estiver fora do ar.
 */

const WATCHDOG_ACTION = 'CRON_DAILY_NOT_RUN'
const WATCHDOG_ENTITY = 'CronDaily'

/**
 * Verifica se o cron diário rodou hoje (fuso São Paulo). Se não, grava um
 * AuditLog deduplicado por dia. Nunca lança de forma que derrube o chamador —
 * o chamador (digest) já envolve em try/catch, mas mantemos a operação isolada.
 *
 * @returns objeto com o diagnóstico (para o response do cron chamador).
 */
export async function checkDailyCronRanToday(): Promise<{
  ranToday: boolean
  lastRunAt: string | null
}> {
  const lastRun = await readCronHeartbeat('DAILY')
  const todayStart = startOfTodaySaoPaulo()

  const ranToday = lastRun !== null && lastRun.getTime() >= todayStart.getTime()
  if (ranToday) {
    return { ranToday: true, lastRunAt: lastRun!.toISOString() }
  }

  // Dedup por dia: não repetir o registro se já houver um hoje.
  const entityId = `daily-${todayStart.toISOString().slice(0, 10)}`
  const already = await prisma.auditLog.findFirst({
    where: { action: WATCHDOG_ACTION, entityType: WATCHDOG_ENTITY, entityId },
    select: { id: true },
  })
  if (!already) {
    const horasAtras = lastRun
      ? Math.round((Date.now() - lastRun.getTime()) / 3_600_000)
      : null
    await writeAuditLog({
      action: WATCHDOG_ACTION,
      entityType: WATCHDOG_ENTITY,
      entityId,
      metadata: {
        motivo: 'A rotina diária (/api/cron/daily) não registrou execução hoje.',
        ultimaExecucao: lastRun ? lastRun.toISOString() : 'nunca',
        horasSemRodar: horasAtras ?? -1,
        limiteHoras: CRON_STALE_HOURS,
      },
    })
    console.warn(
      `[cron-watchdog] Rotina diária não executou hoje — última execução: ${lastRun?.toISOString() ?? 'nunca'}`,
    )
  }

  return { ranToday: false, lastRunAt: lastRun ? lastRun.toISOString() : null }
}
