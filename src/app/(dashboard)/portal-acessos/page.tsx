import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import { KeyRound } from 'lucide-react'
import { PortalAcessosManager } from '@/components/portal-admin/PortalAcessosManager'
import { hasSpaceGrant } from '@/lib/nav-access'

export const dynamic = 'force-dynamic'

/**
 * Gestão ADMIN dos acessos do portal do cliente (lojista). Segue o padrão de
 * configuração do repo: só ADMIN. A segurança real está nas actions do backend;
 * aqui o guard melhora a UX (não renderiza a tela para quem não pode).
 */
export default async function PortalAcessosPage() {
  const session = await requireSession()
  // Guard de papel + grant de espaço (lista personalizada 'dá' acesso — QA D2)
  if (session.role !== 'ADMIN' && !(await hasSpaceGrant(session.userId, 'clientes.portal-acessos'))) redirect('/')

  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      razaoSocial: true,
      // relation 'portalUsers' — model ClientPortalUser (criado em paralelo)
      portalUsers: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          email: true,
          name: true,
          active: true,
          lastLoginAt: true,
        },
      },
    },
  })

  const data = clients.map((c) => ({
    id: c.id,
    name: c.name,
    razaoSocial: c.razaoSocial ?? null,
    users: c.portalUsers.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      active: u.active,
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    })),
  }))

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-2.5">
        <KeyRound size={18} className="text-[#95BBE2]" />
        <div>
          <h1 className="text-2xl font-bold text-[#EBEBEB]">Acessos do Portal</h1>
          <p className="mt-0.5 text-sm text-[#87919E]">
            Libere e gerencie o acesso dos clientes ao painel de resultados.
          </p>
        </div>
      </div>

      <PortalAcessosManager clients={data} />
    </div>
  )
}
