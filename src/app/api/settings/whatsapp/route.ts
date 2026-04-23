import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { createInstance, getQrCode, getStatus, setWebhook, getConfig } from '@/services/evolution/client'
import { z } from 'zod'

const saveSchema = z.object({
  url:      z.string().url(),
  apiKey:   z.string().min(1),
  instance: z.string().min(1),
})

/** GET — return current config + live status */
export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const config = await getConfig()
  if (!config) return NextResponse.json({ configured: false })

  const status = await getStatus(config)
  return NextResponse.json({
    configured: true,
    url:        config.url,
    instance:   config.instance,
    ...status,
  })
}

/** POST — save credentials + create instance + set webhook */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body   = await req.json()
  const parsed = saveSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { url, apiKey, instance } = parsed.data

  await prisma.integrationSetting.upsert({ where: { key: 'EVOLUTION_URL'      }, create: { key: 'EVOLUTION_URL',      value: url      }, update: { value: url      } })
  await prisma.integrationSetting.upsert({ where: { key: 'EVOLUTION_KEY'      }, create: { key: 'EVOLUTION_KEY',      value: apiKey   }, update: { value: apiKey   } })
  await prisma.integrationSetting.upsert({ where: { key: 'EVOLUTION_INSTANCE' }, create: { key: 'EVOLUTION_INSTANCE', value: instance }, update: { value: instance } })

  const config = { url, apiKey, instance }
  await createInstance(config)

  // Register webhook pointing back to this system
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL
  if (appUrl) {
    const webhookUrl = `${appUrl.startsWith('http') ? appUrl : `https://${appUrl}`}/api/webhooks/whatsapp`
    await setWebhook(config, webhookUrl).catch(() => null)
  }

  const status = await getStatus(config)
  return NextResponse.json({ ok: true, ...status })
}

/** DELETE — disconnect / remove credentials */
export async function DELETE(_req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.integrationSetting.deleteMany({
    where: { key: { in: ['EVOLUTION_URL', 'EVOLUTION_KEY', 'EVOLUTION_INSTANCE'] } },
  })
  return NextResponse.json({ ok: true })
}

/** PATCH — fetch fresh QR code */
export async function PATCH(_req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const config = await getConfig()
  if (!config) return NextResponse.json({ error: 'Not configured' }, { status: 400 })

  const qr = await getQrCode(config)
  return NextResponse.json({ qr })
}
