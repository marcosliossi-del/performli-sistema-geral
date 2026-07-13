export const dynamic = 'force-dynamic'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getSidebarCounts } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import { homeForUser } from '@/lib/home'
import { assertPathAccess, getNavOverrides, serializeOverrides } from '@/lib/nav-access'
import { getNavTree, navTreeToNavLinks } from '@/lib/nav-tree'
import { DashboardShell } from '@/components/layout/DashboardShell'

export default async function DashboardLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  // Enforcement de ACESSO REAL da ACL de navegação por espaço (choke point).
  // O pathname vem do header `x-pathname` que o middleware SETA (sobrescreve)
  // em toda rota do matcher — o cliente não consegue forjá-lo. Header ausente
  // só ocorre fora do matcher (assets), que não renderiza este layout; se
  // ocorrer, seguimos sem ACL e registramos (QA D3: fragilidade documentada,
  // não explorável). ADMIN passa sempre (assertPathAccess trata internamente).
  const pathname = (await headers()).get('x-pathname') ?? ''
  if (!pathname) {
    console.error('[nav-access] x-pathname ausente — ACL de espaço não aplicada nesta request')
  }
  if (pathname && !(await assertPathAccess(session, pathname))) {
    // Path negado (inclusive /cockpit e /meu-dia, que também são espaços
    // configuráveis — QA D1): pousar no primeiro fixo PERMITIDO; se nada for
    // permitido, renderizar aviso em vez de redirecionar (evita loop).
    for (const candidate of ['/cockpit', '/meu-dia'] as const) {
      if (pathname !== candidate && (await assertPathAccess(session, candidate))) {
        redirect(candidate)
      }
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A1E2C] px-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-lg font-semibold text-[#EBEBEB]">Acesso restrito</h1>
          <p className="text-sm text-[#a3b2c2]">
            Seu acesso a esta área foi personalizado pelo administrador e esta
            página não está liberada para você. Fale com o administrador para
            revisar a sua lista de acesso.
          </p>
        </div>
      </div>
    )
  }

  const counts = await getSidebarCounts(session.userId, session.role)

  // Home do perfil (destino do logo). Sessões antigas sem operationalRole no
  // token: busca no banco para acertar o pouso.
  let operationalRole = session.operationalRole ?? null
  if (session.operationalRole === undefined) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { operationalRole: true },
    })
    operationalRole = user?.operationalRole ?? null
  }
  const homeHref = homeForUser(session.role, operationalRole)

  // Overrides da ACL de navegação por espaço, serializados para atravessar a
  // fronteira server→client (props). Só contém espaços em modo custom. O client
  // (Sidebar/CommandPalette) consome via `filterNavByOverrides`. A segurança
  // real do acesso vive no `assertPathAccess` acima — isto é só UX de menu.
  const navOverrides = serializeOverrides(await getNavOverrides(session.userId))

  // Árvore de navegação editável (GLOBAL, semeada na 1ª leitura). Serializada
  // via props para o client; `navTreeToNavLinks` já exclui ocultos p/ o ⌘K.
  const tree = await getNavTree()
  const navLinks = navTreeToNavLinks(tree)

  return (
    <DashboardShell session={session} counts={counts} unreadAlerts={counts.alertas} homeHref={homeHref} navOverrides={navOverrides} tree={tree} navLinks={navLinks} modal={modal}>
      {children}
    </DashboardShell>
  )
}
