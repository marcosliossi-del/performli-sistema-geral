import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isCronAuthorized } from '@/lib/cron-auth'
import { recordCronHeartbeat } from '@/lib/cron-heartbeat'
import { processChannelEvent } from '@/services/conversas/ingest'

/**
 * GET /api/cron/conversas — drenagem do outbox de Conversas (decisão R1).
 *
 * Roda a cada 1 minuto (vercel.json). Pega os ChannelEvents mais antigos
 * PENDING ou FAILED (com attempts < 5), processa em SÉRIE com try/catch por
 * evento (falha de um não derruba a rotina — regra #7) e registra heartbeat
 * (regra #9). Fail-closed no guard de cron (timing-safe).
 */

const BATCH_LIMIT = 50
const MAX_ATTEMPTS = 5

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const summary = { processed: 0, failed: 0, dead: 0 }

  try {
    const events = await prisma.channelEvent.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        attempts: { lt: MAX_ATTEMPTS },
      },
      orderBy: { receivedAt: 'asc' },
      take: BATCH_LIMIT,
      select: { id: true, channelId: true, payload: true, attempts: true },
    })

    for (const event of events) {
      try {
        const result = await processChannelEvent(event)
        if (result.ok) summary.processed += 1
        else if (result.dead) summary.dead += 1
        else summary.failed += 1
      } catch (err) {
        // processChannelEvent não deveria lançar; blindagem extra por evento.
        summary.failed += 1
        console.error(`[cron/conversas] evento ${event.id} lançou inesperadamente:`, err)
      }
    }

    await recordCronHeartbeat('CONVERSAS') // regra #9 — nunca lança
    return NextResponse.json({ ok: true, ...summary })
  } catch (err) {
    console.error('[cron/conversas] falha na drenagem do outbox:', err)
    return NextResponse.json({ ok: false, error: 'Falha ao drenar a fila de conversas.' }, { status: 500 })
  }
}

// Permite disparo manual para teste (mesmo guard de cron).
export async function POST(request: NextRequest) {
  return GET(request)
}
