import { NextRequest, NextResponse } from 'next/server'
import { sendDailyDigest } from '@/services/notifications/daily-digest'
import { isCronAuthorized } from '@/lib/cron-auth'

/**
 * GET /api/cron/digest
 *
 * Dedicated cron for the WhatsApp daily digest.
 * Runs at 11:30 UTC (08:30 BRT/São Paulo) — after the main data sync cron (11:00).
 * Kept separate so a slow/timed-out sync never prevents the digest from sending.
 */

function isAuthorized(request: NextRequest): boolean {
  return isCronAuthorized(request) // comparação timing-safe compartilhada
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
    console.error('[cron/digest] Failed to send digest:', err)
    return NextResponse.json({ ok: false, error: 'Falha ao enviar o resumo diário.' }, { status: 500 })
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
    console.error('[cron/digest] Failed to send digest (POST):', err)
    return NextResponse.json({ ok: false, error: 'Falha ao enviar o resumo diário.' }, { status: 500 })
  }
}
