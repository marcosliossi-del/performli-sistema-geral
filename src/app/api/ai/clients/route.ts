import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { normalizeRole, scopeClients } from '@/lib/rbac'

/**
 * GET /api/ai/clients
 * Returns the list of clients accessible to the current user.
 * GESTOR_TRAFEGO: só clientes atribuídos (scopeClients); demais: todos ativos.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clients = await prisma.client.findMany({
    where: {
      status: 'ACTIVE',
      ...scopeClients(normalizeRole(session.role), session.userId),
    },
    select: { id: true, name: true, industry: true, slug: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(clients)
}
