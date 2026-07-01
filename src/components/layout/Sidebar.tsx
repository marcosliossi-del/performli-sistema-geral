'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Gauge,
  Sun,
  ShieldCheck,
  CalendarRange,
  FileText,
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
  /** Sub-itens aninhados (nav-tree) — item vira expansível. */
  children?: NavItemDef[]
}

type NavSection = {
  label: string
  /** Which roles can see this entire section. Omit to show to all roles. */
  roles?: Role[]
  items: NavItemDef[]
}

// Estrutura espelhada do protótipo iOS: atalhos no topo · ÁREAS (com sub-menus
// aninhados / nav-tree) · Visões por papel · Inteligência.
const navigation: NavSection[] = [
  {
    label: '',
    items: [
      { name: 'Meu Dia',            href: '/meu-dia',      icon: Sun,          countKey: 'meuDia', alert: true },
      { name: 'Minha Semana',       href: '/minha-semana', icon: CalendarRange },
      { name: 'Central de Tarefas', href: '/operacional',  icon: ListTodo,     countKey: 'abertas' },
      { name: 'Cockpit',            href: '/cockpit',      icon: Gauge },
      { name: 'Aceite Operacional', href: '/aceite',       icon: ShieldCheck,  roles: ['ADMIN' as Role, 'CS' as Role, 'MANAGER' as Role] },
    ],
  },
  {
    label: 'ÁREAS',
    items: [
      {
        name: 'Tráfego', href: '/operacional', icon: Activity, countKey: 'abertas',
        children: [
          { name: 'Check-ins da semana',  href: '/check-ins',  icon: CheckSquare, countKey: 'checkins', alert: true },
          { name: 'Prestações de contas', href: '/operacional', icon: FileText },
          { name: 'Processos & POPs',     href: '/processos',  icon: BookOpen },
        ],
      },
      {
        name: 'Sucesso do Cliente', href: '/clients', icon: Users,
        children: [
          { name: 'Meus Clientes',   href: '/clients',    icon: Users },
          { name: 'Validação da CS', href: '/validacoes', icon: ShieldCheck, countKey: 'validacoes', alert: true, roles: ['ADMIN' as Role, 'CS' as Role, 'MANAGER' as Role] },
          { name: 'Relatórios',      href: '/reports',    icon: BarChart3 },
        ],
      },
      { name: 'War Room', href: '/anti-churn', icon: ShieldAlert, countKey: 'warRooms', alert: true },
      {
        name: 'Comercial', href: '/comercial', icon: Target,
        children: [
          { name: 'Pipeline CRM',  href: '/pipeline',  icon: Kanban },
          { name: 'CRM Comercial', href: '/comercial', icon: Target },
        ],
      },
      {
        name: 'Financeiro', href: '/financeiro', icon: TrendingUp, roles: ['ADMIN' as Role, 'CS' as Role],
        children: [
          { name: 'DRE — Financeiro', href: '/financeiro', icon: TrendingUp },
          { name: 'Jurídico',         href: '/juridico',   icon: Scale, roles: ['ADMIN' as Role] },
        ],
      },
      { name: 'Onboarding', href: '/clients/new', icon: UserPlus, roles: ['ADMIN' as Role] },
    ],
  },
  {
    label: 'VISÕES POR PAPEL',
    roles: ['ADMIN', 'CS'],
    items: [
      { name: 'Visão CS',     href: '/clients',  icon: Users },
      { name: 'Visão Gestor', href: '/managers', icon: PieChart },
      { name: 'Visão CEO',    href: '/agency',   icon: Building2, roles: ['ADMIN' as Role] },
    ],
  },
  {
    label: 'INTELIGÊNCIA',
    items: [
      { name: 'Alertas',              href: '/alerts',    icon: Bell, countKey: 'alertas', alert: true },
      { name: 'Agentes IA',           href: '/ai-agents', icon: Bot },
      { name: 'Base de Conhecimento', href: '/knowledge', icon: BookMarked, roles: ['ADMIN' as Role] },
      { name: 'Metas & Equipe',       href: '/agency/metas', icon: Target, roles: ['ADMIN' as Role] },
      { name: 'Painel Analítico',     href: '/dashboard', icon: LayoutDashboard },
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

  return (
    <aside className="ak-sidebar w-60 flex-shrink-0 h-screen sticky top-0 bg-[#0A1E2C] border-r border-[#38435C] flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-[#38435C]">
        <Link href="/cockpit" className="flex items-center gap-2.5">
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
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-1">
        {navigation
          .filter((section) => canSee(section.roles, role))
          .map((section) => {
            const visibleItems = section.items.filter((item) => canSee(item.roles, role))
            if (visibleItems.length === 0) return null

            return (
              <div key={section.label || 'top'} className="mb-3">
                {section.label && (
                  <p className="text-[10px] font-semibold text-[#647488] tracking-[0.09em] uppercase px-2 pt-2.5 pb-1">
                    {section.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {visibleItems.map((item) =>
                    item.children && item.children.some((c) => canSee(c.roles, role)) ? (
                      <NavGroup key={item.name} item={item} role={role} pathname={pathname} counts={counts} />
                    ) : (
                      <NavLeaf key={item.href} item={item} pathname={pathname} counts={counts} />
                    ),
                  )}
                </div>
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

function CountBadge({ count, alert }: { count: number; alert?: boolean }) {
  if (count <= 0) return null
  return (
    <span
      className={cn(
        'ml-auto tabular text-[10.5px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 min-w-[18px] text-center',
        alert ? 'bg-[#EF4444]/16 text-[#EF4444]' : 'bg-white/[0.07] text-[#a3b2c2]',
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

function NavLeaf({
  item, pathname, counts, nested,
}: {
  item: NavItemDef
  pathname: string
  counts?: Counts
  nested?: boolean
}) {
  const Icon = item.icon
  const isActive = pathname === item.href || (item.href !== '/operacional' && pathname.startsWith(item.href + '/'))
  const count = item.countKey ? counts?.[item.countKey] ?? 0 : 0

  return (
    <Link
      href={item.href}
      prefetch
      className={cn(
        'group relative flex items-center gap-2.5 rounded-[10px] transition-all duration-200 ease-out active:scale-[0.98]',
        nested ? 'px-2.5 py-1.5 text-[12.5px]' : 'px-2.5 py-2 text-[13px]',
        isActive
          ? 'bg-[#95BBE2]/15 text-[#95BBE2] font-semibold'
          : 'text-[#a3b2c2] hover:bg-white/[0.05] hover:text-[#f2f6fa] font-medium',
      )}
    >
      {isActive && !nested && (
        <span className="absolute -left-[2px] top-2 bottom-2 w-[3px] rounded-full bg-gradient-to-b from-[#54e0ee] to-[#22c2d6] shadow-[0_0_10px_rgba(34,194,214,0.5)]" />
      )}
      {nested
        ? <span className="w-[17px] text-center text-[#647488] flex-shrink-0">·</span>
        : <Icon size={16} className="flex-shrink-0" />}
      <span className="truncate">{item.name}</span>
      <CountBadge count={count} alert={item.alert} />
    </Link>
  )
}

function NavGroup({
  item, role, pathname, counts,
}: {
  item: NavItemDef
  role: Role
  pathname: string
  counts?: Counts
}) {
  const Icon = item.icon
  const kids = (item.children ?? []).filter((c) => canSee(c.roles, role))
  const childActive = kids.some((c) => pathname === c.href || pathname.startsWith(c.href + '/'))
  const [open, setOpen] = useState(childActive)
  const count = item.countKey ? counts?.[item.countKey] ?? 0 : 0

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'group w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[13px] font-medium transition-all duration-200 ease-out',
          childActive ? 'text-[#f2f6fa]' : 'text-[#a3b2c2] hover:bg-white/[0.05] hover:text-[#f2f6fa]',
        )}
      >
        {open
          ? <ChevronDown size={13} className="flex-shrink-0 text-[#647488]" />
          : <ChevronRight size={13} className="flex-shrink-0 text-[#647488]" />}
        <Icon size={16} className="flex-shrink-0" />
        <span className="truncate">{item.name}</span>
        <CountBadge count={count} alert={item.alert} />
      </button>
      {open && (
        <div className="ml-[15px] mt-0.5 mb-0.5 pl-1.5 border-l border-white/[0.06] space-y-0.5">
          {kids.map((c) => <NavLeaf key={c.name} item={c} pathname={pathname} counts={counts} nested />)}
        </div>
      )}
    </div>
  )
}
