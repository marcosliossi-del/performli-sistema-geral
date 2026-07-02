'use client'

import { Bell, Search, LogOut, ChevronDown, Settings } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { logout } from '@/app/actions/auth'
import type { SessionPayload } from '@/lib/session'
import { useState } from 'react'

interface TopNavProps {
  session: SessionPayload
  viewMode?: 'ADMIN' | 'GESTOR'
  onViewModeChange?: (mode: 'ADMIN' | 'GESTOR') => void
  unreadAlerts?: number
  onOpenSearch?: () => void
}

const roleLabels: Record<SessionPayload['role'], string> = {
  ADMIN:   'Admin',
  MANAGER: 'Gestor',
  ANALYST: 'Analista',
  CS:      'Succ. Clientes',
}

export function TopNav({ session, viewMode = 'ADMIN', onViewModeChange, unreadAlerts = 0, onOpenSearch }: TopNavProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const initials = session.name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()

  return (
    <header className="lg-topbar h-16 flex items-center justify-between px-6 bg-[#05141C] border-b border-[#38435C] sticky top-0 z-40">
      {/* Search — abre o command palette (⌘K) */}
      <div className="flex-1 max-w-[440px]">
        <button
          type="button"
          onClick={onOpenSearch}
          className="w-full flex items-center gap-2.5 h-9 px-3 rounded-[11px] bg-white/[0.05] border border-white/[0.09] hover:bg-white/[0.07] transition-colors text-left"
        >
          <Search size={14} className="text-[#647488] flex-shrink-0" />
          <span className="flex-1 min-w-0 truncate text-[12.5px] text-[#647488]">Buscar tarefas, clientes, POPs…</span>
          <kbd className="font-mono text-[10.5px] text-[#a3b2c2] bg-white/[0.08] rounded-md px-1.5 py-0.5 flex-shrink-0">⌘K</kbd>
        </button>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        {/* View Mode Toggle — only for ADMIN */}
        {onViewModeChange && (
          <div className="flex items-center bg-[#0A1E2C] border border-[#38435C] rounded-lg p-1">
            <button
              onClick={() => onViewModeChange('ADMIN')}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-semibold transition-all',
                viewMode === 'ADMIN'
                  ? 'bg-[#95BBE2] text-[#05141C]'
                  : 'text-[#87919E] hover:text-[#EBEBEB]'
              )}
            >
              ADMIN
            </button>
            <button
              onClick={() => onViewModeChange('GESTOR')}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-semibold transition-all',
                viewMode === 'GESTOR'
                  ? 'bg-[#95BBE2] text-[#05141C]'
                  : 'text-[#87919E] hover:text-[#EBEBEB]'
              )}
            >
              GESTOR
            </button>
          </div>
        )}

        {/* Alerts */}
        <Link
          href="/alerts"
          className="relative w-9 h-9 flex items-center justify-center rounded-lg text-[#87919E] hover:bg-[#38435C] transition-colors"
        >
          <Bell size={16} />
          {unreadAlerts > 0 && (
            <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-[#EF4444] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {unreadAlerts > 9 ? '9+' : unreadAlerts}
            </span>
          )}
        </Link>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-[#38435C] transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#54e0ee] to-[#0f7d8c] flex items-center justify-center text-[#021015] text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
              {initials}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-medium text-[#EBEBEB] leading-none">{session.name.split(' ')[0]}</p>
              <p className="text-[10px] text-[#87919E] mt-0.5">{roleLabels[session.role]}</p>
            </div>
            <ChevronDown size={12} className="text-[#87919E]" />
          </button>

          {userMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setUserMenuOpen(false)}
              />
              <div className="lg-glass absolute right-0 mt-2 w-48 bg-[#0A1E2C] border border-[#38435C] rounded-xl shadow-xl z-20 py-1 overflow-hidden">
                <div className="px-4 py-3 border-b border-[#38435C]">
                  <p className="text-sm font-medium text-[#EBEBEB] truncate">{session.name}</p>
                  <p className="text-xs text-[#87919E] truncate mt-0.5">{session.email}</p>
                </div>
                <Link
                  href="/settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-[#EBEBEB] hover:bg-[#38435C]/50 transition-colors"
                >
                  <Settings size={14} className="text-[#87919E]" />
                  Configurações
                </Link>
                <div className="border-t border-[#38435C] mt-1 pt-1">
                  <form action={logout}>
                    <button
                      type="submit"
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#EF4444] hover:bg-[#38435C]/50 transition-colors"
                    >
                      <LogOut size={14} />
                      Sair
                    </button>
                  </form>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
