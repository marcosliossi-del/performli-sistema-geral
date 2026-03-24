/**
 * Meta Ads Sync — via Windsor.ai
 *
 * Fluxo completo por conta de plataforma:
 *   1. Cria SyncLog (RUNNING)
 *   2. Busca insights diários via Windsor Connector (facebook)
 *   3. Transforma e faz upsert de MetricSnapshot
 *   4. Atualiza lastSyncAt na PlatformAccount
 *   5. Finaliza SyncLog (SUCCESS ou FAILED)
 *   6. Recalcula HealthScore + dispara alertas
 */

import { prisma } from '@/lib/prisma'
import { WindsorClient } from '@/services/windsor/client'
import { transformWindsorMeta } from '@/services/windsor/transformers'
import { recalculateClientHealth } from '@/services/health-scorer'
import { dispatchAlertsForClient } from '@/services/alert-dispatcher'

interface SyncOptions {
  since?: string // YYYY-MM-DD (default: 7 dias atrás)
  until?: string // YYYY-MM-DD (default: hoje)
}

export interface SyncResult {
  platformAccountId: string
  adAccountId: string
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

export async function syncMetaAccount(
  platformAccountId: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const account = await prisma.platformAccount.findUnique({
    where: { id: platformAccountId },
    include: { client: { select: { id: true, name: true } } },
  })

  if (!account) {
    return {
      platformAccountId,
      adAccountId: '',
      status: 'FAILED',
      recordsUpserted: 0,
      errorMessage: 'PlatformAccount não encontrada',
      healthScoresUpdated: 0,
      alertsCreated: 0,
    }
  }

  const syncLog = await prisma.syncLog.create({
    data: { platformAccountId, platform: 'META_ADS', status: 'RUNNING' },
  })

  const since = options.since ?? defaultSince()
  const until = options.until ?? formatDate(new Date())

  try {
    const windsor = new WindsorClient()
    const rows = await windsor.getMetaInsights(account.externalId, since, until)

    let recordsUpserted = 0

    for (const row of rows) {
      const snapshot = transformWindsorMeta(row)

      await prisma.metricSnapshot.upsert({
        where: { platformAccountId_date: { platformAccountId, date: snapshot.date } },
        update: {
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

    // Auto-dismiss stale SYNC_FAILED alerts for this account now that sync succeeded
    await prisma.alert.updateMany({
      where: { clientId: account.clientId, type: 'SYNC_FAILED', read: false },
      data: { read: true },
    })

    const { created, updated, scores } = await recalculateClientHealth(account.clientId)
    const alertsCreated = await dispatchAlertsForClient(account.clientId, scores)

    return {
      platformAccountId,
      adAccountId: account.externalId,
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
        title: `Falha no sync Meta Ads — ${account.client.name}`,
        body: `Não foi possível buscar dados de ${account.externalId}: ${errorMessage}`,
      },
    })

    return {
      platformAccountId,
      adAccountId: account.externalId,
      status: 'FAILED',
      recordsUpserted: 0,
      errorMessage,
      healthScoresUpdated: 0,
      alertsCreated: 0,
    }
  }
}

export async function syncAllMetaAccounts(options: SyncOptions = {}): Promise<SyncResult[]> {
  const accounts = await prisma.platformAccount.findMany({
    where: { platform: 'META_ADS', active: true },
    select: { id: true },
  })

  const results: SyncResult[] = []
  for (const acc of accounts) {
    results.push(await syncMetaAccount(acc.id, options))
  }
  return results
}
