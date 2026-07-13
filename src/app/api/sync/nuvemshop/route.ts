import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { syncNuvemshopAccount, syncAllNuvemshopAccounts } from '@/services/nuvemshop/sync'
import { z } from 'zod'

// Permissivo: ambos opcionais (o corpo vazio {} continua válido = sync geral).
const bodySchema = z.object({
  platformAccountId: z.string().optional(),
  clientId: z.string().optional(),
})

/**
 * POST /api/sync/nuvemshop
 *
 * Sincroniza pedidos da Nuvemshop.
 *
 * Auth: Session (ADMIN/MANAGER) OU x-cron-secret header.
 *
 * Body:
 *   - { platformAccountId: string } → conta específica
 *   - { clientId: string } → todas contas Nuvemshop do cliente
 *   - {} → todas contas ativas (somente ADMIN/CRON)
 *
 * Query params: ?since=YYYY-MM-DD&until=YYYY-MM-DD
 */
export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get('x-cron-secret')
  const isCron = cronSecret && cronSecret === process.env.CRON_SECRET

  const session = !isCron ? await getSession() : null
  if (!isCron && !session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
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

  const since = request.nextUrl.searchParams.get('since') ?? undefined
  const until = request.nextUrl.searchParams.get('until') ?? undefined

  // ── Sync de uma conta específica ────────────────────────────────────────────
  if (platformAccountId) {
    // Verifica permissão
    if (session && session.role !== 'ADMIN') {
      const account = await prisma.platformAccount.findUnique({
        where: { id: platformAccountId },
        select: { clientId: true },
      })
      if (account) {
        const assignment = await prisma.clientAssignment.findFirst({
          where: { clientId: account.clientId, userId: session.userId },
        })
        if (!assignment) {
          return NextResponse.json({ error: 'Sem permissão para esta conta' }, { status: 403 })
        }
      }
    }

    const result = await syncNuvemshopAccount(platformAccountId, { since, until })
    return NextResponse.json(result)
  }

  // ── Sync de todas as contas de um cliente ──────────────────────────────────
  if (clientId) {
    if (session && session.role !== 'ADMIN') {
      const assignment = await prisma.clientAssignment.findFirst({
        where: { clientId, userId: session.userId },
      })
      if (!assignment) {
        return NextResponse.json({ error: 'Sem permissão para este cliente' }, { status: 403 })
      }
    }

    const accounts = await prisma.platformAccount.findMany({
      where: { clientId, platform: 'NUVEMSHOP', active: true },
      select: { id: true },
    })

    const results = []
    for (const acc of accounts) {
      results.push(await syncNuvemshopAccount(acc.id, { since, until }))
    }
    return NextResponse.json({ ok: true, results })
  }

  // ── Sync de todas as contas (ADMIN/CRON only) ─────────────────────────────
  if (!isCron && session?.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Apenas ADMIN ou CRON pode sincronizar todas as contas' },
      { status: 403 }
    )
  }

  const results = await syncAllNuvemshopAccounts({ since, until })
  return NextResponse.json({ ok: true, results })
}
