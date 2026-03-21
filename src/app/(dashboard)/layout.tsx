'use client'

import { Sidebar } from '@/components/layout/Sidebar'
import { TopNav } from '@/components/layout/TopNav'
import { useState } from 'react'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [viewMode, setViewMode] = useState<'ADMIN' | 'GESTOR'>('ADMIN')

  return (
    <div className="flex h-screen overflow-hidden bg-[#05141C]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNav
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          unreadAlerts={3}
        />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
