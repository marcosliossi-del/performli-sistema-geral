/**
 * Nuvemshop Sync — via Nuvemshop REST API
 *
 * Fluxo completo por loja:
 *   1. Cria SyncLog (RUNNING)
 *   2. Busca pedidos via API da Nuvemshop
 *   3. Transforma e faz upsert de NuvemshopOrder
 *   4. Agrega por dia e faz upsert de MetricSnapshot
 *   5. Atualiza lastSyncAt na PlatformAccount
 *   6. Finaliza SyncLog (SUCCESS ou FAILED)
 *   7. Recalcula HealthScore + dispara alertas
 */

import { prisma } from '@/lib/prisma'
import { NuvemshopClient } from './client'
import { transformNuvemshopOrder, aggregateOrdersByDay } from './transformers'
import { recalculateClientHealth } from '@/services/health-scorer'
import { dispatchAlertsForClient } from '@/services/alert-dispatcher'

interface SyncOptions {
  since?: string  // YYYY-MM-DD
  until?: string  // YYYY-MM-DD
  /** Cron diário: pula recálculo de saúde por conta (Step 3 recalcula todos em lote). */
  skipHealthRecalc?: boolean
}

export interface NuvemshopSyncResult {
  platformAccountId: string
  storeId: string
  status: 'SUCCESS' | 'FAILED'
  ordersUpserted: number
  snapshotsUpserted: number
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

export async function syncNuvemshopAccount(
  platformAccountId: string,
  options: SyncOptions = {}
): Promise<NuvemshopSyncResult> {
  const account = await prisma.platformAccount.findUnique({
    where: { id: platformAccountId },
    include: {
      client: { select: { id: true, name: true } },
      nuvemshopStore: true,
    },
  })

  if (!account || !account.nuvemshopStore) {
    return {
      platformAccountId,
      storeId: '',
      status: 'FAILED',
      ordersUpserted: 0,
      snapshotsUpserted: 0,
      errorMessage: 'PlatformAccount ou NuvemshopStore não encontrada',
      healthScoresUpdated: 0,
      alertsCreated: 0,
    }
  }

  const store = account.nuvemshopStore

  const syncLog = await prisma.syncLog.create({
    data: { platformAccountId, platform: 'NUVEMSHOP', status: 'RUNNING' },
  })

  const since = options.since ?? defaultSince()
  const until = options.until ?? formatDate(new Date())

  try {
    const client = new NuvemshopClient(store.storeId, store.accessToken)

    // Busca todos os pedidos do período
    const rawOrders = await client.getAllOrders({
      since: new Date(since + 'T00:00:00Z').toISOString(),
      until: new Date(until + 'T23:59:59Z').toISOString(),
      status: 'any',
    })

    // Transforma pedidos
    const transformedOrders = rawOrders.map(transformNuvemshopOrder)

    // Upsert dos pedidos na tabela NuvemshopOrder
    let ordersUpserted = 0
    for (const order of transformedOrders) {
      await prisma.nuvemshopOrder.upsert({
        where: {
          storeId_nuvemshopOrderId: {
            storeId: store.id,
            nuvemshopOrderId: order.nuvemshopOrderId,
          },
        },
        update: {
          status: order.status,
          paymentStatus: order.paymentStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          total: order.total,
          subtotal: order.subtotal,
          discount: order.discount,
          shippingCost: order.shippingCost,
          productsCount: order.productsCount,
          couponCodes: order.couponCodes,
          customerEmail: order.customerEmail,
          customerName: order.customerName,
          utmSource: order.utmSource,
          utmMedium: order.utmMedium,
          utmCampaign: order.utmCampaign,
          utmContent: order.utmContent,
          utmTerm: order.utmTerm,
          landingUrl: order.landingUrl,
          referralUrl: order.referralUrl,
          storefront: order.storefront,
          closedAt: order.closedAt,
          cancelledAt: order.cancelledAt,
          paidAt: order.paidAt,
          rawData: order.rawData as object,
          syncedAt: new Date(),
        },
        create: {
          storeId: store.id,
          nuvemshopOrderId: order.nuvemshopOrderId,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          currency: order.currency,
          total: order.total,
          subtotal: order.subtotal,
          discount: order.discount,
          shippingCost: order.shippingCost,
          productsCount: order.productsCount,
          couponCodes: order.couponCodes,
          customerEmail: order.customerEmail,
          customerName: order.customerName,
          utmSource: order.utmSource,
          utmMedium: order.utmMedium,
          utmCampaign: order.utmCampaign,
          utmContent: order.utmContent,
          utmTerm: order.utmTerm,
          landingUrl: order.landingUrl,
          referralUrl: order.referralUrl,
          storefront: order.storefront,
          closedAt: order.closedAt,
          cancelledAt: order.cancelledAt,
          paidAt: order.paidAt,
          orderCreatedAt: order.orderCreatedAt,
          rawData: order.rawData as object,
        },
      })
      ordersUpserted++
    }

    // Agrega pedidos por dia e upsert no MetricSnapshot
    const dailyMetrics = aggregateOrdersByDay(transformedOrders)
    let snapshotsUpserted = 0

    for (const day of dailyMetrics) {
      await prisma.metricSnapshot.upsert({
        where: {
          platformAccountId_date: { platformAccountId, date: day.date },
        },
        update: {
          conversions: day.orders,
          conversionValue: day.revenue,
          rawData: {
            source: 'nuvemshop',
            orders: day.orders,
            revenue: day.revenue,
            avgTicket: day.avgTicket,
            productsCount: day.productsCount,
            discount: day.discount,
            shipping: day.shipping,
          },
          syncedAt: new Date(),
        },
        create: {
          clientId: account.clientId,
          platformAccountId,
          date: day.date,
          conversions: day.orders,
          conversionValue: day.revenue,
          rawData: {
            source: 'nuvemshop',
            orders: day.orders,
            revenue: day.revenue,
            avgTicket: day.avgTicket,
            productsCount: day.productsCount,
            discount: day.discount,
            shipping: day.shipping,
          },
        },
      })
      snapshotsUpserted++
    }

    // Atualiza lastSyncAt
    await prisma.platformAccount.update({
      where: { id: platformAccountId },
      data: { lastSyncAt: new Date() },
    })

    // Finaliza SyncLog
    const totalRecords = ordersUpserted + snapshotsUpserted
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'SUCCESS', completedAt: new Date(), recordsUpserted: totalRecords },
    })

    // Auto-dismiss sync alerts
    await prisma.alert.updateMany({
      where: { clientId: account.clientId, type: 'SYNC_FAILED', read: false },
      data: { read: true },
    })

    // Recalcula health e dispara alertas (pulado no cron diário — Step 3 faz em lote)
    let healthScoresUpdated = 0
    let alertsCreated = 0
    if (!options.skipHealthRecalc) {
      const { created, updated, scores } = await recalculateClientHealth(account.clientId)
      alertsCreated = await dispatchAlertsForClient(account.clientId, scores)
      healthScoresUpdated = created + updated
    }

    return {
      platformAccountId,
      storeId: store.storeId,
      status: 'SUCCESS',
      ordersUpserted,
      snapshotsUpserted,
      healthScoresUpdated,
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
        title: `Falha no sync Nuvemshop — ${account.client.name}`,
        body: `Não foi possível buscar pedidos da loja ${store.storeName ?? store.storeId}: ${errorMessage}`,
      },
    })

    return {
      platformAccountId,
      storeId: store.storeId,
      status: 'FAILED',
      ordersUpserted: 0,
      snapshotsUpserted: 0,
      errorMessage,
      healthScoresUpdated: 0,
      alertsCreated: 0,
    }
  }
}

export async function syncAllNuvemshopAccounts(
  options: SyncOptions = {}
): Promise<NuvemshopSyncResult[]> {
  const accounts = await prisma.platformAccount.findMany({
    where: { platform: 'NUVEMSHOP', active: true },
    select: { id: true },
  })

  const results: NuvemshopSyncResult[] = []
  for (const acc of accounts) {
    results.push(await syncNuvemshopAccount(acc.id, options))
  }
  return results
}
