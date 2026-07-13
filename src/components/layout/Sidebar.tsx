'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
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
  KeyRound,
  MoreHorizontal,
  Lock,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useNav } from './nav-context'
import { can, normalizeRole, type Module, type Role5 } from '@/lib/rbac'
import { filterNavByOverrides, NAV_SPACES, NAV_SPACE_BY_KEY } from '@/lib/nav-spaces'
import { SpaceAccessModal } from './SpaceAccessModal'
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
      { name: 'Meu Dia', href: '/meu-dia', icon: Sun,   countKey: 'meuDia', alert: true, module: 'tarefas' },
      { name: 'Cockpit', href: '/cockpit', icon: Gauge,                                   module: 'cockpit' },
    ],
  },
  {
    label: '',
    items: [
      {
        name: 'Clientes', href: '/clients', icon: Users, defaultOpen: true,
        children: [
          { name: 'Clientes',               href: '/clients',        icon: Users,          module: 'clientes' },
          { name: 'Check-ins da semana',    href: '/check-ins',      icon: CheckSquare,    countKey: 'checkins',   alert: true, module: 'clientes' },
          { name: 'Validação da CS',        href: '/validacoes',     icon: ShieldCheck,    countKey: 'validacoes', alert: true, module: 'clientes' },
          { name: 'Hub de Suporte',         href: '/suporte',        icon: Headset,        countKey: 'suporte',                 module: 'clientes' },
          { name: 'Central de Comunicação', href: '/canais',         icon: MessagesSquare, module: 'clientes' },
          { name: 'Relatórios',             href: '/reports',        icon: BarChart3,      module: 'clientes' },
          { name: 'Acessos do Portal',      href: '/portal-acessos', icon: KeyRound,       module: 'gestaoEquipeEquipe' },
        ],
      },
      {
        name: 'Operação', href: '/operacional', icon: Activity, defaultOpen: true,
        children: [
          { name: 'Central de Tarefas',     href: '/operacional',  icon: ListTodo,    countKey: 'abertas', module: 'tarefas' },
          { name: 'Aceite Operacional',     href: '/aceite',       icon: ShieldCheck, module: 'operacao' },
          { name: 'Processos & POPs',       href: '/processos',    icon: BookOpen,    module: 'operacao' },
          { name: 'Rotinas & Recorrências', href: '/recorrencias', icon: Repeat,      module: 'gestaoEquipeEquipe' },
          { name: 'Registro de Operações',  href: '/operations',   icon: FileText,    module: 'operacao' },
        ],
      },
      {
        name: 'Risco', href: '/anti-churn', icon: ShieldAlert,
        children: [
          { name: 'War Room', href: '/anti-churn', icon: ShieldAlert, countKey: 'warRooms', alert: true, module: 'warRoom' },
          { name: 'Alertas',  href: '/alerts',     icon: Bell,        countKey: 'alertas',  alert: true, module: 'warRoom' },
        ],
      },
      {
        name: 'Comercial', href: '/comercial', icon: Target,
        children: [
          { name: 'Funil de Vendas (Leads)', href: '/comercial',          icon: Target,    module: 'comercial' },
          { name: 'Estágio da Carteira',     href: '/pipeline',           icon: Kanban,    module: 'comercial' },
          { name: 'Dashboard Comercial',     href: '/comercial/dashboard', icon: BarChart3, module: 'comercial' },
          { name: 'Gerador de Proposta',     href: '/comercial/proposta',  icon: FileText,  module: 'comercial' },
          { name: 'Conversas',               href: '/conversas',           icon: MessagesSquare, module: 'conversas' },
        ],
      },
      {
        name: 'Administrativo', href: '/financeiro', icon: Building2,
        children: [
          { name: 'DRE — Financeiro',        href: '/financeiro',           icon: TrendingUp, module: 'financeiro' },
          { name: 'Jurídico & Contratos',    href: '/juridico',             icon: Scale,      module: 'juridico' },
          { name: 'Metas da Agência',        href: '/agency/metas',         icon: Target,     module: 'gestaoEquipeMetas' },
          { name: 'Equipe',                  href: '/team',                 icon: Users,      module: 'gestaoEquipeEquipe' },
          { name: 'Atribuições de Clientes', href: '/managers/assignments', icon: UserPlus,   module: 'gestaoEquipeEquipe' },
          { name: 'Visão CEO',               href: '/agency',               icon: Building2,  module: 'gestaoEquipeEquipe' },
          { name: 'Visão Gestor',            href: '/managers',             icon: PieChart,   module: 'gestaoEquipeVisaoGestor' },
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

/**
 * Lista PLANA de links do menu (só leaves), derivada do MESMO `navigation[]`.
 * Consumida pelo ⌘K (CommandPalette) — sem lista duplicada. A visibilidade por
 * papel é aplicada lá via `can(role, 'view', module)`.
 */
export type NavLink = { name: string; href: string; module?: Module; icon: React.ElementType }

export const NAV_LINKS: NavLink[] = navigation.flatMap((s) =>
  s.items.flatMap((i) =>
    i.children && i.children.length > 0
      ? i.children.map((c) => ({ name: c.name, href: c.href, module: c.module, icon: c.icon }))
      : [{ name: i.name, href: i.href, module: i.module, icon: i.icon }],
  ),
)

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

// ── Mapas href → spaceKey (derivados 1:1 de NAV_SPACES, fonte canônica) ──────
// LEAF cobre leaves de grupo + fixos (Meu Dia/Cockpit). GROUP mapeia qualquer
// href de leaf-filha ao seu grupo (o item de grupo na sidebar usa o href da 1ª
// filha). Construídos uma vez no módulo — 1 rota = 1 espaço garantido.
const LEAF_SPACE_BY_HREF: Record<string, string> = {}
const GROUP_SPACE_BY_HREF: Record<string, string> = {}
for (const s of NAV_SPACES) {
  if (s.kind === 'leaf' || s.kind === 'fixed') LEAF_SPACE_BY_HREF[s.hrefs[0]] = s.key
  else if (s.kind === 'group') for (const h of s.hrefs) GROUP_SPACE_BY_HREF[h] = s.key
}

/** spaceKey de um item da sidebar por href (grupo tem precedência p/ o kebab). */
function spaceKeyForGroupHref(href: string): string | undefined {
  return GROUP_SPACE_BY_HREF[href]
}
function spaceKeyForLeafHref(href: string): string | undefined {
  return LEAF_SPACE_BY_HREF[href]
}

/**
 * Visibilidade de uma LEAF combinando overrides + policy engine. Espelha
 * exatamente o `assertPathAccess` do servidor (nav-access.ts): a leaf custom
 * decide primeiro; se não for custom, o GRUPO custom decide; só então cai na
 * matriz RBAC (`can`). "A lista manda": um override `true` mostra o item mesmo
 * que `can()` negue o módulo dele.
 */
export function navHrefVisible(
  href: string,
  module: Module | undefined,
  role: Role5,
  overrides: Record<string, boolean>,
): boolean {
  const leafKey = LEAF_SPACE_BY_HREF[href]
  if (leafKey) {
    const ov = filterNavByOverrides(role, leafKey, overrides)
    if (ov !== null) return ov
    const groupKey = NAV_SPACE_BY_KEY[leafKey]?.group
    if (groupKey) {
      const ovg = filterNavByOverrides(role, groupKey, overrides)
      if (ovg !== null) return ovg
    }
  }
  if (!module) return true
  return can(role, 'view', module)
}

function leafVisible(item: NavItemDef, role: Role5, overrides: Record<string, boolean>): boolean {
  return navHrefVisible(item.href, item.module, role, overrides)
}

/**
 * Visibilidade de qualquer item. Grupos herdam dos filhos: aparecem se ao menos
 * uma leaf-filha for visível (um override `true` no grupo já torna todas as
 * filhas visíveis via `leafVisible`).
 */
function itemVisible(item: NavItemDef, role: Role5, overrides: Record<string, boolean>): boolean {
  if (item.children && item.children.length > 0) {
    return item.children.some((c) => leafVisible(c, role, overrides))
  }
  return leafVisible(item, role, overrides)
}

type Counts = Partial<Record<CountKey, number>>

interface SidebarProps {
  role: SessionRole
  counts?: Counts
  /** Destino do logo — home do perfil (pouso). Default defensivo: /cockpit. */
  homeHref?: string
  /**
   * Overrides da ACL de navegação por espaço (Record<spaceKey, boolean>), só com
   * espaços em modo custom. Suas CHAVES são os espaços que têm lista
   * personalizada — usadas também para o indicador (cadeado) do ADMIN.
   */
  navOverrides?: Record<string, boolean>
}

export function Sidebar({ role, counts, homeHref = '/cockpit', navOverrides = {} }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { viewMode, setMobileOpen } = useNav()

  // Espaço aberto no modal "Gerenciar acesso" (só ADMIN real — ver showKebab).
  const [managingSpace, setManagingSpace] = useState<string | null>(null)

  // Fecha o drawer mobile ao navegar (a rota muda).
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname, setMobileOpen])

  // Papel canônico + prévia "GESTOR": um ADMIN pode pré-visualizar a navegação
  // como gestor. A prévia só REBAIXA (ADMIN→GESTOR_TRAFEGO) — o RBAC real é do
  // backend; aqui é só UX.
  const base = normalizeRole(role)
  const isPreview = base === 'ADMIN' && viewMode === 'GESTOR'
  const effectiveRole: Role5 = isPreview ? 'GESTOR_TRAFEGO' : base

  // Na prévia "ver como GESTOR" simulamos o papel GESTOR *sem* overrides: mostra
  // o default por papel (matriz RBAC), não a lista personalizada do ADMIN real.
  // Fora da prévia, valem os overrides reais do usuário. (Para o ADMIN real, o
  // filtro ignora overrides — ADMIN vê tudo; as chaves ainda servem ao cadeado.)
  const effectiveOverrides = isPreview ? {} : navOverrides

  // Kebab "Gerenciar acesso" + cadeado: SÓ para ADMIN real (nunca na prévia).
  const showKebab = base === 'ADMIN' && !isPreview

  // QA D5: entrar na prévia fecha o modal de acesso (ele é ferramenta do ADMIN
  // real; as actions barram server-side de qualquer forma).
  useEffect(() => {
    if (isPreview) setManagingSpace(null)
  }, [isPreview])
  const isCustomSpace = (spaceKey: string | undefined): boolean =>
    !!spaceKey && spaceKey in navOverrides

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
            const visibleItems = section.items.filter((item) => itemVisible(item, effectiveRole, effectiveOverrides))
            if (visibleItems.length === 0) return null

            return (
              <div key={section.label || `sec-${idx}`} className="mb-3">
                {section.label && (
                  <p className="text-[10px] font-semibold text-[#647488] tracking-[0.09em] uppercase px-2 pt-2.5 pb-1">
                    {section.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const isGroup = item.children && item.children.some((c) => leafVisible(c, effectiveRole, effectiveOverrides))
                    if (isGroup) {
                      const groupKey = spaceKeyForGroupHref(item.href)
                      return (
                        <NavGroup
                          key={item.name}
                          item={item}
                          role={effectiveRole}
                          overrides={effectiveOverrides}
                          pathname={pathname}
                          counts={counts}
                          spaceKey={groupKey}
                          isCustom={isCustomSpace(groupKey)}
                          showKebab={showKebab}
                          onManage={setManagingSpace}
                        />
                      )
                    }
                    const leafKey = spaceKeyForLeafHref(item.href)
                    return (
                      <NavLeaf
                        key={item.href}
                        item={item}
                        pathname={pathname}
                        counts={counts}
                        spaceKey={leafKey}
                        isCustom={isCustomSpace(leafKey)}
                        showKebab={showKebab}
                        onManage={setManagingSpace}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
      </nav>

      {/* Modal "Gerenciar acesso" — montado só quando o ADMIN abre um espaço. */}
      {managingSpace && (
        <SpaceAccessModal
          spaceKey={managingSpace}
          onClose={() => setManagingSpace(null)}
          onSaved={() => router.refresh()}
        />
      )}

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

/**
 * Botão kebab (⋯) "Gerenciar acesso". SÓ renderizado para ADMIN real. Fica
 * absoluto à direita da linha, escondido (opacity-0) até o hover da linha
 * (group/row) — não desloca o layout. `stopPropagation`/`preventDefault` evitam
 * navegar (dentro de Link) ou abrir/fechar o grupo (dentro do toggle).
 */
function KebabButton({ onManage, spaceKey }: { onManage: (k: string) => void; spaceKey: string }) {
  return (
    <button
      type="button"
      aria-label="Gerenciar acesso"
      title="Gerenciar acesso"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onManage(spaceKey)
      }}
      className="absolute right-1 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-6 h-6 rounded-md text-[#647488] hover:text-[#f2f6fa] hover:bg-white/[0.10] opacity-0 group-hover/row:opacity-100 focus:opacity-100 focus:outline-none transition-opacity"
    >
      <MoreHorizontal size={14} />
    </button>
  )
}

/** Cadeado discreto ao lado do nome: o espaço tem lista personalizada (só ADMIN). */
function CustomLock() {
  return (
    <Lock
      size={11}
      className="flex-shrink-0 text-[#95BBE2]"
      aria-label="Acesso personalizado"
    />
  )
}

function NavLeaf({
  item, pathname, counts, nested, spaceKey, isCustom, showKebab, onManage,
}: {
  item: NavItemDef
  pathname: string
  counts?: Counts
  nested?: boolean
  spaceKey?: string
  isCustom?: boolean
  showKebab?: boolean
  onManage?: (k: string) => void
}) {
  const Icon = item.icon
  const isActive = isLeafActive(pathname, item.href)
  const count = item.countKey ? counts?.[item.countKey] ?? 0 : 0
  const canKebab = showKebab && spaceKey && onManage

  return (
    <div className="group/row relative">
      <Link
        href={item.href}
        prefetch
        className={cn(
          'group relative flex items-center gap-2.5 rounded-[10px] transition-all duration-200 ease-out active:scale-[0.98]',
          nested ? 'px-2.5 py-1.5 text-[12.5px]' : 'px-2.5 py-2 text-[13px]',
          canKebab && 'pr-8',
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
        {isCustom && showKebab && <CustomLock />}
        <CountBadge count={count} alert={item.alert} />
      </Link>
      {showKebab && spaceKey && onManage && <KebabButton onManage={onManage} spaceKey={spaceKey} />}
    </div>
  )
}

function NavGroup({
  item, role, overrides, pathname, counts, spaceKey, isCustom, showKebab, onManage,
}: {
  item: NavItemDef
  role: Role5
  overrides: Record<string, boolean>
  pathname: string
  counts?: Counts
  spaceKey?: string
  isCustom?: boolean
  showKebab?: boolean
  onManage?: (k: string) => void
}) {
  const Icon = item.icon
  const kids = (item.children ?? []).filter((c) => leafVisible(c, role, overrides))
  const childActive = kids.some((c) => pathname === c.href || pathname.startsWith(c.href + '/'))
  const [open, setOpen] = useState(childActive || Boolean(item.defaultOpen))
  const canKebab = showKebab && spaceKey && onManage

  // Badge do grupo = soma dos filhos visíveis com contador, SÓ quando fechado.
  // Aberto, cada leaf mostra o próprio badge (evita dupla contagem). Cor de
  // alerta se qualquer filho contabilizado for `alert`.
  let groupCount = 0
  let groupAlert = false
  for (const c of kids) {
    if (!c.countKey) continue
    const n = counts?.[c.countKey] ?? 0
    if (n > 0) {
      groupCount += n
      if (c.alert) groupAlert = true
    }
  }
  const count = open ? 0 : groupCount

  return (
    <div>
      <div className="group/row relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'group w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[13px] font-medium transition-all duration-200 ease-out',
            canKebab && 'pr-8',
            childActive ? 'text-[#f2f6fa]' : 'text-[#a3b2c2] hover:bg-white/[0.05] hover:text-[#f2f6fa]',
          )}
        >
          {open
            ? <ChevronDown size={13} className="flex-shrink-0 text-[#647488]" />
            : <ChevronRight size={13} className="flex-shrink-0 text-[#647488]" />}
          <Icon size={16} className="flex-shrink-0" />
          <span className="truncate">{item.name}</span>
          {isCustom && showKebab && <CustomLock />}
          <CountBadge count={count} alert={groupAlert} />
        </button>
        {showKebab && spaceKey && onManage && <KebabButton onManage={onManage} spaceKey={spaceKey} />}
      </div>
      {open && (
        <div className="ml-[15px] mt-0.5 mb-0.5 pl-1.5 border-l border-white/[0.06] space-y-0.5">
          {kids.map((c) => {
            const leafKey = spaceKeyForLeafHref(c.href)
            return (
              <NavLeaf
                key={c.name}
                item={c}
                pathname={pathname}
                counts={counts}
                nested
                spaceKey={leafKey}
                isCustom={showKebab ? leafKey ? leafKey in overrides : false : false}
                showKebab={showKebab}
                onManage={onManage}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
