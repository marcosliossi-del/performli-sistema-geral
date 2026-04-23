import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Z-API webhook payload for received messages
interface ZApiPayload {
  phone?:            string   // sender phone (with country code, no +)
  participantPhone?: string
  fromMe?:           boolean
  isGroup?:          boolean
  senderName?:       string
  text?:             { message?: string }
  type?:             string
}

export async function POST(req: NextRequest) {
  try {
    // Optional: validate Z-API client-token header
    const clientToken = req.headers.get('client-token')
    if (clientToken) {
      const row = await prisma.integrationSetting.findUnique({ where: { key: 'ZAPI_CLIENT_TOKEN' } })
      if (row?.value && row.value !== clientToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const payload: ZApiPayload = await req.json()

    // Ignore messages sent by us or group messages
    if (payload.fromMe || payload.isGroup) return NextResponse.json({ ok: true })
    if (!payload.phone) return NextResponse.json({ ok: true })

    const phone     = payload.phone.replace(/\D/g, '')
    const text      = payload.text?.message ?? null
    const senderName = payload.senderName ?? null

    if (phone.length < 10) return NextResponse.json({ ok: true })

    // Skip if already a known client
    const client = await prisma.client.findFirst({
      where: { phone: { contains: phone.slice(-9) } },
      select: { id: true },
    })
    if (client) return NextResponse.json({ ok: true })

    // Check existing lead
    const existingLead = await prisma.agencyLead.findFirst({
      where: { phone: { contains: phone.slice(-9) }, deletedAt: null },
      select: { id: true },
    })

    if (existingLead) {
      if (text) {
        await prisma.agencyActivity.create({
          data: { type: 'WHATSAPP', title: 'Mensagem recebida', body: text, leadId: existingLead.id },
        })
      }
    } else {
      const lead = await prisma.agencyLead.create({
        data: {
          name:   senderName ?? `WhatsApp +${phone}`,
          phone:  `+${phone}`,
          source: 'WhatsApp',
          status: 'NOVO',
        },
      })
      if (text) {
        await prisma.agencyActivity.create({
          data: { type: 'WHATSAPP', title: 'Primeira mensagem', body: text, leadId: lead.id },
        })
      }
    }
  } catch (err) {
    console.error('[whatsapp webhook]', err)
  }

  return NextResponse.json({ ok: true })
}
