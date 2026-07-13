'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { TopNav } from './TopNav'
import { CommandPalette } from './CommandPalette'
import { NavProvider, type ViewMode } from './nav-context'
import { ToastViewport } from '@/components/ui/ToastViewport'
import type { SessionPayload } from '@/lib/session'
import type { SidebarCounts } from '@/lib/dal'
import type { NavTree, NavLink } from '@/lib/nav-tree-shared'

interface DashboardShellProps {
  children: React.ReactNode
  session: SessionPayload
  unreadAlerts: number
  counts?: SidebarCounts
  /** Destino do logo — home do perfil (pouso). */
  homeHref: string
  /**
   * Overrides da ACL de navegação por espaço (Record<spaceKey, boolean>), só com
   * espaços em modo custom. Repassado a Sidebar e CommandPalette para filtrar a
   * navegação client-side via `filterNavByOverrides`. Vazio p/ quem não tem
   * espaço custom aplicável.
   */
  navOverrides?: Record<string, boolean>
  /** Árvore de navegação editável (serializada do servidor por getNavTree). */
  tree: NavTree
  /** Links planos (só LEAF visível) derivados da árvore — consumidos pelo ⌘K. */
  navLinks: NavLink[]
  /** Slot do parallel route @modal (painel slide-over da task, D-009). */
  modal?: React.ReactNode
}

export function DashboardShell({ children, session, unreadAlerts, counts, homeHref, navOverrides, tree, navLinks, modal }: DashboardShellProps) {
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
    <NavProvider value={{ role: session.role, viewMode, mobileOpen, setMobileOpen }}>
      <div className="ak-app-bg flex h-screen overflow-hidden bg-[#05141C] print:block print:h-auto print:bg-white">
        {/* Sidebar desktop — fixa a partir de lg. Escondida no mobile (vira drawer). */}
        <div className="hidden lg:block print:hidden">
          <Sidebar role={session.role} counts={counts} homeHref={homeHref} navOverrides={navOverrides} tree={tree} />
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
              <Sidebar role={session.role} counts={counts} homeHref={homeHref} navOverrides={navOverrides} tree={tree} />
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
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} role={session.role} navOverrides={navOverrides} navLinks={navLinks} />
        <ToastViewport />
        {/* Slot @modal: slide-over da task sobre a view (fixed, não desloca layout). */}
        {modal}
      </div>
    </NavProvider>
  )
}
