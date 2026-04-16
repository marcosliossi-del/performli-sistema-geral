import { NextRequest, NextResponse } from 'next/server'
import { sendDailyDigest } from '@/services/notifications/daily-digest'

/**
 * GET /api/cron/digest
 *
 * Dedicated cron for the WhatsApp daily digest.
 * Runs at 12:15 UTC (09:15 BRT) — after the main data sync cron (12:00).
 * Kept separate so a slow/timed-out sync never prevents the digest from sending.
 */

function isAuthorized(request: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret) {
    console.error('[cron/digest] CRON_SECRET env var is not set — all requests will be rejected')
    return false
  }
  const authHeader  = request.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const customToken = request.headers.get('x-cron-secret')
  return (bearerToken ?? customToken) === expectedSecret
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await sendDailyDigest()

    if (result.skipped) {
      console.warn('[cron/digest] Digest skipped — check ZAPI_INSTANCE_ID, ZAPI_TOKEN and WHATSAPP_GROUP_ID / WHATSAPP_NOTIFY_NUMBERS in Vercel env vars')
      return NextResponse.json({ ok: true, skipped: true, reason: 'missing_env_vars' })
    }

    console.log(`[cron/digest] Digest sent to ${result.sent} recipient(s)`)
    return NextResponse.json({ ok: true, sent: result.sent })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/digest] Failed to send digest:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

// Allow manual POST trigger for testing
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await sendDailyDigest()
    if (result.skipped) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'missing_env_vars' })
    }
    return NextResponse.json({ ok: true, sent: result.sent })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
