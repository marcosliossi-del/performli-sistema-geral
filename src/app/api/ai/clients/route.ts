import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/ai/clients
 * Returns the list of clients accessible to the current user.
 * MANAGER/ANALYST: only their assigned clients.
 * CS/ADMIN: all active clients.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const restrictToAssigned = session.role === 'MANAGER' || session.role === 'ANALYST'

  const clients = await prisma.client.findMany({
    where: {
      status: 'ACTIVE',
      ...(restrictToAssigned
        ? { assignments: { some: { userId: session.userId } } }
        : {}),
    },
    select: { id: true, name: true, industry: true, slug: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(clients)
}
