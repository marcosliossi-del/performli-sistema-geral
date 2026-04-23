import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface WaMessage {
  key:     { remoteJid: string; fromMe: boolean }
  message: { conversation?: string; extendedTextMessage?: { text: string } } | null
  pushName?: string
}

interface WaPayload {
  event: string
  data:  { messages?: WaMessage[] } | WaMessage
}

function extractPhone(jid: string): string {
  return jid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace(/[^0-9]/g, '')
}

function extractText(msg: WaMessage): string | null {
  return msg.message?.conversation
    ?? msg.message?.extendedTextMessage?.text
    ?? null
}

export async function POST(req: NextRequest) {
  try {
    const payload: WaPayload = await req.json()

    if (payload.event !== 'messages.upsert' && payload.event !== 'MESSAGES_UPSERT') {
      return NextResponse.json({ ok: true })
    }

    const messages: WaMessage[] = Array.isArray((payload.data as { messages?: WaMessage[] }).messages)
      ? (payload.data as { messages: WaMessage[] }).messages
      : [payload.data as WaMessage]

    for (const msg of messages) {
      if (msg.key.fromMe) continue

      const phone = extractPhone(msg.key.remoteJid)
      if (!phone || phone.length < 10) continue

      const text     = extractText(msg)
      const pushName = msg.pushName ?? null

      // Check if already a known client
      const client = await prisma.client.findFirst({
        where: { phone: { contains: phone.slice(-9) } },
        select: { id: true, name: true },
      })
      if (client) continue // existing client — skip lead creation

      // Check if already a lead with this phone
      const existingLead = await prisma.agencyLead.findFirst({
        where: { phone: { contains: phone.slice(-9) }, deletedAt: null },
        select: { id: true },
      })

      if (existingLead) {
        // Add WhatsApp activity to existing lead
        if (text) {
          await prisma.agencyActivity.create({
            data: {
              type:   'WHATSAPP',
              title:  'Mensagem recebida',
              body:   text,
              leadId: existingLead.id,
            },
          })
        }
      } else {
        // Create new lead
        const lead = await prisma.agencyLead.create({
          data: {
            name:   pushName ?? `WhatsApp +${phone}`,
            phone:  `+${phone}`,
            source: 'WhatsApp',
            status: 'NOVO',
          },
        })

        if (text) {
          await prisma.agencyActivity.create({
            data: {
              type:   'WHATSAPP',
              title:  'Primeira mensagem',
              body:   text,
              leadId: lead.id,
            },
          })
        }
      }
    }
  } catch (err) {
    console.error('[whatsapp webhook]', err)
  }

  // Always return 200 to prevent Evolution retries
  return NextResponse.json({ ok: true })
}
