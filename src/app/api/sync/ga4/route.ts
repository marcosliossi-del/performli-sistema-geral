import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncGA4Account, syncAllGA4Accounts } from '@/services/ga4/sync'
import { syncGa4SyncAccount } from '@/services/ga4sync/sync'
import { getSession } from '@/lib/session'
import { isCronAuthorized } from '@/lib/cron-auth'
import { z } from 'zod'

// Permissivo: ambos opcionais (o corpo vazio {} continua válido = sync geral).
const bodySchema = z.object({
  platformAccountId: z.string().optional(),
  clientId: z.string().optional(),
})

/**
 * Dispara o sync GA4Sync (receita LÍQUIDA da loja) EMBUTIDO no Sincronizar do GA4.
 * Decisão Marcos 2026-07-23 (padronização): um botão só — quem tem loja GA4Sync
 * recebe o líquido junto, sem clicar num segundo botão. try/catch ISOLADO: falha
 * do GA4Sync NUNCA derruba a resposta do GA4. syncGa4SyncAccount já faz skip sem
 * erro quando o cliente não tem loja (resolveGa4SyncStoreId == null).
 */
async function triggerGa4SyncEmbedded(clientId: string): Promise<void> {
  try {
    await syncGa4SyncAccount(clientId)
  } catch (err) {
    // syncGa4SyncAccount já é degrade-por-cliente (não relança); este catch é
    // defesa extra para não vazar erro do GA4Sync na rota do GA4.
    console.warn(
      `[ga4] GA4Sync embutido falhou para clientId=${clientId}:`,
      err instanceof Error ? err.message : String(err),
    )
  }
}

/**
 * POST /api/sync/ga4
 *
 * Dispara o sync completo da GA4 Data API.
 *
 * Body (JSON):
 *   { platformAccountId?: string }  → conta específica
 *   { clientId?: string }           → todas as contas GA4 do cliente
 *   {}                              → todas as contas ativas (ADMIN / CRON only)
 *
 * Query params:
 *   since=YYYY-MM-DD  (opcional)
 *   until=YYYY-MM-DD  (opcional)
 *
 * Auth: session (ADMIN/MANAGER) ou header x-cron-secret
 */
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
    sessionRole = session.role
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

  const url = new URL(request.url)
  const since = url.searchParams.get('since') ?? undefined
  const until = url.searchParams.get('until') ?? undefined
  const options = { since, until }

  // ── Sync a specific platform account ──────────────────────────────────────
  if (platformAccountId) {
    if (!isCron && sessionRole !== 'ADMIN') {
      const account = await prisma.platformAccount.findUnique({
        where: { id: platformAccountId },
        select: { clientId: true },
      })
      if (!account) {
        return NextResponse.json({ error: 'Platform account not found' }, { status: 404 })
      }
      const assignment = await prisma.clientAssignment.findFirst({
        where: { clientId: account.clientId, userId: sessionUserId! },
      })
      if (!assignment) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const result = await syncGA4Account(platformAccountId, options)

    // GA4Sync embutido: resolve o clientId da conta e dispara o líquido junto.
    const owner = await prisma.platformAccount.findUnique({
      where: { id: platformAccountId },
      select: { clientId: true },
    })
    if (owner) await triggerGa4SyncEmbedded(owner.clientId)

    return NextResponse.json({ ok: true, results: [result] })
  }

  // ── Sync all GA4 accounts of a specific client ─────────────────────────────
  if (clientId) {
    if (!isCron && sessionRole !== 'ADMIN') {
      const assignment = await prisma.clientAssignment.findFirst({
        where: { clientId, userId: sessionUserId! },
      })
      if (!assignment) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const accounts = await prisma.platformAccount.findMany({
      where: { clientId, platform: 'GA4', active: true },
      select: { id: true },
    })

    const results = await Promise.all(accounts.map((a) => syncGA4Account(a.id, options)))

    // GA4Sync embutido: um clientId conhecido → dispara o líquido junto.
    await triggerGa4SyncEmbedded(clientId)

    return NextResponse.json({ ok: true, results })
  }

  // ── Sync ALL active GA4 accounts (admin/cron only) ─────────────────────────
  if (!isCron && sessionRole !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Forbidden: only admins can sync all accounts' },
      { status: 403 }
    )
  }

  const results = await syncAllGA4Accounts(options)
  return NextResponse.json({ ok: true, results })
}
