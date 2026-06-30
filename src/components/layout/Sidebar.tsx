'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Gauge,
  Sun,
  ShieldCheck,
  ListTodo,
  LayoutDashboard,
  CheckSquare,
  Users,
  UserPlus,
  BookOpen,
  ShieldAlert,
  BarChart3,
  Bot,
  Bell,
  PieChart,
  ChevronDown,
  ChevronRight,
  Activity,
  Building2,
  Kanban,
  BookMarked,
  TrendingUp,
  Target,
  Scale,
} from 'lucide-react'
import { useState } from 'react'

type Role = 'ADMIN' | 'MANAGER' | 'ANALYST' | 'CS'

type CountKey = 'meuDia' | 'abertas' | 'checkins' | 'validacoes' | 'warRooms' | 'alertas'

type NavItemDef = {
  name: string
  href: string
  icon: React.ElementType
  /** Which roles can see this item. Omit to show to all roles. */
  roles?: Role[]
  /** Pendency counter key (badge). */
  countKey?: CountKey
  /** Render the badge in alert color when > 0. */
  alert?: boolean
}

type NavSection = {
  label: string
  expandable?: boolean
  /** Which roles can see this entire section. Omit to show to all roles. */
  roles?: Role[]
  items: NavItemDef[]
}

const navigation: NavSection[] = [
  {
    label: 'PRINCIPAL',
    items: [
      { name: 'Meu Dia',         href: '/meu-dia',     icon: Sun,       countKey: 'meuDia', alert: true },
      { name: 'Central de Tarefas', href: '/operacional', icon: ListTodo, countKey: 'abertas' },
      { name: 'Cockpit',         href: '/cockpit',     icon: Gauge },
      { name: 'Dashboard',       href: '/dashboard',   icon: LayoutDashboard },
    ],
  },
  {
    label: 'ÁREAS',
    expandable: true,
    items: [
      { name: 'Check-ins da semana', href: '/check-ins',  icon: CheckSquare, countKey: 'checkins', alert: true },
      { name: 'Validação da CS',     href: '/validacoes', icon: ShieldCheck, countKey: 'validacoes', alert: true, roles: ['ADMIN' as Role, 'CS' as Role, 'MANAGER' as Role] },
      { name: 'Processos & POPs',    href: '/processos',  icon: Activity },
      { name: 'War Room',            href: '/anti-churn', icon: ShieldAlert, countKey: 'warRooms', alert: true },
      { name: 'Comercial',           href: '/comercial',  icon: Target },
      { name: 'Pipeline CRM',        href: '/pipeline',   icon: Kanban },
      { name: 'Financeiro',          href: '/financeiro', icon: TrendingUp, roles: ['ADMIN' as Role, 'CS' as Role] },
      { name: 'Onboarding',          href: '/clients/new', icon: UserPlus,  roles: ['ADMIN' as Role] },
    ],
  },
  {
    label: 'CLIENTES',
    items: [
      { name: 'Meus Clientes',        href: '/clients',    icon: Users },
      { name: 'Registro de Operações', href: '/operations', icon: BookOpen },
      { name: 'Relatórios',           href: '/reports',    icon: BarChart3 },
      { name: 'Alertas',              href: '/alerts',     icon: Bell, countKey: 'alertas', alert: true },
    ],
  },
  {
    label: 'INTELIGÊNCIA',
    items: [
      { name: 'Agentes IA',           href: '/ai-agents',  icon: Bot },
      { name: 'Base de Conhecimento', href: '/knowledge',  icon: BookMarked, roles: ['ADMIN' as Role] },
    ],
  },
  {
    label: 'VISÕES POR PAPEL',
    roles: ['ADMIN', 'CS'],
    items: [
      { name: 'Visão CEO',     href: '/agency',       icon: Building2, roles: ['ADMIN' as Role] },
      { name: 'Gestores',      href: '/managers',     icon: PieChart },
      { name: 'Metas Mensais', href: '/agency/metas', icon: Target,    roles: ['ADMIN' as Role] },
      { name: 'Equipe',        href: '/team',         icon: Users,     roles: ['ADMIN' as Role] },
      { name: 'Jurídico',      href: '/juridico',     icon: Scale,     roles: ['ADMIN' as Role] },
    ],
  },
]

