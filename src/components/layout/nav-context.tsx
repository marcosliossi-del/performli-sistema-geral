'use client'

import { createContext, useContext } from 'react'

export type ViewMode = 'ADMIN' | 'GESTOR'

type NavContextValue = {
  /** Prévia de navegação escolhida no TopNav (só afeta a UI, não o RBAC real). */
  viewMode: ViewMode
  /** Drawer da sidebar no mobile (abaixo de lg). */
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
}

const NavContext = createContext<NavContextValue | null>(null)

export function NavProvider({
  value,
  children,
}: {
  value: NavContextValue
  children: React.ReactNode
}) {
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>
}

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext)
  if (!ctx) throw new Error('useNav deve ser usado dentro de NavProvider')
  return ctx
}
