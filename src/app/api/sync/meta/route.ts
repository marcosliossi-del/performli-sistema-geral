import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncMetaAccount, syncAllMetaAccounts } from '@/services/meta-ads/sync'
import { getSession } from '@/lib/session'

/**
 * POST /api/sync/meta
 *
 * Dispara o sync completo da Meta Ads Graph API.
 *
 * Body (JSON):
 *   { platformAccountId?: string }  → conta específica
 *   { clientId?: string }           → todas as contas META_ADS do cliente
 *   {}                              → todas as contas ativas (ADMIN / CRON only)
 *
 * Query params:
 *   since=YYYY-MM-DD  (opcional)
 *   until=YYYY-MM-DD  (opcional)
 *
 * Auth: session (ADMIN/MANAGER) ou header x-cron-secret
 */
export async function POST(request: NextRequest) {
  // Auth
  const cronSecret = request.headers.get('x-cron-secret')
  let isCron = false
  let sessionRole: string | null = null
  let sessionUserId: string | null = null

  if (cronSecret) {
    if (cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    isCron = true
  } else {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    sessionRole = session.role
    sessionUserId = session.userId
  }

  const body = await request.json().catch(() => ({}))
  const { platformAccountId, clientId } = body as {
    platformAccountId?: string
    clientId?: string
  }

  const url = new URL(request.url)
  const since = url.searchParams.get('since') ?? undefined
  const until = url.searchParams.get('until') ?? undefined
  const options = { since, until }

  // ── Sync a specific platform account ──────────────────────────────────────
  if (platformAccountId) {
    // Verify access
    if (!isCron && sessionRole !== 'ADMIN') {
      const account = await prisma.platformAccount.findUnique({
        where: { id: platformAccountId },
        select: { clientId: true },
      })
      if (!account) {
        return NextResponse.json({ error: 'Platform account not found' }, { status: 404 })
      }
      const assignment = await prisma.clientAssignment.findFirst({
        where: { clientId: account.clientId, userId: sessionUserId! },
      })
      if (!assignment) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const result = await syncMetaAccount(platformAccountId, options)
    return NextResponse.json({ ok: true, results: [result] })
  }

  // ── Sync all Meta accounts of a specific client ────────────────────────────
  if (clientId) {
    if (!isCron && sessionRole !== 'ADMIN') {
      const assignment = await prisma.clientAssignment.findFirst({
        where: { clientId, userId: sessionUserId! },
      })
      if (!assignment) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const accounts = await prisma.platformAccount.findMany({
      where: { clientId, platform: 'META_ADS', active: true },
      select: { id: true },
    })

    const results = await Promise.all(accounts.map((a) => syncMetaAccount(a.id, options)))
    return NextResponse.json({ ok: true, results })
  }

  // ── Sync ALL active Meta accounts (admin/cron only) ────────────────────────
  if (!isCron && sessionRole !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Forbidden: only admins can sync all accounts' },
      { status: 403 }
    )
  }

  const results = await syncAllMetaAccounts(options)
  return NextResponse.json({ ok: true, results })
}
