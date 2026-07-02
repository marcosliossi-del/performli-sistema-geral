'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { TopNav } from './TopNav'
import { CommandPalette } from './CommandPalette'
import { NavProvider, type ViewMode } from './nav-context'
import { ToastViewport } from '@/components/ui/ToastViewport'
import type { SessionPayload } from '@/lib/session'
import type { SidebarCounts } from '@/lib/dal'

interface DashboardShellProps {
  children: React.ReactNode
  session: SessionPayload
  unreadAlerts: number
  counts?: SidebarCounts
  /** Destino do logo — home do perfil (pouso). */
  homeHref: string
  /** Slot do parallel route @modal (painel slide-over da task, D-009). */
  modal?: React.ReactNode
}

export function DashboardShell({ children, session, unreadAlerts, counts, homeHref, modal }: DashboardShellProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(
    session.role === 'ADMIN' ? 'ADMIN' : 'GESTOR'
  )
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

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
    <NavProvider value={{ viewMode, mobileOpen, setMobileOpen }}>
      <div className="ak-app-bg flex h-screen overflow-hidden bg-[#05141C] print:block print:h-auto print:bg-white">
        {/* Sidebar desktop — fixa a partir de lg. Escondida no mobile (vira drawer). */}
        <div className="hidden lg:block print:hidden">
          <Sidebar role={session.role} counts={counts} homeHref={homeHref} />
        </div>

        {/* Sidebar mobile — drawer sobreposto (abaixo de lg). */}
        {mobileOpen && (
          <>
            <div
              className="lg-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden print:hidden"
              onClick={() => setMobileOpen(false)}
              aria-hidden
            />
            <div className="fixed inset-y-0 left-0 z-50 lg:hidden print:hidden">
              <Sidebar role={session.role} counts={counts} homeHref={homeHref} />
            </div>
          </>
        )}

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:block print:overflow-visible">
          <div className="print:hidden">
            <TopNav
              session={session}
              viewMode={viewMode}
              onViewModeChange={session.role === 'ADMIN' ? setViewMode : undefined}
              unreadAlerts={unreadAlerts}
              onOpenSearch={() => setPaletteOpen(true)}
              onOpenMobileNav={() => setMobileOpen(true)}
            />
          </div>
          <main className="flex-1 overflow-y-auto p-6 print:overflow-visible print:p-4">{children}</main>
        </div>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        <ToastViewport />
        {/* Slot @modal: slide-over da task sobre a view (fixed, não desloca layout). */}
        {modal}
      </div>
    </NavProvider>
  )
}
