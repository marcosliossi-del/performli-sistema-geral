/**
 * Meta Ads Sync — via Meta Marketing API (direto, sem Windsor)
 *
 * Fluxo completo por conta de plataforma:
 *   1. Cria SyncLog (RUNNING)
 *   2. Busca insights diários e por campanha em paralelo
 *   3. Transforma e faz upsert de MetricSnapshot / CampaignSnapshot
 *   4. Atualiza lastSyncAt na PlatformAccount
 *   5. Finaliza SyncLog (SUCCESS ou FAILED)
 *   6. Recalcula HealthScore + dispara alertas
 */

import { prisma } from '@/lib/prisma'
import { MetaAdsClient } from './client'
import { transformMetaInsight, transformMetaCampaignInsight } from './transformers'
import { recalculateClientHealth } from '@/services/health-scorer'
import { dispatchAlertsForClient } from '@/services/alert-dispatcher'
import { createSyncFailedAlert } from '@/lib/sync-alert'

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
  const now = new Date()
  return formatDate(new Date(now.getFullYear(), now.getMonth(), 1))
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
    // Token individual da conta tem prioridade; fallback para META_SYSTEM_TOKEN
    const metaClient = new MetaAdsClient(account.accessToken)

    // Busca insights de conta e campanhas em paralelo
    const [rows, campaignRows] = await Promise.all([
      metaClient.getInsights(account.externalId, since, until),
      metaClient.getCampaignInsights(account.externalId, since, until),
    ])

    let recordsUpserted = 0

    for (const row of rows) {
      const snapshot = transformMetaInsight(row)

      await prisma.metricSnapshot.upsert({
        where: { platformAccountId_date: { platformAccountId, date: snapshot.date } },
        update: {
          spend:           snapshot.spend,
          impressions:     snapshot.impressions,
          clicks:          snapshot.clicks,
          reach:           snapshot.reach,
          frequency:       snapshot.frequency,
          ctr:             snapshot.ctr,
          cpc:             snapshot.cpc,
          conversions:     snapshot.conversions,
          conversionValue: snapshot.conversionValue,
          roas:            snapshot.roas,
          cpl:             snapshot.cpl,
          newUsers:        null,
          rawData:         snapshot.rawData as object,
          syncedAt:        new Date(),
        },
        create: {
          clientId:        account.clientId,
          platformAccountId,
          date:            snapshot.date,
          spend:           snapshot.spend,
          impressions:     snapshot.impressions,
          clicks:          snapshot.clicks,
          reach:           snapshot.reach,
          frequency:       snapshot.frequency,
          ctr:             snapshot.ctr,
          cpc:             snapshot.cpc,
          conversions:     snapshot.conversions,
          conversionValue: snapshot.conversionValue,
          roas:            snapshot.roas,
          cpl:             snapshot.cpl,
          rawData:         snapshot.rawData as object,
        },
      })
      recordsUpserted++
    }

    // ── Campaign-level sync ────────────────────────────────────────────────
    for (const row of campaignRows) {
      const snap = transformMetaCampaignInsight(row)
      const adSetId = snap.adSetId ?? ''

      await prisma.campaignSnapshot.upsert({
        where: {
          platformAccountId_date_campaignId_adSetId: {
            platformAccountId,
            date:       snap.date,
            campaignId: snap.campaignId,
            adSetId,
          },
        },
        update: {
          campaignName:    snap.campaignName,
          adSetName:       snap.adSetName,
          spend:           snap.spend,
          impressions:     snap.impressions,
          clicks:          snap.clicks,
          reach:           snap.reach,
          ctr:             snap.ctr,
          cpc:             snap.cpc,
          conversions:     snap.conversions,
          conversionValue: snap.conversionValue,
          roas:            snap.roas,
          cpl:             snap.cpl,
          syncedAt:        new Date(),
        },
        create: {
          clientId:        account.clientId,
          platformAccountId,
          platform:        'META_ADS',
          date:            snap.date,
          campaignId:      snap.campaignId,
          campaignName:    snap.campaignName,
          adSetId,
          adSetName:       snap.adSetName,
          spend:           snap.spend,
          impressions:     snap.impressions,
          clicks:          snap.clicks,
          reach:           snap.reach,
          ctr:             snap.ctr,
          cpc:             snap.cpc,
          conversions:     snap.conversions,
          conversionValue: snap.conversionValue,
          roas:            snap.roas,
          cpl:             snap.cpl,
        },
      })
    }

    await prisma.platformAccount.update({
      where: { id: platformAccountId },
      data: { lastSyncAt: new Date() },
    })

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'SUCCESS', completedAt: new Date(), recordsUpserted },
    })

    // Auto-dismiss stale SYNC_FAILED alerts para esta conta
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

    await createSyncFailedAlert(
      account.clientId,
      `Falha no sync Meta Ads — ${account.client.name}`,
      `Não foi possível buscar dados de ${account.externalId}: ${errorMessage}`,
    )

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
  for (let i = 0; i < accounts.length; i++) {
    results.push(await syncMetaAccount(accounts[i].id, options))
    // 1s delay between accounts to stay within Meta's rate limits
    if (i < accounts.length - 1) await new Promise((r) => setTimeout(r, 1000))
  }
  return results
}
