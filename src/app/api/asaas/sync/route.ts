import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { syncAsaasData } from '@/services/asaas/sync'

/**
 * POST /api/asaas/sync
 * Manual trigger for Asaas data sync. ADMIN only.
 */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncAsaasData()
    const ok = result.customers > 0 || result.payments > 0 || result.subscriptions > 0
    return NextResponse.json({ ok: true, ...result, partialErrors: result.errors.length ? result.errors : undefined })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
