import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { AsaasClient } from '@/services/asaas/client'
import { z } from 'zod'

const saveSchema = z.object({
  apiKey:  z.string().min(1),
  sandbox: z.boolean().optional(),
})

/** GET — return current config (key masked) */
export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await prisma.integrationSetting.findMany({
    where: { key: { in: ['ASAAS_API_KEY', 'ASAAS_SANDBOX'] } },
  })
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]))

  const hasKey = !!(map.ASAAS_API_KEY || process.env.ASAAS_API_KEY)
  const sandbox = map.ASAAS_SANDBOX === 'true' || process.env.ASAAS_SANDBOX === 'true'
  const masked  = map.ASAAS_API_KEY
    ? `${'•'.repeat(20)}${map.ASAAS_API_KEY.slice(-4)}`
    : process.env.ASAAS_API_KEY ? '(configurada via env)' : ''

  return NextResponse.json({ hasKey, sandbox, masked })
}

/** POST — save API key + sandbox flag, then test connection */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body   = await req.json()
  const parsed = saveSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { apiKey, sandbox = false } = parsed.data

  await prisma.integrationSetting.upsert({
    where: { key: 'ASAAS_API_KEY' },
    create: { key: 'ASAAS_API_KEY', value: apiKey },
    update: { value: apiKey },
  })
  await prisma.integrationSetting.upsert({
    where: { key: 'ASAAS_SANDBOX' },
    create: { key: 'ASAAS_SANDBOX', value: String(sandbox) },
    update: { value: String(sandbox) },
  })

  // Test the key
  try {
    const client  = new AsaasClient(apiKey, sandbox)
    const balance = await client.getBalance()
    return NextResponse.json({ ok: true, balance: balance.balance })
  } catch (err) {
    console.error('[settings/asaas] falha ao testar chave', err)
    return NextResponse.json({ ok: false, error: 'A chave foi salva, mas a conexão de teste com o Asaas falhou. Verifique se a chave está correta.' }, { status: 422 })
  }
}

/** DELETE — remove saved key */
export async function DELETE(_req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.integrationSetting.deleteMany({
    where: { key: { in: ['ASAAS_API_KEY', 'ASAAS_SANDBOX'] } },
  })
  return NextResponse.json({ ok: true })
}