function canSee(roles: Role[] | undefined, userRole: Role): boolean {
  return !roles || roles.includes(userRole)
}

type Counts = Partial<Record<CountKey, number>>

interface SidebarProps {
  role: Role
  counts?: Counts
}

export function Sidebar({ role, counts }: SidebarProps) {
  const pathname = usePathname()
  const [clientsOpen, setClientsOpen] = useState(true)

  return (
    <aside className="ak-sidebar w-60 flex-shrink-0 h-screen sticky top-0 bg-[#0A1E2C] border-r border-[#38435C] flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-[#38435C]">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M50 5L90 28V72L50 95L10 72V28L50 5Z" fill="none" stroke="#54e0ee" strokeWidth="6"/>
            <path d="M50 5L50 50M50 50L90 28M50 50L10 28" stroke="#54e0ee" strokeWidth="4"/>
            <path d="M50 50L50 95" stroke="#54e0ee" strokeWidth="4" strokeDasharray="6 4"/>
          </svg>
          <span className="font-bold text-[#EBEBEB] text-lg tracking-tight">
            Perform<span className="italic font-normal text-[#95BBE2]">li</span>
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {navigation
          .filter((section) => canSee(section.roles, role))
          .map((section) => {
            const visibleItems = section.items.filter((item) => canSee(item.roles, role))
            if (visibleItems.length === 0) return null

            return (
              <div key={section.label} className="mb-4">
                {section.expandable ? (
                  <>
                    <button
                      onClick={() => setClientsOpen(!clientsOpen)}
                      className="flex items-center justify-between w-full px-2 mb-1.5 group"
                    >
                      <span className="text-[10px] font-semibold text-[#87919E] tracking-widest uppercase group-hover:text-[#EBEBEB] transition-colors">
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
                        {visibleItems.map((item) => (
                          <NavItem key={item.href} item={item} pathname={pathname} counts={counts} />
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-[10px] font-semibold text-[#87919E] tracking-widest uppercase px-2 mb-1.5">
                      {section.label}
                    </p>
                    <div className="space-y-0.5">
                      {visibleItems.map((item) => (
                        <NavItem key={item.href} item={item} pathname={pathname} counts={counts} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-[#38435C]">
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="relative flex-shrink-0">
            <Activity size={14} className="text-[#22C55E]" />
          </div>
          <span className="text-xs text-[#87919E]">Sistema online</span>
          <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
        </div>
      </div>
    </aside>
  )
}

function NavItem({
  item,
  pathname,
  counts,
}: {
  item: NavItemDef
  pathname: string
  counts?: Counts
}) {
  const Icon = item.icon
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
  const count = item.countKey ? counts?.[item.countKey] ?? 0 : 0

  return (
    <Link
      href={item.href}
      prefetch
      className={cn(
        'group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200 ease-out active:scale-[0.98]',
        isActive
          ? 'bg-[#95BBE2]/15 text-[#95BBE2] font-semibold'
          : 'text-[#87919E] hover:bg-[#38435C]/50 hover:text-[#EBEBEB]'
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-gradient-to-b from-[#54e0ee] to-[#22c2d6] shadow-[0_0_10px_rgba(34,194,214,0.5)]" />
      )}
      <Icon size={16} className="flex-shrink-0" />
      <span className="truncate">{item.name}</span>
      {count > 0 && (
        <span
          className={cn(
            'ml-auto tabular text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 min-w-[18px] text-center',
            item.alert
              ? 'bg-[#EF4444]/16 text-[#EF4444]'
              : 'bg-[#38435C] text-[#87919E]'
          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
