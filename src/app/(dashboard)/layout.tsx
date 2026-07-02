export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getSidebarCounts } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import { homeForUser } from '@/lib/home'
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
