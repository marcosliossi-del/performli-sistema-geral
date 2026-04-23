import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { getConfig, getQrCode, getStatus } from '@/services/zapi/client'
import { z } from 'zod'

const saveSchema = z.object({
  instanceId:  z.string().min(1),
  token:       z.string().min(1),
  clientToken: z.string().optional(),
})

/** GET — config + live status */
export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const config = await getConfig()
  if (!config) return NextResponse.json({ configured: false })

  const status = await getStatus(config)
  return NextResponse.json({ configured: true, instanceId: config.instanceId, ...status })
}

/** POST — save credentials */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body   = await req.json()
  const parsed = saveSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { instanceId, token, clientToken } = parsed.data

  await prisma.integrationSetting.upsert({ where: { key: 'ZAPI_INSTANCE_ID'   }, create: { key: 'ZAPI_INSTANCE_ID',   value: instanceId          }, update: { value: instanceId          } })
  await prisma.integrationSetting.upsert({ where: { key: 'ZAPI_TOKEN'         }, create: { key: 'ZAPI_TOKEN',         value: token               }, update: { value: token               } })
  await prisma.integrationSetting.upsert({ where: { key: 'ZAPI_CLIENT_TOKEN'  }, create: { key: 'ZAPI_CLIENT_TOKEN',  value: clientToken ?? ''   }, update: { value: clientToken ?? ''   } })

  const config = { instanceId, token, clientToken: clientToken ?? '' }
  const status = await getStatus(config)
  return NextResponse.json({ ok: true, configured: true, ...status })
}

/** DELETE — remove credentials */
export async function DELETE(_req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.integrationSetting.deleteMany({
    where: { key: { in: ['ZAPI_INSTANCE_ID', 'ZAPI_TOKEN', 'ZAPI_CLIENT_TOKEN'] } },
  })
  return NextResponse.json({ ok: true })
}

/** PATCH — refresh QR code */
export async function PATCH(_req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const config = await getConfig()
  if (!config) return NextResponse.json({ error: 'Not configured' }, { status: 400 })

  const qr = await getQrCode(config)
  return NextResponse.json({ qr })
}
