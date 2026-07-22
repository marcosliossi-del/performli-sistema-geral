import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { syncGA4Account } from '@/services/ga4/sync'
import { syncMetaAccount } from '@/services/meta-ads/sync'
import { syncGoogleAdsAccount } from '@/services/google-ads/sync'
import { recalculateClientHealth } from '@/services/health-scorer'
import { dispatchAlertsForClient } from '@/services/alert-dispatcher'
import { getMonthRange } from '@/lib/utils'

/**
 * GET /api/sync/stream
 *
 * Server-Sent Events: syncs all active clients using a worker-pool with
 * CONCURRENCY simultaneous clients. Streams an event for each client that
 * completes, including updated row metrics for live table updates.
 *
 * Events:
 *   { type: 'start',    clientId, name, done, total }
 *   { type: 'done',     clientId, name, done, total, row: OperationalRow }
 *   { type: 'error',    clientId, name, done, total }
 *   { type: 'complete', done, total }
 *
 * Auth: ADMIN session only
 */

// Number of clients processed simultaneously.
// Each client already parallelises its own platforms (GA4 + Meta + Google Ads),
// so CONCURRENCY=6 means up to 6×3 = 18 concurrent external API calls.
const CONCURRENCY = 6
export async function GET(_request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return new Response('Unauthorized', { status: 401 })
  }

  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      slug: true,
      platformAccounts: {
        where: { active: true },
        select: { id: true, platform: true },
      },
      assignments: {
        where: { isPrimary: true },
        include: { user: { select: { name: true } } },
        take: 1,
      },
    },
    orderBy: { name: 'asc' },
  })

  const total = clients.length
  const enc   = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch { /* disconnected */ }
      }

      const { start: monthStart } = getMonthRange()

      let done = 0
      const queue = [...clients] // shared mutable queue

      // Process one client fully: sync all platforms → health → emit event
      async function processClient(client: typeof clients[number]) {
        send({ type: 'start', clientId: client.id, name: client.name, done, total })
        try {
          const ga4Ids  = client.platformAccounts.filter(a => a.platform === 'GA4').map(a => a.id)
          const metaIds = client.platformAccounts.filter(a => a.platform === 'META_ADS').map(a => a.id)
          const gadsIds = client.platformAccounts.filter(a => a.platform === 'GOOGLE_ADS').map(a => a.id)

          await Promise.allSettled([
            ...ga4Ids.map(id  => syncGA4Account(id)),
            ...metaIds.map(id => syncMetaAccount(id)),
            ...gadsIds.map(id => syncGoogleAdsAccount(id)),
          ])

          const { scores } = await recalculateClientHealth(client.id)
          await dispatchAlertsForClient(client.id, scores)
          const row = await getClientOperationalRow(client, monthStart)

          done++
          send({ type: 'done', clientId: client.id, name: client.name, done, total, row })
        } catch {
          done++
          send({ type: 'error', clientId: client.id, name: client.name, done, total })
        }
      }

      // Worker pool: CONCURRENCY workers drain the queue concurrently
      async function worker() {
        while (true) {
          const client = queue.shift()
          if (!client) break
          await processClient(client)
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, clients.length) }, worker)
      )

      send({ type: 'complete', done: total, total })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

// ─── Per-client operational row computation ────────────────────────────────────

async function getClientOperationalRow(
  client: { id: string; name: string; slug: string; assignments: { user: { name: string } }[] },
  monthStart: Date,
) {
  const today = new Date()

  const [snaps, healthScores, goals, streak] = await Promise.all([
    prisma.metricSnapshot.findMany({
      where: { clientId: client.id, date: { gte: monthStart, lte: today } },
      select: {
        spend: true, clicks: true, conversions: true, conversionValue: true, netRevenue: true,
        date: true, platformAccount: { select: { platform: true } },
      },
    }),
    prisma.healthScore.findMany({
      where: { clientId: client.id, periodStart: { gte: monthStart } },
      select: { status: true },
    }),
    prisma.goal.findMany({
      where: {
        clientId: client.id, metric: 'SPEND', period: 'MONTHLY',
        startDate: { lte: today }, endDate: { gte: monthStart },
      },
      select: { id: true, targetValue: true },
      take: 1,
    }),
    prisma.clientStatusStreak.findUnique({
      where: { clientId: client.id },
      select: { status: true, prevStatus: true },
    }),
  ])

  const ga4  = snaps.filter(x => x.platformAccount.platform === 'GA4')
  const ads  = snaps.filter(x => x.platformAccount.platform !== 'GA4')

  const spend        = ads.reduce((s, x) => s + Number(x.spend ?? 0), 0)
  const sessions     = ga4.reduce((s, x) => s + (x.clicks ?? 0), 0)
  const ga4Purchases = ga4.reduce((s, x) => s + (x.conversions ?? 0), 0)
  const adPurchases  = ads.reduce((s, x) => s + (x.conversions ?? 0), 0)
  const purchases    = ga4Purchases > 0 ? ga4Purchases : adPurchases
  const ga4Rev       = ga4.reduce((s, x) => s + Number(x.conversionValue ?? 0), 0)
  const adRev        = ads.reduce((s, x) => s + Number(x.conversionValue ?? 0), 0)
  const revenue      = ga4Rev > 0 ? ga4Rev : adRev

  const roas          = spend > 0 && revenue > 0 ? revenue / spend : null
  const cpa           = spend > 0 && purchases > 0 ? spend / purchases : null
  const cps           = spend > 0 && sessions > 0 ? spend / sessions : null
  const taxaConversao = sessions > 0 && purchases > 0 ? (purchases / sessions) * 100 : null

  const overallStatus =
    healthScores.length === 0 ? null
    : healthScores.some(s => s.status === 'RUIM')    ? 'RUIM'
    : healthScores.some(s => s.status === 'REGULAR') ? 'REGULAR'
    : 'OTIMO'

  const budgetPlanned = goals[0] ? Number(goals[0].targetValue) : null
  const goalId        = goals[0]?.id ?? null

  const STATUS_RANK: Record<string, number> = { RUIM: 0, REGULAR: 1, OTIMO: 2 }
  const statusTrend: 'up' | 'down' | null = (() => {
    if (!streak?.status || !streak?.prevStatus) return null
    const diff = STATUS_RANK[streak.status] - STATUS_RANK[streak.prevStatus]
    if (diff > 0) return 'up'
    if (diff < 0) return 'down'
    return null
  })()

  return {
    id: client.id,
    name: client.name,
    slug: client.slug,
    primaryManager: client.assignments[0]?.user.name ?? null,
    vendas:          purchases > 0 ? purchases : null,
    cpa,
    roas,
    gasto:           spend > 0 ? spend : null,
    cps,
    taxaConversao,
    overallStatus,
    statusTrend,
    budgetConsumed:  spend > 0 ? spend : null,
    budgetPlanned,
    goalId,
  }
}
