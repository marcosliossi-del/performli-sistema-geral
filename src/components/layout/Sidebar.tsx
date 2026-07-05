'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Gauge,
  Sun,
  ShieldCheck,
  FileText,
  ListTodo,
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
  MessagesSquare,
  Repeat,
  Headset,
  Settings,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useNav } from './nav-context'
import { can, normalizeRole, type Module, type Role5 } from '@/lib/rbac'
import type { SessionPayload } from '@/lib/session'

type SessionRole = SessionPayload['role']

type CountKey = 'meuDia' | 'abertas' | 'checkins' | 'validacoes' | 'warRooms' | 'alertas' | 'suporte'

type NavItemDef = {
  name: string
  href: string
  icon: React.ElementType
  /**
   * Módulo do policy engine que governa a visibilidade deste item. Filtramos por
   * `can(role, 'view', module)` — MESMA matriz do backend, nunca lista duplicada.
   * Item sem módulo é sempre visível. Grupos (com `children`) herdam visibilidade
   * dos filhos: o grupo aparece se ao menos um filho for visível.
   */
  module?: Module
  /** Pendency counter key (badge). */
  countKey?: CountKey
  /** Render the badge in alert color when > 0. */
  alert?: boolean
  /** Sub-itens aninhados (nav-tree) — item vira expansível. */
  children?: NavItemDef[]
  /** Grupo abre expandido por padrão (mesmo sem filho ativo). */
  defaultOpen?: boolean
}

type NavSection = {
  label: string
  items: NavItemDef[]
}

// Navegação ÁREA→FUNÇÃO, rasa: bloco fixo do núcleo diário no topo, depois
// ÁREAS colapsáveis (nav-tree) e leaves acionáveis de 1º nível. 1 rota = 1 rótulo.
// Mapa item→módulo do policy engine. A visibilidade sai de `can(role,'view',mod)`
// (mesma matriz do backend). Itens de configuração admin (recorrências, base de
// conhecimento, equipe, atribuições, visão CEO) mapeiam para `gestaoEquipeEquipe`
// (SÓ ADMIN na matriz). Ver HANDOFF_AGENTE_4.md → "mapa sidebar→módulo".
const navigation: NavSection[] = [
  {
    // Bloco fixo — núcleo diário. Todos os papéis têm `view` nesses módulos.
    label: '',
    items: [
      { name: 'Meu Dia',            href: '/meu-dia',     icon: Sun,     countKey: 'meuDia',  alert: true, module: 'tarefas' },
      { name: 'Hub de Suporte',     href: '/suporte',     icon: Headset, countKey: 'suporte',              module: 'clientes' },
      { name: 'Central de Tarefas', href: '/operacional', icon: ListTodo, countKey: 'abertas',             module: 'tarefas' },
      { name: 'Cockpit',            href: '/cockpit',     icon: Gauge,                                      module: 'cockpit' },
    ],
  },
  {
    label: '',
    items: [
      {
        name: 'Clientes', href: '/clients', icon: Users, defaultOpen: true,
        children: [
          { name: 'Clientes',               href: '/clients',    icon: Users,           module: 'clientes' },
          { name: 'Check-ins da semana',    href: '/check-ins',  icon: CheckSquare,     countKey: 'checkins',   alert: true, module: 'clientes' },
          { name: 'Validação da CS',        href: '/validacoes', icon: ShieldCheck,     countKey: 'validacoes', alert: true, module: 'clientes' },
          { name: 'Central de Comunicação', href: '/canais',     icon: MessagesSquare,  module: 'clientes' },
          { name: 'Relatórios',             href: '/reports',    icon: BarChart3,       module: 'clientes' },
        ],
      },
      {
        name: 'Operação de Tráfego', href: '/processos', icon: Activity, defaultOpen: true,
        children: [
          { name: 'Aceite Operacional',     href: '/aceite',       icon: ShieldCheck, module: 'operacao' },
          { name: 'Processos & POPs',       href: '/processos',    icon: BookOpen,    module: 'operacao' },
          { name: 'Recorrências',           href: '/recorrencias', icon: Repeat,      module: 'gestaoEquipeEquipe' },
          { name: 'Registro de Operações',  href: '/operations',   icon: FileText,    module: 'operacao' },
        ],
      },
      { name: 'War Room', href: '/anti-churn', icon: ShieldAlert, countKey: 'warRooms', alert: true, module: 'warRoom' },
      { name: 'Alertas',  href: '/alerts',     icon: Bell,        countKey: 'alertas',  alert: true, module: 'warRoom' },
      {
        name: 'Comercial', href: '/comercial', icon: Target,
        children: [
          { name: 'Funil de Vendas (Leads)', href: '/comercial',          icon: Target,    module: 'comercial' },
          { name: 'Estágio da Carteira',     href: '/pipeline',           icon: Kanban,    module: 'comercial' },
          { name: 'Dashboard Comercial',     href: '/comercial/dashboard', icon: BarChart3, module: 'comercial' },
          { name: 'Gerador de Proposta',     href: '/comercial/proposta',  icon: FileText,  module: 'comercial' },
        ],
      },
      {
        name: 'Financeiro', href: '/financeiro', icon: TrendingUp,
        children: [
          { name: 'DRE — Financeiro',       href: '/financeiro', icon: TrendingUp, module: 'financeiro' },
          { name: 'Jurídico & Contratos',   href: '/juridico',   icon: Scale,      module: 'juridico' },
        ],
      },
      {
        name: 'Gestão & Equipe', href: '/team', icon: Building2,
        children: [
          { name: 'Equipe',                  href: '/team',                 icon: Users,     module: 'gestaoEquipeEquipe' },
          { name: 'Atribuições de Clientes', href: '/managers/assignments', icon: UserPlus,  module: 'gestaoEquipeEquipe' },
          { name: 'Metas da Agência',        href: '/agency/metas',         icon: Target,    module: 'gestaoEquipeMetas' },
          { name: 'Visão CEO',               href: '/agency',               icon: Building2, module: 'gestaoEquipeEquipe' },
          { name: 'Visão Gestor',            href: '/managers',             icon: PieChart,  module: 'gestaoEquipeVisaoGestor' },
        ],
      },
      {
        name: 'Inteligência', href: '/ai-agents', icon: Bot,
        children: [
          { name: 'Agentes IA',           href: '/ai-agents', icon: Bot,             module: 'inteligencia' },
          { name: 'Base de Conhecimento', href: '/knowledge', icon: BookMarked,      module: 'gestaoEquipeEquipe' },
        ],
      },
    ],
  },
]

