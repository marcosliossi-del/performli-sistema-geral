'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { TopNav } from './TopNav'
import type { SessionPayload } from '@/lib/session'

interface DashboardShellProps {
  children: React.ReactNode
  session: SessionPayload
  unreadAlerts: number
}

export function DashboardShell({ children, session, unreadAlerts }: DashboardShellProps) {
  const [viewMode, setViewMode] = useState<'ADMIN' | 'GESTOR'>(
    session.role === 'ADMIN' ? 'ADMIN' : 'GESTOR'
  )

  return (
    <div className="ak-app-bg flex h-screen overflow-hidden bg-[#05141C] print:block print:h-auto print:bg-white">
      <div className="print:hidden">
        <Sidebar role={session.role} />
      </div>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:block print:overflow-visible">
        <div className="print:hidden">
          <TopNav
            session={session}
            viewMode={viewMode}
            onViewModeChange={session.role === 'ADMIN' ? setViewMode : undefined}
            unreadAlerts={unreadAlerts}
          />
        </div>
        <main className="flex-1 overflow-y-auto p-6 print:overflow-visible print:p-4">{children}</main>
      </div>
    </div>
  )
}
