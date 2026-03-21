'use client'

import { Bell, Sun, Search, LogOut, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface TopNavProps {
  viewMode?: 'ADMIN' | 'GESTOR'
  onViewModeChange?: (mode: 'ADMIN' | 'GESTOR') => void
  unreadAlerts?: number
}

export function TopNav({ viewMode = 'ADMIN', onViewModeChange, unreadAlerts = 0 }: TopNavProps) {
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <header className="h-16 flex items-center justify-between px-6 bg-[#05141C] border-b border-[#38435C] sticky top-0 z-40">
      {/* Search */}
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#87919E]" />
          <input
            type="text"
            placeholder="Buscar clientes, documentos..."
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2] transition-colors"
          />
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        {/* View Mode Toggle */}
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

        {/* Theme toggle (placeholder) */}
        <button className="w-9 h-9 flex items-center justify-center rounded-lg text-[#87919E] hover:bg-[#38435C] transition-colors">
          <Sun size={16} />
        </button>

        {/* Alerts */}
        <button className="relative w-9 h-9 flex items-center justify-center rounded-lg text-[#87919E] hover:bg-[#38435C] transition-colors">
          <Bell size={16} />
          {unreadAlerts > 0 && (
            <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-[#EF4444] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {unreadAlerts > 9 ? '9+' : unreadAlerts}
            </span>
          )}
        </button>

        {/* User avatar */}
        <button className="w-9 h-9 flex items-center justify-center rounded-full bg-[#38435C] text-[#95BBE2] hover:bg-[#2D3A4D] transition-colors">
          <User size={16} />
        </button>
      </div>
    </header>
  )
}
