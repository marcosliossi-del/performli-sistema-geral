/**
 * GA4 Sync — via Windsor.ai
 *
 * Fluxo completo por conta de plataforma:
 *   1. Cria SyncLog (RUNNING)
 *   2. Busca relatório diário via Windsor Connector (googleanalytics4)
 *   3. Transforma e faz upsert de MetricSnapshot
 *   4. Atualiza lastSyncAt na PlatformAccount
 *   5. Finaliza SyncLog (SUCCESS ou FAILED)
 *   6. Recalcula HealthScore + dispara alertas
 */

import { prisma } from '@/lib/prisma'
import { WindsorClient } from '@/services/windsor/client'
import { transformWindsorGA4 } from '@/services/windsor/transformers'
import { recalculateClientHealth } from '@/services/health-scorer'
import { dispatchAlertsForClient } from '@/services/alert-dispatcher'

interface SyncOptions {
  since?: string
  until?: string
}

export interface GA4SyncResult {
  platformAccountId: string
  propertyId: string
  status: 'SUCCESS' | 'FAILED'
  recordsUpserted: number
  errorMessage?: string
  healthScoresUpdated: number
  alertsCreated: number
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function defaultSince(): string {
  const d = new Date()
  d.setDate(d.getDate() - 6)
  return formatDate(d)
}

export async function syncGA4Account(
  platformAccountId: string,
  options: SyncOptions = {}
): Promise<GA4SyncResult> {
  const account = await prisma.platformAccount.findUnique({
    where: { id: platformAccountId },
    include: { client: { select: { id: true, name: true } } },
  })

  if (!account) {
    return {
      platformAccountId,
      propertyId: '',
      status: 'FAILED',
      recordsUpserted: 0,
      errorMessage: 'PlatformAccount não encontrada',
      healthScoresUpdated: 0,
      alertsCreated: 0,
    }
  }

  const syncLog = await prisma.syncLog.create({
    data: { platformAccountId, platform: 'GA4', status: 'RUNNING' },
  })

  const since = options.since ?? defaultSince()
  const until = options.until ?? formatDate(new Date())

  try {
    const windsor = new WindsorClient()
    // Para GA4 no Windsor, o identifier é o nome da propriedade (externalId)
    const rows = await windsor.getGA4Report(account.externalId, since, until)

    let recordsUpserted = 0

    for (const row of rows) {
      const snapshot = transformWindsorGA4(row)

      await prisma.metricSnapshot.upsert({
        where: { platformAccountId_date: { platformAccountId, date: snapshot.date } },
        update: {
          impressions: snapshot.impressions,
          clicks: snapshot.clicks,
          reach: snapshot.reach,
          frequency: snapshot.frequency,
          ctr: snapshot.ctr,
          conversions: snapshot.conversions,
          conversionValue: snapshot.conversionValue,
          rawData: snapshot.rawData as object,
          syncedAt: new Date(),
        },
        create: {
          clientId: account.clientId,
          platformAccountId,
          date: snapshot.date,
          spend: snapshot.spend,
          impressions: snapshot.impressions,
          clicks: snapshot.clicks,
          reach: snapshot.reach,
          frequency: snapshot.frequency,
          ctr: snapshot.ctr,
          cpc: snapshot.cpc,
          conversions: snapshot.conversions,
          conversionValue: snapshot.conversionValue,
          roas: snapshot.roas,
          cpl: snapshot.cpl,
          rawData: snapshot.rawData as object,
        },
      })
      recordsUpserted++
    }

    await prisma.platformAccount.update({
      where: { id: platformAccountId },
      data: { lastSyncAt: new Date() },
    })

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'SUCCESS', completedAt: new Date(), recordsUpserted },
    })

    const { created, updated, scores } = await recalculateClientHealth(account.clientId)
    const alertsCreated = await dispatchAlertsForClient(account.clientId, scores)

    return {
      platformAccountId,
      propertyId: account.externalId,
      status: 'SUCCESS',
      recordsUpserted,
      healthScoresUpdated: created + updated,
      alertsCreated,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'FAILED', completedAt: new Date(), errorMessage },
    })

    await prisma.alert.create({
      data: {
        clientId: account.clientId,
        type: 'SYNC_FAILED',
        title: `Falha no sync GA4 — ${account.client.name}`,
        body: `Não foi possível buscar dados de ${account.externalId}: ${errorMessage}`,
      },
    })

    return {
      platformAccountId,
      propertyId: account.externalId,
      status: 'FAILED',
      recordsUpserted: 0,
      errorMessage,
      healthScoresUpdated: 0,
      alertsCreated: 0,
    }
  }
}

export async function syncAllGA4Accounts(options: SyncOptions = {}): Promise<GA4SyncResult[]> {
  const accounts = await prisma.platformAccount.findMany({
    where: { platform: 'GA4', active: true },
    select: { id: true },
  })

  const results: GA4SyncResult[] = []
  for (const acc of accounts) {
    results.push(await syncGA4Account(acc.id, options))
  }
  return results
}
