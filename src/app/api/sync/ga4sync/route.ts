import { NextRequest, NextResponse } from 'next/server'
import { syncGa4SyncAccount, syncAllGa4SyncAccounts } from '@/services/ga4sync/sync'
import { getSession } from '@/lib/session'
import { isCronAuthorized } from '@/lib/cron-auth'
import { z } from 'zod'

const bodySchema = z.object({
  clientId: z.string().optional(),
})

/**
 * POST /api/sync/ga4sync
 *
 * Dispara o sync manual da API GA4Sync (receita AUTORITATIVA da loja — desde a
 * fatia das métricas líquidas, grava também netRevenue/newCustomers). Criado no
 * caso My Muse 2026-07-22: o GA4Sync só rodava dentro do cron diário e não havia
 * como reprocessar o mês após o deploy do líquido.
 *
 * Body (JSON):
 *   { clientId?: string }  → uma loja específica
 *   {}                     → todas as lojas configuradas (ADMIN / CRON only)
 *
 * Auth: session ADMIN/MANAGER ou header x-cron-secret (mesmo padrão de /api/sync/ga4).
 */
export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get('x-cron-secret')
  let authorized = false

  if (cronSecret) {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    authorized = true
  } else {
    const session = await getSession()
    if (!session || !['ADMIN', 'MANAGER'].includes(session.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    authorized = true
  }
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    // corpo vazio = sync geral
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  try {
    if (parsed.data.clientId) {
      const result = await syncGa4SyncAccount(parsed.data.clientId)
      return NextResponse.json({ ok: result.status !== 'FAILED', result })
    }
    const all = await syncAllGa4SyncAccounts()
    return NextResponse.json({ ok: true, ...all })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
