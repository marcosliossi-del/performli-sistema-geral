import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recalculateClientHealth } from '@/services/health-scorer'
import { dispatchAlertsForClient } from '@/services/alert-dispatcher'
import { getSession } from '@/lib/session'

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
  const { clientId } = body as { clientId?: string }

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

  // Process each client
  const results: { clientId: string; created: number; updated: number; alerts: number }[] = []

  for (const id of clientIds) {
    const { created, updated, scores } = await recalculateClientHealth(id)
    const alerts = await dispatchAlertsForClient(id, scores)
    results.push({ clientId: id, created, updated, alerts })
  }

  const totals = results.reduce(
    (acc, r) => ({
      created: acc.created + r.created,
      updated: acc.updated + r.updated,
      alerts: acc.alerts + r.alerts,
    }),
    { created: 0, updated: 0, alerts: 0 }
  )

  return NextResponse.json({
    ok: true,
    clientsProcessed: clientIds.length,
    ...totals,
    results,
  })
}
