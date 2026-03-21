'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { TopNav } from './TopNav'
import type { SessionPayload } from '@/lib/session'

interface DashboardShellProps {
  children: React.ReactNode
  session: SessionPayload
}

export function DashboardShell({ children, session }: DashboardShellProps) {
  const [viewMode, setViewMode] = useState<'ADMIN' | 'GESTOR'>(
    session.role === 'ADMIN' ? 'ADMIN' : 'GESTOR'
  )

  return (
    <div className="flex h-screen overflow-hidden bg-[#05141C]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNav
          session={session}
          viewMode={viewMode}
          onViewModeChange={session.role === 'ADMIN' ? setViewMode : undefined}
          unreadAlerts={3}
        />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
