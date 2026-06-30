export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getSidebarCounts } from '@/lib/dal'
import { DashboardShell } from '@/components/layout/DashboardShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const counts = await getSidebarCounts(session.userId, session.role)

  return (
    <DashboardShell session={session} counts={counts} unreadAlerts={counts.alertas}>
      {children}
    </DashboardShell>
  )
}
