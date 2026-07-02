'use server'

import { requireSession } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { normalizeRole } from '@/lib/rbac'

export type SearchResult = {
  tasks: { id: string; title: string; clientSlug: string | null; status: string }[]
  clients: { id: string; name: string; slug: string }[]
  pops: { id: string; code: string; name: string }[]
}

// Staff amplo (ADMIN/CS/SUPERVISOR/ANALISTA) busca em tudo; só GESTOR fica
// restrito à carteira (delegado ao engine — scopeClients equivalente).
function canViewAll(role: string): boolean {
  return normalizeRole(role) !== 'GESTOR_TRAFEGO'
}

/**
 * Busca global do command palette (⌘K). Role-scoped: tarefas e clientes seguem
 * a posse; POPs são catálogo público. Mínimo de 2 caracteres.
 */
export async function globalSearch(q: string): Promise<SearchResult> {
  const { userId, role } = await requireSession()
  const term = q.trim()
  if (term.length < 2) return { tasks: [], clients: [], pops: [] }

  const viewAll = canViewAll(role)
  const taskScope: Prisma.TaskWhereInput = viewAll
    ? {}
    : { OR: [{ assignedTo: userId }, { client: { assignments: { some: { userId } } } }] }
  const clientScope: Prisma.ClientWhereInput = viewAll ? {} : { assignments: { some: { userId } } }

  const [tasks, clients, pops] = await Promise.all([
    prisma.task.findMany({
      where: { AND: [taskScope, { title: { contains: term, mode: 'insensitive' } }] },
      take: 6,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, status: true, client: { select: { slug: true } } },
    }),
    prisma.client.findMany({
      where: { AND: [clientScope, { name: { contains: term, mode: 'insensitive' } }] },
      take: 6,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true },
    }),
    prisma.pOPProcess.findMany({
      where: { OR: [{ code: { contains: term, mode: 'insensitive' } }, { name: { contains: term, mode: 'insensitive' } }] },
      take: 6,
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true },
    }),
  ])

  return {
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, clientSlug: t.client?.slug ?? null })),
    clients,
    pops,
  }
}
