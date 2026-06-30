import { NextRequest, NextResponse } from 'next/server'
import { runTaskRecurrences } from '@/services/recurrence-engine'

/**
 * /api/cron/recurrences — gera tarefas recorrentes a partir dos templates.
 * Idempotente (chave template+cliente+janela). Auth via CRON_SECRET.
 * `?force=1` (com auth) ignora a checagem de dia — útil para testar a geração.
 */

function isAuthorized(request: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret) return false
  const authHeader = request.headers.get('authorization')
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const customSecret = request.headers.get('x-cron-secret')
  return (bearerSecret ?? customSecret) === expectedSecret
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const force = new URL(request.url).searchParams.get('force') === '1'
  try {
    const result = await runTaskRecurrences({ force })
    return NextResponse.json({ ok: true, force, ...result })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