// Todas as rotas do menu — usado para o active-state: um item só acende por
// prefixo se NENHUM outro item do menu for um match mais específico da rota
// atual (evita /comercial e /comercial/dashboard acesos juntos).
const ALL_NAV_HREFS: string[] = navigation.flatMap((s) =>
  s.items.flatMap((i) => [i.href, ...(i.children?.map((c) => c.href) ?? [])])
)

function isLeafActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (!pathname.startsWith(href + '/')) return false
  return !ALL_NAV_HREFS.some(
    (other) =>
      other.length > href.length &&
      (pathname === other || pathname.startsWith(other + '/'))
  )
}

/**
 * Visibilidade derivada 100% do policy engine. Grupos herdam dos filhos: o grupo
 * aparece se ao menos um filho for visível (sem lista de papéis duplicada).
 */
function itemVisible(item: NavItemDef, role: Role5): boolean {
  if (item.children && item.children.length > 0) {
    return item.children.some((c) => itemVisible(c, role))
  }
  if (!item.module) return true
  return can(role, 'view', item.module)
}

type Counts = Partial<Record<CountKey, number>>

interface SidebarProps {
  role: SessionRole
  counts?: Counts
  /** Destino do logo — home do perfil (pouso). Default defensivo: /cockpit. */
  homeHref?: string
}

export function Sidebar({ role, counts, homeHref = '/cockpit' }: SidebarProps) {
  const pathname = usePathname()
  const { viewMode, setMobileOpen } = useNav()

  // Fecha o drawer mobile ao navegar (a rota muda).
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname, setMobileOpen])

  // Papel canônico + prévia "GESTOR": um ADMIN pode pré-visualizar a navegação
  // como gestor. A prévia só REBAIXA (ADMIN→GESTOR_TRAFEGO) — o RBAC real é do
  // backend; aqui é só UX.
  const base = normalizeRole(role)
  const effectiveRole: Role5 =
    base === 'ADMIN' && viewMode === 'GESTOR' ? 'GESTOR_TRAFEGO' : base

  return (
    <aside className="lg-sidebar w-60 flex-shrink-0 h-screen sticky top-0 bg-[#0A1E2C] border-r border-[#38435C] flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-[#38435C]">
        <Link href={homeHref} className="flex items-center gap-2.5">
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
          .map((section, idx) => {
            const visibleItems = section.items.filter((item) => itemVisible(item, effectiveRole))
            if (visibleItems.length === 0) return null

            return (
              <div key={section.label || `sec-${idx}`} className="mb-3">
                {section.label && (
                  <p className="text-[10px] font-semibold text-[#647488] tracking-[0.09em] uppercase px-2 pt-2.5 pb-1">
                    {section.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {visibleItems.map((item) =>
                    item.children && item.children.some((c) => itemVisible(c, effectiveRole)) ? (
                      <NavGroup key={item.name} item={item} role={effectiveRole} pathname={pathname} counts={counts} />
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
        {can(effectiveRole, 'view', 'gestaoEquipeEquipe') && (
          <Link
            href="/settings"
            prefetch
            className={cn(
              'group flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-medium transition-all duration-200 ease-out mb-1',
              pathname === '/settings' || pathname.startsWith('/settings/')
                ? 'bg-[#95BBE2]/15 text-[#95BBE2] font-semibold'
                : 'text-[#a3b2c2] hover:bg-white/[0.05] hover:text-[#f2f6fa]',
            )}
          >
            <Settings size={16} className="flex-shrink-0" />
            <span className="truncate">Configurações</span>
          </Link>
        )}
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
  const isActive = isLeafActive(pathname, item.href)
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
  role: Role5
  pathname: string
  counts?: Counts
}) {
  const Icon = item.icon
  const kids = (item.children ?? []).filter((c) => itemVisible(c, role))
  const childActive = kids.some((c) => pathname === c.href || pathname.startsWith(c.href + '/'))
  const [open, setOpen] = useState(childActive || Boolean(item.defaultOpen))
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
