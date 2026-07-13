import 'server-only'
import { prisma } from './prisma'

/**
 * WATCHDOG de cron (finding S1-007) — Camada 1: persistência da última execução.
 *
 * Cada cron grava, ao terminar com sucesso, um timestamp ISO em IntegrationSetting
 * (regra CLAUDE.md #9: toda rotina recorrente registra última execução). Reusamos
 * IntegrationSetting (já existe) em vez de criar migration/model novo.
 *
 * A DETECÇÃO (camada 2) não pode depender do cron vivo — ela roda quando o Marcos
 * abre o sistema (ver getCronHealth em dal.ts e o banner no Cockpit). Um watchdog
 * que rodasse dentro do próprio cron morreria junto com ele.
 */

export type CronName = 'DAILY' | 'DIGEST' | 'RECURRENCES' | 'RESULTADOS' | 'ASAAS' | 'CONVERSAS'

/** Monta a key de IntegrationSetting para o heartbeat de um cron. */
export function cronLastRunKey(name: CronName): string {
  return `CRON_${name}_LAST_RUN`
}

/** Limiar de "atrasado": 26h de margem sobre o ciclo diário de 24h. */
export const CRON_STALE_HOURS = 26

/**
 * Grava o heartbeat da última execução bem-sucedida de um cron.
 *
 * NUNCA lança: uma falha ao gravar o heartbeat não pode derrubar o cron
 * (try/catch por operação). Apenas registra no log do servidor.
 */
export async function recordCronHeartbeat(name: CronName, at: Date = new Date()): Promise<void> {
  const key = cronLastRunKey(name)
  const value = at.toISOString()
  try {
    await prisma.integrationSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    })
  } catch (err) {
    console.error(`[cron-heartbeat] falha ao gravar ${key}:`, err)
  }
}

/** Lê o timestamp bruto do heartbeat de um cron (null = nunca rodou / erro). */
export async function readCronHeartbeat(name: CronName): Promise<Date | null> {
  try {
    const row = await prisma.integrationSetting.findUnique({ where: { key: cronLastRunKey(name) } })
    if (!row?.value) return null
    const d = new Date(row.value)
    return Number.isNaN(d.getTime()) ? null : d
  } catch (err) {
    console.error(`[cron-heartbeat] falha ao ler ${cronLastRunKey(name)}:`, err)
    return null
  }
}
