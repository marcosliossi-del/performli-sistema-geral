import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { DashboardShell } from '@/components/layout/DashboardShell'

async function getUnreadAlertCount(userId: string, role: string): Promise<number> {
  const isViewAll = role === 'ADMIN' || role === 'CS'
  const where =
    isViewAll
      ? { read: false }
      : { read: false, client: { assignments: { some: { userId } } } }

  return prisma.alert.count({ where })
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const unreadAlerts = await getUnreadAlertCount(session.userId, session.role)

  return <DashboardShell session={session} unreadAlerts={unreadAlerts}>{children}</DashboardShell>
}
