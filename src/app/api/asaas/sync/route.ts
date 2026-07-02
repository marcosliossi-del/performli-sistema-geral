import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { syncAsaasData } from '@/services/asaas/sync'

/**
 * POST /api/asaas/sync
 * Manual trigger for Asaas data sync. ADMIN only.
 */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncAsaasData()
    return NextResponse.json({ ok: true, ...result, partialErrors: result.errors.length ? result.errors : undefined })
  } catch (err) {
    console.error('[asaas/sync]', err)
    return NextResponse.json({ ok: false, error: 'Não foi possível sincronizar os dados do Asaas agora. Tente novamente.' }, { status: 500 })
  }
}
