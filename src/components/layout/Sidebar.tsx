'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  UserPlus,
  BookOpen,
  ShieldAlert,
  BarChart3,
  Bot,
  Bell,
  UsersRound,
  ChevronDown,
  ChevronRight,
  PieChart,
} from 'lucide-react'
import { useState } from 'react'

const navigation = [
  {
    label: 'MENU PRINCIPAL',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { name: 'Alertas', href: '/alerts', icon: Bell },
      { name: 'Minhas Tarefas', href: '/tasks', icon: CheckSquare },
    ],
  },
  {
    label: 'CLIENTES',
    expandable: true,
    items: [
      { name: 'Meus Clientes', href: '/clients', icon: Users },
      { name: 'Novo Onboarding', href: '/clients/new', icon: UserPlus },
      { name: 'Registro de Operações', href: '/operations', icon: BookOpen },
      { name: 'Anti Churn & Retenção', href: '/anti-churn', icon: ShieldAlert },
      { name: 'Relatórios', href: '/reports', icon: BarChart3 },
    ],
  },
  {
    label: 'IA',
    items: [
      { name: 'Agentes IA Suporte', href: '/ai-agents', icon: Bot },
    ],
  },
  {
    label: 'AGÊNCIA',
    items: [
      { name: 'Gestores', href: '/managers', icon: PieChart },
      { name: 'Equipe', href: '/team', icon: Users },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const [clientsOpen, setClientsOpen] = useState(true)

  return (
    <aside className="w-60 flex-shrink-0 h-screen sticky top-0 bg-[#0A1E2C] border-r border-[#38435C] flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-[#38435C]">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          {/* Performli P-box SVG */}
          <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M50 5L90 28V72L50 95L10 72V28L50 5Z" fill="none" stroke="#95BBE2" strokeWidth="6"/>
            <path d="M50 5L50 50M50 50L90 28M50 50L10 28" stroke="#95BBE2" strokeWidth="4"/>
            <path d="M50 50L50 95" stroke="#95BBE2" strokeWidth="4" strokeDasharray="6 4"/>
          </svg>
          <span className="font-bold text-[#EBEBEB] text-lg tracking-tight">
            Perform<span className="italic font-normal text-[#95BBE2]">li</span>
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {navigation.map((section) => (
          <div key={section.label} className="mb-5">
            {section.label === 'CLIENTES' ? (
              <>
                <button
                  onClick={() => setClientsOpen(!clientsOpen)}
                  className="flex items-center justify-between w-full px-2 mb-1"
                >
                  <span className="text-[10px] font-semibold text-[#87919E] tracking-widest uppercase">
                    {section.label}
                  </span>
                  {clientsOpen ? (
                    <ChevronDown size={12} className="text-[#87919E]" />
                  ) : (
                    <ChevronRight size={12} className="text-[#87919E]" />
                  )}
                </button>
                {clientsOpen && (
                  <div className="space-y-0.5">
                    {section.items.map((item) => (
                      <NavItem key={item.href} item={item} pathname={pathname} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-[10px] font-semibold text-[#87919E] tracking-widest uppercase px-2 mb-1">
                  {section.label}
                </p>
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavItem key={item.href} item={item} pathname={pathname} />
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-[#38435C]">
        <div className="flex items-center gap-2 px-2">
          <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
          <span className="text-xs text-[#87919E]">Sistema online</span>
        </div>
      </div>
    </aside>
  )
}

function NavItem({
  item,
  pathname,
}: {
  item: { name: string; href: string; icon: React.ElementType }
  pathname: string
}) {
  const Icon = item.icon
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150',
        isActive
          ? 'bg-[#95BBE2]/15 text-[#95BBE2] font-medium'
          : 'text-[#87919E] hover:bg-[#38435C]/50 hover:text-[#EBEBEB]'
      )}
    >
      <Icon size={16} className="flex-shrink-0" />
      {item.name}
    </Link>
  )
}
