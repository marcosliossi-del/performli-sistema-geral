import { NextRequest, NextResponse } from 'next/server'
import { runResultadoUpdate } from '@/services/resultado-engine'
import { isCronAuthorized } from '@/lib/cron-auth'

/**
 * /api/cron/resultados — atualiza o Resultado semanal (ROAS/GA4) dos clientes
 * ecommerce e deriva a Etapa. Roda toda segunda-feira sobre a última semana
 * fechada (domingo a sábado). Idempotente por janela. Auth via CRON_SECRET.
 * `?force=1` recalcula mesmo que a janela já tenha sido processada.
 */

function isAuthorized(request: NextRequest): boolean {
  return isCronAuthorized(request) // comparação timing-safe compartilhada
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const force = new URL(request.url).searchParams.get('force') === '1'
  try {
    const result = await runResultadoUpdate({ force })
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
