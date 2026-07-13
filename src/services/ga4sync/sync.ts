/**
 * GA4Sync Sync — persiste a receita diária autoritativa do GA4Sync no
 * MetricSnapshot, para que as telas internas (que leem MetricSnapshot) passem a
 * usar a receita real de e-commerce Nuvemshop nos clientes que têm loja.
 *
 * Fluxo por cliente:
 *   1. Resolve storeId (resolveGa4SyncStoreId). Sem loja → skip SEM erro.
 *   2. Garante PlatformAccount(platform=GA4SYNC, externalId=storeId).
 *   3. Cria SyncLog (RUNNING).
 *   4. Busca a timeline diária (getTimeline) e faz upsert de MetricSnapshot por dia.
 *   5. Atualiza lastSyncAt na PlatformAccount.
 *   6. Finaliza SyncLog (SUCCESS ou FAILED). Falha NÃO relança (degrade por cliente).
 *
 * CLAUDE.md aplicável:
 *  #5 API key NUNCA em log/URL — o client já garante; aqui nunca a tocamos.
 *  #6 timeout — o client já usa AbortSignal.timeout.
 *  #7 try/catch por cliente — uma loja não derruba as demais.
 *  #9 SyncLog + lastRunAt em toda rotina.
 *
 * IMPORTANTE (bug AL-3): MetricSnapshot.date é @db.Date e a agregação compara
 * contra meia-noite UTC do dia. Gravamos `new Date(`${dateStr}T00:00:00.000Z`)`,
 * nunca fuso local.
 *
 * NÃO altera aggregateSnapshots nem KPIs — esta fatia SÓ persiste. O consumo
 * da nova fonte GA4SYNC pela agregação é a próxima fatia.
 *
 * ⚠️ Shape do timeline (points[].date/revenue/orders) foi modelado a partir da
 * SPEC textual, não do /openapi.json (egress bloqueado em dev). Conferir contra
 * o schema oficial quando houver acesso — ver src/services/ga4sync/types.ts.
 */

import { prisma } from '@/lib/prisma'
import { getTimeline } from './client'
import { getGa4SyncConfig, Ga4SyncConfigError } from './config'
import { resolveGa4SyncStoreId } from './store-resolver'

/** Janela sincronizada a cada rodada (preset da API). */
const SYNC_PRESET = 'last_90d' as const

export interface Ga4SyncAccountResult {
  clientId: string
  skipped: boolean
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED'
  storeId?: string
  snapshotsUpserted?: number
  errorMessage?: string
}

export interface Ga4SyncAllResult {
  synced: number
  skipped: number
  failed: number
  results: Ga4SyncAccountResult[]
}

/** Converte 'YYYY-MM-DD' em meia-noite UTC do dia (compatível com @db.Date). */
function toUtcDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`)
}

/**
 * Sincroniza a receita diária do GA4Sync de UM cliente para o MetricSnapshot.
 * clientId SEMPRE vem do chamador.
 */
export async function syncGa4SyncAccount(clientId: string): Promise<Ga4SyncAccountResult> {
  const storeId = await resolveGa4SyncStoreId(clientId)

  // Cliente sem loja Nuvemshop conectada → não usa GA4Sync. Skip sem erro.
  if (!storeId) {
    return { clientId, skipped: true, status: 'SKIPPED' }
  }

  // Garante a PlatformAccount GA4SYNC (upsert por @@unique[clientId,platform,externalId]).
  // Sem accessToken: a chave do GA4Sync é global (IntegrationSetting/env).
  const account = await prisma.platformAccount.upsert({
    where: {
      clientId_platform_externalId: {
        clientId,
        platform: 'GA4SYNC',
        externalId: storeId,
      },
    },
    update: { active: true },
    create: {
      clientId,
      platform: 'GA4SYNC',
      externalId: storeId,
      name: `GA4Sync store ${storeId}`,
      active: true,
    },
    select: { id: true },
  })

  const syncLog = await prisma.syncLog.create({
    data: { platformAccountId: account.id, platform: 'GA4SYNC', status: 'RUNNING' },
  })

  try {
    const envelope = await getTimeline(storeId, SYNC_PRESET)
    const points = envelope.data?.points ?? []

    let snapshotsUpserted = 0
    for (const point of points) {
      if (!point?.date) continue
      const date = toUtcDate(point.date)
      const revenue = Number.isFinite(point.revenue) ? point.revenue : 0
      // conversions é Int no schema — arredonda para não estourar o upsert se a
      // API devolver fracionário.
      const orders = Number.isFinite(point.orders) ? Math.round(point.orders) : 0

      await prisma.metricSnapshot.upsert({
        where: { platformAccountId_date: { platformAccountId: account.id, date } },
        update: {
          conversions: orders,
          conversionValue: revenue,
          rawData: { source: 'ga4sync', date: point.date, revenue, orders },
          syncedAt: new Date(),
        },
        create: {
          clientId,
          platformAccountId: account.id,
          date,
          conversions: orders,
          conversionValue: revenue,
          rawData: { source: 'ga4sync', date: point.date, revenue, orders },
        },
      })
      snapshotsUpserted++
    }

    await prisma.platformAccount.update({
      where: { id: account.id },
      data: { lastSyncAt: new Date() },
    })

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'SUCCESS', completedAt: new Date(), recordsUpserted: snapshotsUpserted },
    })

    return { clientId, skipped: false, status: 'SUCCESS', storeId, snapshotsUpserted }
  } catch (error) {
    // Degrade por cliente: fecha o SyncLog como FAILED e NÃO relança.
    // A mensagem do Ga4SyncError/Ga4SyncConfigError já é livre de segredos.
    const errorMessage = error instanceof Error ? error.message : String(error)

    await prisma.syncLog
      .update({
        where: { id: syncLog.id },
        data: { status: 'FAILED', completedAt: new Date(), errorMessage },
      })
      .catch(() => {})

    return { clientId, skipped: false, status: 'FAILED', storeId, errorMessage }
  }
}

/**
 * Sincroniza a receita do GA4Sync de TODOS os clientes ATIVOS, sequencialmente,
 * com try/catch por cliente (uma falha não derruba as demais).
 * Retorna resumo {synced, skipped, failed}.
 */
export async function syncAllGa4SyncAccounts(): Promise<Ga4SyncAllResult> {
  // Se a integração não está configurada (sem chave), não quebra o cron:
  // registra um log claro e retorna resumo vazio.
  try {
    await getGa4SyncConfig()
  } catch (err) {
    if (err instanceof Ga4SyncConfigError) {
      console.warn('[ga4sync] sync ignorado: integração não configurada (sem GA4SYNC_API_KEY)')
      return { synced: 0, skipped: 0, failed: 0, results: [] }
    }
    throw err
  }

  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  })

  const results: Ga4SyncAccountResult[] = []
  let synced = 0
  let skipped = 0
  let failed = 0

  for (const client of clients) {
    try {
      const result = await syncGa4SyncAccount(client.id)
      results.push(result)
      if (result.status === 'SUCCESS') synced++
      else if (result.status === 'SKIPPED') skipped++
      else failed++
    } catch (err) {
      // Defesa extra: syncGa4SyncAccount já não relança, mas garantimos que
      // um erro inesperado (ex.: DB) em um cliente não derrube o loop.
      const errorMessage = err instanceof Error ? err.message : String(err)
      results.push({ clientId: client.id, skipped: false, status: 'FAILED', errorMessage })
      failed++
    }
  }

  return { synced, skipped, failed, results }
}
