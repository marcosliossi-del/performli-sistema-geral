import { prisma } from '@/lib/prisma'
import { GoogleAdsClient } from './client'
import { aggregateByDate } from './transformers'
import { recalculateClientHealth } from '@/services/health-scorer'
import { dispatchAlertsForClient } from '@/services/alert-dispatcher'

interface SyncOptions {
  since?: string
  until?: string
}

export interface GoogleAdsSyncResult {
  platformAccountId: string
  customerId: string
  status: 'SUCCESS' | 'FAILED'
  recordsUpserted: number
  errorMessage?: string
  healthScoresUpdated: number
  alertsCreated: number
}

function formatDate(d: Date) {
  return d.toISOString().split('T')[0]
}

function defaultSince() {
  const now = new Date()
  return formatDate(new Date(now.getFullYear(), now.getMonth(), 1))
}

export async function syncGoogleAdsAccount(
  platformAccountId: string,
  options: SyncOptions = {}
): Promise<GoogleAdsSyncResult> {
  const account = await prisma.platformAccount.findUnique({
    where: { id: platformAccountId },
    include: { client: { select: { id: true, name: true } } },
  })

  if (!account) {
    return { platformAccountId, customerId: '', status: 'FAILED', recordsUpserted: 0,
      errorMessage: 'PlatformAccount não encontrada', healthScoresUpdated: 0, alertsCreated: 0 }
  }

  const syncLog = await prisma.syncLog.create({
    data: { platformAccountId, platform: 'GOOGLE_ADS', status: 'RUNNING' },
  })

  const since = options.since ?? defaultSince()
  const until = options.until ?? formatDate(new Date())

  try {
    const client = new GoogleAdsClient()
    const rows   = await client.getCampaignReport(account.externalId, since, until)
    const dailySnapshots = aggregateByDate(rows)

    let recordsUpserted = 0
    for (const snap of dailySnapshots) {
      await prisma.metricSnapshot.upsert({
        where:  { platformAccountId_date: { platformAccountId, date: snap.date } },
        create: {
          platformAccountId,
          clientId:        account.clientId,
          date:            snap.date,
          spend:           snap.spend,
          impressions:     snap.impressions,
          clicks:          snap.clicks,
          conversions:     snap.conversions,
          conversionValue: snap.conversionValue,
          ctr:             snap.ctr,
          cpc:             snap.cpc,
        },
        update: {
          spend:           snap.spend,
          impressions:     snap.impressions,
          clicks:          snap.clicks,
          conversions:     snap.conversions,
          conversionValue: snap.conversionValue,
          ctr:             snap.ctr,
          cpc:             snap.cpc,
        },
      })
      recordsUpserted++
    }

    await prisma.platformAccount.update({
      where: { id: platformAccountId },
      data:  { lastSyncAt: new Date() },
    })

    const healthResult = await recalculateClientHealth(account.clientId)
    const alertsCreated = await dispatchAlertsForClient(account.clientId, healthResult.scores)

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data:  { status: 'SUCCESS', recordsUpserted, completedAt: new Date() },
    })

    return {
      platformAccountId,
      customerId:          account.externalId,
      status:              'SUCCESS',
      recordsUpserted,
      healthScoresUpdated: healthResult.updated,
      alertsCreated,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data:  { status: 'FAILED', errorMessage, completedAt: new Date() },
    })
    await prisma.alert.create({
      data: {
        clientId: account.clientId,
        type:     'SYNC_FAILED',
        title:    `Falha no sync Google Ads — ${account.client.name}`,
        body:     `Não foi possível buscar dados de ${account.externalId}: ${errorMessage}`,
      },
    })
    return { platformAccountId, customerId: account.externalId, status: 'FAILED',
      recordsUpserted: 0, errorMessage, healthScoresUpdated: 0, alertsCreated: 0 }
  }
}

export async function syncAllGoogleAdsAccounts(options: SyncOptions = {}): Promise<GoogleAdsSyncResult[]> {
  const accounts = await prisma.platformAccount.findMany({
    where:  { platform: 'GOOGLE_ADS', active: true },
    select: { id: true },
  })
  const results: GoogleAdsSyncResult[] = []
  for (const acc of accounts) {
    results.push(await syncGoogleAdsAccount(acc.id, options))
  }
  return results
}
