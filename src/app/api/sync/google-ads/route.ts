import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncGoogleAdsAccount, syncAllGoogleAdsAccounts } from '@/services/google-ads/sync'
import { getSession } from '@/lib/session'
import { isCronAuthorized } from '@/lib/cron-auth'
import { z } from 'zod'

// Permissivo: ambos opcionais (o corpo vazio {} continua válido = sync geral).
const bodySchema = z.object({
  platformAccountId: z.string().optional(),
  clientId: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get('x-cron-secret')
  let isCron = false
  let sessionRole: string | null = null
  let sessionUserId: string | null = null

  if (cronSecret) {
    // ME-13: comparação TIMING-SAFE via isCronAuthorized (=== cru vaza tempo de
    // comparação). Fallback de sessão de staff abaixo permanece inalterado.
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    isCron = true
  } else {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    sessionRole   = session.role
    sessionUserId = session.userId
  }

  const body = await request.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Corpo inválido: platformAccountId e clientId, quando presentes, devem ser texto.' },
      { status: 400 },
    )
  }
  const { platformAccountId, clientId } = parsed.data

  const url   = new URL(request.url)
  const since = url.searchParams.get('since') ?? undefined
  const until = url.searchParams.get('until') ?? undefined
  const opts  = { since, until }

  if (platformAccountId) {
    if (!isCron && sessionRole !== 'ADMIN') {
      const account = await prisma.platformAccount.findUnique({ where: { id: platformAccountId }, select: { clientId: true } })
      if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const assignment = await prisma.clientAssignment.findFirst({ where: { clientId: account.clientId, userId: sessionUserId! } })
      if (!assignment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const result = await syncGoogleAdsAccount(platformAccountId, opts)
    return NextResponse.json({ ok: true, results: [result] })
  }

  if (clientId) {
    if (!isCron && sessionRole !== 'ADMIN') {
      const assignment = await prisma.clientAssignment.findFirst({ where: { clientId, userId: sessionUserId! } })
      if (!assignment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const accounts = await prisma.platformAccount.findMany({ where: { clientId, platform: 'GOOGLE_ADS', active: true }, select: { id: true } })
    const results  = await Promise.all(accounts.map((a) => syncGoogleAdsAccount(a.id, opts)))
    return NextResponse.json({ ok: true, results })
  }

  if (!isCron && sessionRole !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const results = await syncAllGoogleAdsAccounts(opts)
  return NextResponse.json({ ok: true, results })
}
