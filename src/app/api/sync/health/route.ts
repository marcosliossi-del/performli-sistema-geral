import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { recalculateClientHealth } from '@/services/health-scorer'
import { runResultadoUpdate } from '@/services/resultado-engine'
import { dispatchAlertsForClient } from '@/services/alert-dispatcher'
import { getSession } from '@/lib/session'
import { z } from 'zod'

// Permissivo: clientId opcional (corpo vazio {} = recalcula todos, ADMIN/CRON).
const bodySchema = z.object({
  clientId: z.string().optional(),
  /** ADMIN/CRON, sem clientId: também roda o Resultado semanal (engine). */
  recalcResultado: z.boolean().optional(),
})

/**
 * POST /api/sync/health
 *
 * Recalcula HealthScores e dispara alertas.
 *
 * Body:
 *   { clientId?: string }   → específico, ou todos se omitido (ADMIN only)
 *
 * Autenticação:
 *   - MANAGER: só pode recalcular seus próprios clientes
 *   - ADMIN: pode recalcular qualquer cliente (ou todos)
 *   - CRON: header x-cron-secret para jobs automatizados
 */
export async function POST(request: NextRequest) {
  // Auth: session OR cron secret
  const cronSecret = request.headers.get('x-cron-secret')
  let isCron = false
  let sessionRole: string | null = null
  let sessionUserId: string | null = null

  if (cronSecret) {
    if (cronSecret !== process.env.CRON_SECRET) {
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
      { error: 'Corpo inválido: clientId, quando presente, deve ser texto.' },
      { status: 400 },
    )
  }
  const { clientId, recalcResultado } = parsed.data

  // Determine which clients to process
  let clientIds: string[]

  if (clientId) {
    // Verify access for non-admin users
    if (!isCron && sessionRole !== 'ADMIN') {
      const assignment = await prisma.clientAssignment.findFirst({
        where: { clientId, userId: sessionUserId! },
      })
      if (!assignment) {
        return NextResponse.json({ error: 'Forbidden: client not assigned to you' }, { status: 403 })
      }
    }
    clientIds = [clientId]
  } else {
    // All active clients (admin or cron only)
    if (!isCron && sessionRole !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: only admins can sync all clients' }, { status: 403 })
    }
    const clients = await prisma.client.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    })
    clientIds = clients.map((c) => c.id)
  }

  // Process clients in parallel batches of 5 to avoid DB overload
  const BATCH = 5
  const results: { clientId: string; created: number; updated: number; alerts: number }[] = []

  for (let i = 0; i < clientIds.length; i += BATCH) {
    const batch = clientIds.slice(i, i + BATCH)
    const batchResults = await Promise.allSettled(
      batch.map(async (id) => {
        const { created, updated, scores } = await recalculateClientHealth(id)
        const alerts = await dispatchAlertsForClient(id, scores)
        return { clientId: id, created, updated, alerts }
      })
    )
    for (const r of batchResults) {
      if (r.status === 'fulfilled') results.push(r.value)
      else results.push({ clientId: '', created: 0, updated: 0, alerts: 0 })
    }
  }

  const totals = results.reduce(
    (acc, r) => ({
      created: acc.created + r.created,
      updated: acc.updated + r.updated,
      alerts: acc.alerts + r.alerts,
    }),
    { created: 0, updated: 0, alerts: 0 }
  )

  // Resultado semanal (engine) — só no recálculo GERAL por ADMIN/CRON. force:
  // reprocessa mesmo se já rodou na semana (botão "Recalcular saúde (todos)").
  let resultado: { ok: boolean; error?: string } | null = null
  if (recalcResultado && !clientId && (isCron || sessionRole === 'ADMIN')) {
    try {
      await runResultadoUpdate({ force: true })
      resultado = { ok: true }
    } catch (err) {
      resultado = { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // Invalidate Next.js page cache so the cockpit reloads with fresh health scores
  revalidatePath('/cockpit', 'page')
  revalidatePath('/clients', 'page')

  return NextResponse.json({
    ok: true,
    clientsProcessed: clientIds.length,
    ...totals,
    resultado,
    results,
  })
}
