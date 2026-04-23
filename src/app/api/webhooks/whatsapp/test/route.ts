import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

/** POST — simulate an inbound WhatsApp message to test the webhook pipeline */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const phone = (body.phone ?? '5511999999999').replace(/\D/g, '')
  const name  = body.name  ?? 'Teste WhatsApp Lead'
  const text  = body.text  ?? 'Mensagem de teste via webhook simulado'

  // Forward to the real webhook handler as if Z-API sent it
  const baseUrl = req.nextUrl.origin
  const res = await fetch(`${baseUrl}/api/webhooks/whatsapp`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone,
      fromMe:     false,
      isGroup:    false,
      senderName: name,
      type:       'ReceivedCallback',
      text:       { message: text },
    }),
  })

  const data = await res.json()
  return NextResponse.json({ ok: true, forwarded: data })
}
