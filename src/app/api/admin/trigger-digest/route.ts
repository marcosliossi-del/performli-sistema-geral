import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/dal'
import { sendDailyDigest } from '@/services/notifications/daily-digest'

export async function POST() {
  const session = await requireSession()
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const result = await sendDailyDigest()
    if (result.skipped) {
      return NextResponse.json({ ok: false, error: 'WhatsApp não configurado (verifique ZAPI_INSTANCE_ID, ZAPI_TOKEN e WHATSAPP_GROUP_ID nas variáveis de ambiente)' })
    }
    return NextResponse.json({ ok: true, sent: result.sent })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
