'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { TopNav } from './TopNav'
import { CommandPalette } from './CommandPalette'
import { ToastViewport } from '@/components/ui/ToastViewport'
import type { SessionPayload } from '@/lib/session'
import type { SidebarCounts } from '@/lib/dal'

interface DashboardShellProps {
  children: React.ReactNode
  session: SessionPayload
  unreadAlerts: number
  counts?: SidebarCounts
}

export function DashboardShell({ children, session, unreadAlerts, counts }: DashboardShellProps) {
  const [viewMode, setViewMode] = useState<'ADMIN' | 'GESTOR'>(
    session.role === 'ADMIN' ? 'ADMIN' : 'GESTOR'
  )
  const [paletteOpen, setPaletteOpen] = useState(false)

  // ⌘K / Ctrl+K abre a busca global de qualquer tela.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="ak-app-bg flex h-screen overflow-hidden bg-[#05141C] print:block print:h-auto print:bg-white">
      <div className="print:hidden">
        <Sidebar role={session.role} counts={counts} />
      </div>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:block print:overflow-visible">
        <div className="print:hidden">
          <TopNav
            session={session}
            viewMode={viewMode}
            onViewModeChange={session.role === 'ADMIN' ? setViewMode : undefined}
            unreadAlerts={unreadAlerts}
            onOpenSearch={() => setPaletteOpen(true)}
          />
        </div>
        <main className="flex-1 overflow-y-auto p-6 print:overflow-visible print:p-4">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ToastViewport />
    </div>
  )
}
