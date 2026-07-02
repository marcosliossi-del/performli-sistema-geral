import { NextRequest, NextResponse } from 'next/server'
import { runTaskRecurrences } from '@/services/recurrence-engine'
import { runScheduledTaskRecurrences } from '@/services/task-schedule-recurrence'

/**
 * /api/cron/recurrences — cron DEDICADO de recorrências (audit §3). Cobre DOIS
 * motores independentes (D-010), cada um com seu try/catch e AutomationLog:
 *  1. templates por cliente (TaskRecurrenceRule) — runTaskRecurrences;
 *  2. regra individual por task, modo 'schedule' (D-010) — runScheduledTaskRecurrences.
 * Ambos idempotentes. Auth via CRON_SECRET. `?force=1` afeta só os templates
 * (o schedule é sempre por data — rodar 3× no mesmo dia = zero duplicata).
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
    // Motor 1: templates por cliente. Motor 2: schedule por task (D-010).
    // Isolados: falha no schedule não derruba os templates e vice-versa.
    // Campos dos templates ficam no topo (contrato preexistente preservado);
    // o schedule entra como bloco novo `scheduled`.
    const result = await runTaskRecurrences({ force })

    let scheduled: Awaited<ReturnType<typeof runScheduledTaskRecurrences>> | { error: string }
    try {
      scheduled = await runScheduledTaskRecurrences()
    } catch (err) {
      scheduled = { error: err instanceof Error ? err.message : String(err) }
    }

    return NextResponse.json({ ok: true, force, ...result, scheduled })
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
