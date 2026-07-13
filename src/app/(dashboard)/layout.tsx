export const dynamic = 'force-dynamic'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getSidebarCounts } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import { homeForUser } from '@/lib/home'
import { assertPathAccess } from '@/lib/nav-access'
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
  // O pathname vem do header `x-pathname` propagado pelo middleware (o edge não
  // tem Prisma). Se algum espaço custom do path bloqueia o usuário → /cockpit.
  // ADMIN passa sempre (assertPathAccess trata internamente).
  const pathname = (await headers()).get('x-pathname') ?? ''
  const FALLBACK = '/cockpit'
  if (pathname && pathname !== FALLBACK && !(await assertPathAccess(session, pathname))) {
    redirect(FALLBACK)
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

  return (
    <DashboardShell session={session} counts={counts} unreadAlerts={counts.alertas} homeHref={homeHref} modal={modal}>
      {children}
    </DashboardShell>
  )
}
