'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  ChevronDown,
  ChevronRight,
  Activity,
  Settings,
  MoreHorizontal,
  Lock,
  GripVertical,
  Pencil,
  EyeOff,
  Eye,
  Trash2,
  FolderPlus,
  RotateCcw,
  Check,
  X,
} from 'lucide-react'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
  type DraggableProvidedDragHandleProps,
} from '@hello-pangea/dnd'
import { useNav } from './nav-context'
import { can, normalizeRole, type Module, type Role5 } from '@/lib/rbac'
import { filterNavByOverrides, NAV_SPACE_BY_KEY } from '@/lib/nav-spaces'
import { SpaceAccessModal } from './SpaceAccessModal'
import { navIcon } from './nav-icons'
import type { SessionPayload } from '@/lib/session'
import type { NavTree, NavTreeNode, NavCountKey } from '@/lib/nav-tree-shared'
import {
  moveNavNode,
  renameNavNode,
  setNavNodeHidden,
  createNavGroup,
  deleteNavGroup,
  resetNavTree,
} from '@/app/actions/nav-tree'
import { toast } from '@/lib/toast'

type SessionRole = SessionPayload['role']
type CountKey = NavCountKey
type Counts = Partial<Record<CountKey, number>>

// ─── Resolução de visibilidade (ESPELHA assertPathAccess do servidor) ────────
// A árvore só dá estrutura + rótulos. A visibilidade por papel (`can()`) e a ACL
// por espaço (overrides) continuam POR CIMA, ancoradas no `spaceKey` da LEAF.
// Leaf custom decide primeiro; senão o grupo-ACL (nav-spaces) decide; senão a
// matriz RBAC. "A lista manda": um override `true` mostra o item mesmo que a
// matriz negue o módulo. Reusada pelo CommandPalette.
export function navHrefVisible(
  href: string,
  module: Module | undefined,
  role: Role5,
  overrides: Record<string, boolean>,
  spaceKey?: string | null,
): boolean {
  const leafKey = spaceKey ?? undefined
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

/** Visibilidade de um nó LEAF (respeita `hidden` + ACL/ papel). */
function leafNodeVisible(node: NavTreeNode, role: Role5, overrides: Record<string, boolean>): boolean {
  if (node.hidden || !node.href) return false
  return navHrefVisible(node.href, (node.module ?? undefined) as Module | undefined, role, overrides, node.spaceKey)
}

/** Visibilidade de qualquer nó. GROUP visível se tiver ≥1 descendente visível. */
function nodeVisible(node: NavTreeNode, role: Role5, overrides: Record<string, boolean>): boolean {
  if (node.hidden) return false
  if (node.kind === 'LEAF') return leafNodeVisible(node, role, overrides)
  return node.children.some((c) => nodeVisible(c, role, overrides))
}

/** Soma dos badges dos descendentes LEAF visíveis (para grupo/subpasta fechado). */
function descendantCount(node: NavTreeNode, role: Role5, overrides: Record<string, boolean>, counts?: Counts): {
  count: number
  alert: boolean
} {
  let count = 0
  let alert = false
  const walk = (n: NavTreeNode) => {
    for (const c of n.children) {
      if (!nodeVisible(c, role, overrides)) continue
      if (c.kind === 'LEAF' && c.countKey) {
        const v = counts?.[c.countKey] ?? 0
        if (v > 0) {
          count += v
          if (c.alert) alert = true
        }
      } else if (c.kind === 'GROUP') {
        walk(c)
      }
    }
  }
  walk(node)
  return { count, alert }
}

// ─── Active-state: um leaf só acende se nenhum outro href do menu for match
// mais específico da rota atual (evita /comercial e /comercial/dashboard juntos).
function collectHrefs(nodes: NavTreeNode[], out: string[]) {
  for (const n of nodes) {
    if (n.kind === 'LEAF' && n.href) out.push(n.href)
    if (n.children.length) collectHrefs(n.children, out)
  }
}

function makeIsLeafActive(allHrefs: string[]) {
  return (pathname: string, href: string): boolean => {
    if (pathname === href) return true
    if (!pathname.startsWith(href + '/')) return false
    return !allHrefs.some(
      (other) => other.length > href.length && (pathname === other || pathname.startsWith(other + '/')),
    )
  }
}

// ─── Manipulação otimista da árvore (drag-and-drop) ──────────────────────────
function findNode(nodes: NavTreeNode[], id: string): NavTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const r = findNode(n.children, id)
    if (r) return r
  }
  return null
}

function siblingsOf(tree: NavTree, parentId: string | null): NavTreeNode[] | null {
  if (parentId === null) return tree.nodes
  const p = findNode(tree.nodes, parentId)
  return p ? p.children : null
}

function removeNode(tree: NavTree, id: string): NavTreeNode | null {
  const strip = (arr: NavTreeNode[]): NavTreeNode | null => {
    const i = arr.findIndex((n) => n.id === id)
    if (i >= 0) return arr.splice(i, 1)[0]
    for (const n of arr) {
      const r = strip(n.children)
      if (r) return r
    }
    return null
  }
  return strip(tree.nodes)
}

interface SidebarProps {
  role: SessionRole
  counts?: Counts
  homeHref?: string
  navOverrides?: Record<string, boolean>
  /** Árvore de navegação editável (serializada do servidor via getNavTree). */
  tree: NavTree
}

export function Sidebar({ role, counts, homeHref = '/cockpit', navOverrides = {}, tree }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { viewMode, setMobileOpen } = useNav()

  // Estado local da árvore para update OTIMISTA no drag (rollback em erro). O
  // `revalidatePath('/','layout')` das actions atualiza a prop → ressincroniza.
  const [treeState, setTreeState] = useState<NavTree>(tree)
  useEffect(() => { setTreeState(tree) }, [tree])

  const [managingSpace, setManagingSpace] = useState<string | null>(null)
  const [organize, setOrganize] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)

  useEffect(() => { setMobileOpen(false) }, [pathname, setMobileOpen])

  const base = normalizeRole(role)
  const isPreview = base === 'ADMIN' && viewMode === 'GESTOR'
  const effectiveRole: Role5 = isPreview ? 'GESTOR_TRAFEGO' : base
  const effectiveOverrides = isPreview ? {} : navOverrides

  // Ferramentas de organização (kebab, drag, "+ pasta"): SÓ ADMIN real.
  const isAdmin = base === 'ADMIN' && !isPreview

  useEffect(() => {
    if (isPreview) { setManagingSpace(null); setOrganize(false) }
  }, [isPreview])

  const isCustomSpace = (spaceKey: string | null | undefined): boolean => !!spaceKey && spaceKey in navOverrides

  const allHrefs = useMemo(() => {
    const out: string[] = []
    collectHrefs(treeState.nodes, out)
    return out
  }, [treeState])
  const isLeafActive = useMemo(() => makeIsLeafActive(allHrefs), [allHrefs])

  // ── Drag-and-drop (só no "modo organizar", que expande tudo — ver DECISÃO) ──
  const onDragEnd = useCallback(
    async (result: DropResult) => {
      const { source, destination, draggableId } = result
      if (!destination) return
      const fromParent = source.droppableId === 'ROOT' ? null : source.droppableId
      const toParent = destination.droppableId === 'ROOT' ? null : destination.droppableId
      if (fromParent === toParent && source.index === destination.index) return

      const prev = treeState
      const next: NavTree = structuredClone(prev)
      const node = removeNode(next, draggableId)
      if (!node) return
      const target = siblingsOf(next, toParent)
      if (!target) return

      // O índice do dnd é relativo à lista VISÍVEL renderizada (sem o nó ocultos
      // filtrados). Traduz para o índice REAL entre TODOS os irmãos (inclui
      // ocultos), usando o vizinho visível de destino como âncora.
      const visibleTarget = target.filter((n) => nodeVisible(n, effectiveRole, effectiveOverrides))
      const anchor = visibleTarget[destination.index]
      const realIndex = anchor ? target.indexOf(anchor) : target.length
      node.parentId = toParent
      target.splice(realIndex, 0, node)

      setTreeState(next)
      const res = await moveNavNode(draggableId, toParent, realIndex)
      if (!res.ok) {
        setTreeState(prev)
        toast(res.error, 'err')
      }
    },
    [treeState, effectiveRole, effectiveOverrides],
  )

  const nodeCtx: NodeCtx = {
    role: effectiveRole,
    overrides: effectiveOverrides,
    pathname,
    counts,
    isLeafActive,
    isAdmin,
    organize,
    isCustomSpace,
    onManage: setManagingSpace,
    renamingId,
    setRenamingId,
    router,
  }

  const visibleRoots = treeState.nodes.filter((n) => nodeVisible(n, effectiveRole, effectiveOverrides))

  const navBody = (
    <NodeList nodes={visibleRoots} droppableId="ROOT" level={0} ctx={nodeCtx} />
  )

  return (
    <aside className="lg-sidebar w-60 flex-shrink-0 h-screen sticky top-0 bg-[#0A1E2C] border-r border-[#38435C] flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-[#38435C]">
        <Link href={homeHref} className="flex items-center gap-2.5">
          <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M50 5L90 28V72L50 95L10 72V28L50 5Z" fill="none" stroke="#54e0ee" strokeWidth="6" />
            <path d="M50 5L50 50M50 50L90 28M50 50L10 28" stroke="#54e0ee" strokeWidth="4" />
            <path d="M50 50L50 95" stroke="#54e0ee" strokeWidth="4" strokeDasharray="6 4" />
          </svg>
          <span className="font-bold text-[#EBEBEB] text-lg tracking-tight">
            Perform<span className="italic font-normal text-[#95BBE2]">li</span>
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-1">
        {organize && isAdmin ? (
          <>
            <div className="flex items-center gap-2 px-2 pb-2 mb-1 border-b border-white/[0.06]">
              <GripVertical size={13} className="text-[#54e0ee] flex-shrink-0" />
              <span className="text-[11px] text-[#95BBE2] font-medium leading-tight">
                Arraste para reorganizar. As mudanças valem para toda a agência.
              </span>
            </div>
            <DragDropContext onDragEnd={onDragEnd}>{navBody}</DragDropContext>
          </>
        ) : (
          navBody
        )}
      </nav>

      {/* Modal "Gerenciar acesso" */}
      {managingSpace && (
        <SpaceAccessModal
          spaceKey={managingSpace}
          onClose={() => setManagingSpace(null)}
          onSaved={() => router.refresh()}
        />
      )}
      {showHidden && (
        <HiddenItemsModal tree={treeState} onClose={() => setShowHidden(false)} router={router} />
      )}
      {showNewFolder && <NewFolderModal onClose={() => setShowNewFolder(false)} router={router} />}

      {/* Bottom */}
      <div className="p-3 border-t border-[#38435C] space-y-1">
        {isAdmin && (
          <div className="space-y-0.5 pb-1 mb-1 border-b border-white/[0.06]">
            <SidebarActionButton icon={FolderPlus} label="Nova pasta" onClick={() => setShowNewFolder(true)} />
            <SidebarActionButton
              icon={organize ? Check : GripVertical}
              label={organize ? 'Concluir organização' : 'Organizar navegação'}
              active={organize}
              onClick={() => setOrganize((o) => !o)}
            />
            <SidebarActionButton icon={Eye} label="Itens ocultos" onClick={() => setShowHidden(true)} />
          </div>
        )}
        {can(effectiveRole, 'view', 'gestaoEquipeEquipe') && (
          <Link
            href="/settings"
            prefetch
            className={cn(
              'group flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-medium transition-all duration-200 ease-out',
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

// ─── Contexto de render compartilhado (evita props explosion) ────────────────
type Router = ReturnType<typeof useRouter>
type NodeCtx = {
  role: Role5
  overrides: Record<string, boolean>
  pathname: string
  counts?: Counts
  isLeafActive: (pathname: string, href: string) => boolean
  isAdmin: boolean
  organize: boolean
  isCustomSpace: (spaceKey: string | null | undefined) => boolean
  onManage: (k: string) => void
  renamingId: string | null
  setRenamingId: (id: string | null) => void
  router: Router
}

/**
 * Lista de nós (irmãos). No modo organizar vira um Droppable com Draggables.
 * `droppableId` = 'ROOT' (raiz) ou id do grupo-pai. Índice de destino do dnd é
 * relativo à lista VISÍVEL — traduzido no onDragEnd.
 */
function NodeList({
  nodes,
  droppableId,
  level,
  ctx,
}: {
  nodes: NavTreeNode[]
  droppableId: string
  level: number
  ctx: NodeCtx
}) {
  if (!ctx.organize) {
    return (
      <div className="space-y-0.5">
        {nodes.map((n) => (
          <NavNode key={n.id} node={n} level={level} ctx={ctx} dragHandle={null} />
        ))}
      </div>
    )
  }
  return (
    <Droppable droppableId={droppableId} type="NAV">
      {(prov) => (
        <div ref={prov.innerRef} {...prov.droppableProps} className="space-y-0.5">
          {nodes.map((n, i) => (
            <Draggable key={n.id} draggableId={n.id} index={i}>
              {(dp) => (
                <div ref={dp.innerRef} {...dp.draggableProps}>
                  <NavNode node={n} level={level} ctx={ctx} dragHandle={dp.dragHandleProps} />
                </div>
              )}
            </Draggable>
          ))}
          {prov.placeholder}
        </div>
      )}
    </Droppable>
  )
}

function NavNode({
  node,
  level,
  ctx,
  dragHandle,
}: {
  node: NavTreeNode
  level: number
  ctx: NodeCtx
  dragHandle: DraggableProvidedDragHandleProps | null
}) {
  if (node.kind === 'GROUP') return <NavGroup node={node} level={level} ctx={ctx} dragHandle={dragHandle} />
  return <NavLeaf node={node} level={level} ctx={ctx} dragHandle={dragHandle} />
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

function CustomLock() {
  return <Lock size={11} className="flex-shrink-0 text-[#95BBE2]" aria-label="Acesso personalizado" />
}

/** Handle de arraste (só no modo organizar). */
function DragHandle({ handle }: { handle: DraggableProvidedDragHandleProps | null }) {
  return (
    <span
      {...(handle ?? {})}
      className="flex-shrink-0 flex items-center justify-center w-5 h-5 -ml-1 text-[#647488] hover:text-[#f2f6fa] cursor-grab active:cursor-grabbing"
      aria-label="Arrastar"
    >
      <GripVertical size={13} />
    </span>
  )
}

/** Input de renomear inline. */
function RenameInput({ node, ctx }: { node: NavTreeNode; ctx: NodeCtx }) {
  const [value, setValue] = useState(node.label)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])

  const submit = async () => {
    const label = value.trim()
    if (!label || label === node.label) { ctx.setRenamingId(null); return }
    const res = await renameNavNode(node.id, label)
    if (!res.ok) toast(res.error, 'err')
    else ctx.router.refresh()
    ctx.setRenamingId(null)
  }

  return (
    <div className="flex items-center gap-1 flex-1 min-w-0">
      <input
        ref={ref}
        value={value}
        maxLength={40}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void submit() }
          else if (e.key === 'Escape') { e.preventDefault(); ctx.setRenamingId(null) }
        }}
        className="flex-1 min-w-0 bg-[#0A1E2C] border border-[#54e0ee]/50 rounded-md px-1.5 py-0.5 text-[12.5px] text-[#f2f6fa] focus:outline-none"
      />
      <button type="button" onClick={() => void submit()} aria-label="Salvar" className="text-[#54e0ee] hover:text-[#95BBE2]">
        <Check size={14} />
      </button>
      <button type="button" onClick={() => ctx.setRenamingId(null)} aria-label="Cancelar" className="text-[#647488] hover:text-[#f2f6fa]">
        <X size={14} />
      </button>
    </div>
  )
}

/**
 * Menu de 3 pontinhos (⋯) por nó — SÓ ADMIN real. Ações conforme a espécie:
 * "Gerenciar acesso" (só LEAF com spaceKey), "Renomear", "Ocultar da navegação"
 * e "Excluir pasta" (só GROUP vazio). Popover simples com click-outside.
 */
function NavKebab({ node, ctx }: { node: NavTreeNode; ctx: NodeCtx }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const isGroup = node.kind === 'GROUP'
  const isEmptyGroup = isGroup && node.children.length === 0

  const hide = async () => {
    setOpen(false)
    const msg = isGroup
      ? `Ocultar "${node.label}" da navegação? As telas continuam acessíveis e você pode restaurar em "Itens ocultos".`
      : `Ocultar "${node.label}" da navegação? A tela continua acessível pelo link direto e restaurável em "Itens ocultos".`
    if (!window.confirm(msg)) return
    const res = await setNavNodeHidden(node.id, true)
    if (!res.ok) toast(res.error, 'err')
    else ctx.router.refresh()
  }

  const remove = async () => {
    setOpen(false)
    if (!window.confirm(`Excluir a pasta "${node.label}"? Ela está vazia e some da navegação.`)) return
    const res = await deleteNavGroup(node.id)
    if (!res.ok) toast(res.error, 'err')
    else ctx.router.refresh()
  }

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        aria-label="Opções do item"
        title="Opções do item"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className={cn(
          'flex items-center justify-center w-6 h-6 rounded-md text-[#647488] hover:text-[#f2f6fa] hover:bg-white/[0.10] focus:outline-none transition-opacity',
          open ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100 focus:opacity-100',
        )}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-30 w-52 rounded-lg border border-[#38435C] bg-[#0F2635] shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)] py-1 text-[12.5px]">
          {node.kind === 'LEAF' && node.spaceKey && (
            <KebabItem
              icon={Lock}
              label="Gerenciar acesso"
              onClick={() => { setOpen(false); ctx.onManage(node.spaceKey!) }}
            />
          )}
          <KebabItem
            icon={Pencil}
            label="Renomear"
            onClick={() => { setOpen(false); ctx.setRenamingId(node.id) }}
          />
          <KebabItem icon={EyeOff} label="Ocultar da navegação" onClick={() => void hide()} />
          {isEmptyGroup && <KebabItem icon={Trash2} label="Excluir pasta" danger onClick={() => void remove()} />}
        </div>
      )}
    </div>
  )
}

function KebabItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick() }}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors',
        danger ? 'text-[#EF4444] hover:bg-[#EF4444]/12' : 'text-[#a3b2c2] hover:bg-white/[0.06] hover:text-[#f2f6fa]',
      )}
    >
      <Icon size={13} className="flex-shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}

function NavLeaf({
  node,
  level,
  ctx,
  dragHandle,
}: {
  node: NavTreeNode
  level: number
  ctx: NodeCtx
  dragHandle: DraggableProvidedDragHandleProps | null
}) {
  const Icon = navIcon(node.icon, 'leaf')
  const nested = level > 0
  const href = node.href ?? '#'
  const isActive = ctx.isLeafActive(ctx.pathname, href)
  const count = node.countKey ? ctx.counts?.[node.countKey] ?? 0 : 0
  const isRenaming = ctx.renamingId === node.id
  const showCustom = ctx.isAdmin && ctx.isCustomSpace(node.spaceKey)

  const rowInner = (
    <>
      {ctx.organize ? (
        <DragHandle handle={dragHandle} />
      ) : nested ? (
        <span className="w-[17px] text-center text-[#647488] flex-shrink-0">·</span>
      ) : (
        <Icon size={16} className="flex-shrink-0" />
      )}
      {isRenaming ? (
        <RenameInput node={node} ctx={ctx} />
      ) : (
        <>
          <span className="truncate">{node.label}</span>
          {showCustom && <CustomLock />}
          <CountBadge count={count} alert={node.alert} />
        </>
      )}
    </>
  )

  const rowClass = cn(
    'group relative flex items-center gap-2.5 rounded-[10px] transition-all duration-200 ease-out',
    nested ? 'px-2.5 py-1.5 text-[12.5px]' : 'px-2.5 py-2 text-[13px]',
    isActive && !ctx.organize
      ? 'bg-[#95BBE2]/15 text-[#95BBE2] font-semibold'
      : 'text-[#a3b2c2] hover:bg-white/[0.05] hover:text-[#f2f6fa] font-medium',
  )

  return (
    <div className="group/row relative flex items-center">
      {ctx.organize || isRenaming ? (
        <div className={cn(rowClass, 'flex-1 min-w-0')}>{rowInner}</div>
      ) : (
        <Link href={href} prefetch className={cn(rowClass, 'flex-1 min-w-0', ctx.isAdmin && 'pr-1')}>
          {isActive && !nested && (
            <span className="absolute -left-[2px] top-2 bottom-2 w-[3px] rounded-full bg-gradient-to-b from-[#54e0ee] to-[#22c2d6] shadow-[0_0_10px_rgba(34,194,214,0.5)]" />
          )}
          {rowInner}
        </Link>
      )}
      {ctx.isAdmin && !isRenaming && <NavKebab node={node} ctx={ctx} />}
    </div>
  )
}

function NavGroup({
  node,
  level,
  ctx,
  dragHandle,
}: {
  node: NavTreeNode
  level: number
  ctx: NodeCtx
  dragHandle: DraggableProvidedDragHandleProps | null
}) {
  const Icon = navIcon(node.icon, 'group')
  const kids = node.children.filter((c) => nodeVisible(c, ctx.role, ctx.overrides))
  const childActive = kids.some((c) => {
    if (c.kind === 'LEAF' && c.href) return ctx.pathname === c.href || ctx.pathname.startsWith(c.href + '/')
    return false
  })
  const [localOpen, setLocalOpen] = useState(childActive || node.defaultOpen)
  const open = ctx.organize ? true : localOpen // organizar expande tudo (drop-targets montados)
  const isRenaming = ctx.renamingId === node.id
  const nested = level > 0
  const showCustom = ctx.isAdmin && ctx.isCustomSpace(node.spaceKey)

  const { count: descCount, alert: descAlert } = descendantCount(node, ctx.role, ctx.overrides, ctx.counts)
  const count = open ? 0 : descCount

  const header = (
    <>
      {ctx.organize && <DragHandle handle={dragHandle} />}
      {open ? (
        <ChevronDown size={13} className="flex-shrink-0 text-[#647488]" />
      ) : (
        <ChevronRight size={13} className="flex-shrink-0 text-[#647488]" />
      )}
      <Icon size={nested ? 14 : 16} className="flex-shrink-0" />
      {isRenaming ? (
        <RenameInput node={node} ctx={ctx} />
      ) : (
        <>
          <span className="truncate">{node.label}</span>
          {showCustom && <CustomLock />}
          <CountBadge count={count} alert={descAlert} />
        </>
      )}
    </>
  )

  const headerClass = cn(
    'group w-full flex items-center gap-2.5 rounded-[10px] font-medium transition-all duration-200 ease-out',
    nested ? 'px-2.5 py-1.5 text-[12px]' : 'px-2.5 py-2 text-[13px]',
    childActive ? 'text-[#f2f6fa]' : 'text-[#a3b2c2] hover:bg-white/[0.05] hover:text-[#f2f6fa]',
  )

  return (
    <div>
      <div className="group/row relative flex items-center">
        {ctx.organize || isRenaming ? (
          <div className={cn(headerClass, 'flex-1 min-w-0')}>{header}</div>
        ) : (
          <button type="button" onClick={() => setLocalOpen((o) => !o)} className={cn(headerClass, 'flex-1 min-w-0')}>
            {header}
          </button>
        )}
        {ctx.isAdmin && !isRenaming && <NavKebab node={node} ctx={ctx} />}
      </div>
      {open && kids.length > 0 && (
        <div className="ml-[15px] mt-0.5 mb-0.5 pl-1.5 border-l border-white/[0.06]">
          <NodeList nodes={kids} droppableId={node.id} level={level + 1} ctx={ctx} />
        </div>
      )}
    </div>
  )
}

// ─── Botões e modais de organização (ADMIN) ──────────────────────────────────
function SidebarActionButton({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[12.5px] font-medium transition-all duration-200 ease-out',
        active
          ? 'bg-[#54e0ee]/12 text-[#54e0ee]'
          : 'text-[#a3b2c2] hover:bg-white/[0.05] hover:text-[#f2f6fa]',
      )}
    >
      <Icon size={15} className="flex-shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="lg-overlay fixed inset-0 bg-black/55 z-[60]" onClick={onClose} />
      <div className="fixed left-1/2 top-[18vh] -translate-x-1/2 w-full max-w-[460px] z-[61] px-4">
        <div className="lg-glass-strong border border-white/[0.09] rounded-2xl shadow-[0_24px_70px_-16px_rgba(0,0,0,0.62)] overflow-hidden">
          <div className="flex items-center gap-3 px-5 h-14 border-b border-white/[0.07]">
            <span className="text-[14px] font-semibold text-[#f2f6fa]">{title}</span>
            <button type="button" onClick={onClose} aria-label="Fechar" className="ml-auto text-[#647488] hover:text-[#f2f6fa]">
              <X size={16} />
            </button>
          </div>
          <div className="p-5">{children}</div>
        </div>
      </div>
    </>
  )
}

function NewFolderModal({ onClose, router }: { onClose: () => void; router: Router }) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  const submit = async () => {
    const label = value.trim()
    if (!label || saving) return
    setSaving(true)
    const res = await createNavGroup(label)
    setSaving(false)
    if (!res.ok) { toast(res.error, 'err'); return }
    toast('Pasta criada. Arraste itens para dentro dela em "Organizar navegação".', 'ok')
    onClose()
    router.refresh()
  }

  return (
    <ModalShell title="Nova pasta" onClose={onClose}>
      <input
        ref={ref}
        value={value}
        maxLength={40}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit() } }}
        placeholder="Nome da pasta (ex.: Financeiro)"
        className="w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-2 text-[13px] text-[#f2f6fa] placeholder-[#647488] focus:outline-none focus:border-[#54e0ee]/60"
      />
      <p className="text-[11.5px] text-[#647488] mt-2 leading-snug">
        A pasta nasce vazia no fim da navegação. Depois, use "Organizar navegação" para arrastar itens para dentro dela.
      </p>
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-[12.5px] text-[#a3b2c2] hover:text-[#f2f6fa]">
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || !value.trim()}
          className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold bg-[#54e0ee]/15 text-[#54e0ee] hover:bg-[#54e0ee]/25 disabled:opacity-40"
        >
          {saving ? 'Criando…' : 'Criar pasta'}
        </button>
      </div>
    </ModalShell>
  )
}

function HiddenItemsModal({ tree, onClose, router }: { tree: NavTree; onClose: () => void; router: Router }) {
  const hidden = useMemo(() => {
    const out: NavTreeNode[] = []
    const walk = (nodes: NavTreeNode[]) => {
      for (const n of nodes) {
        if (n.hidden) out.push(n)
        else walk(n.children) // não desce em oculto (o grupo inteiro já está listado)
      }
    }
    walk(tree.nodes)
    return out
  }, [tree])

  const restore = async (id: string) => {
    const res = await setNavNodeHidden(id, false)
    if (!res.ok) toast(res.error, 'err')
    else router.refresh()
  }

  const doReset = async () => {
    if (!window.confirm('Restaurar a navegação padrão? Isso desfaz TODA a organização feita (pastas criadas, renomeações, itens ocultos e reordenações). Não dá para desfazer.')) return
    const res = await resetNavTree()
    if (!res.ok) { toast(res.error, 'err'); return }
    toast('Navegação restaurada para o padrão.', 'ok')
    onClose()
    router.refresh()
  }

  return (
    <ModalShell title="Itens ocultos" onClose={onClose}>
      {hidden.length === 0 ? (
        <p className="text-[12.5px] text-[#a3b2c2]">Nenhum item oculto. Tudo que existe está visível na navegação.</p>
      ) : (
        <div className="space-y-1 max-h-[40vh] overflow-y-auto">
          {hidden.map((n) => (
            <div key={n.id} className="flex items-center gap-2 rounded-lg px-2.5 py-2 bg-white/[0.03]">
              <span className="truncate text-[12.5px] text-[#f2f6fa]">{n.label}</span>
              <span className="text-[10.5px] text-[#647488]">{n.kind === 'GROUP' ? 'pasta' : 'tela'}</span>
              <button
                type="button"
                onClick={() => void restore(n.id)}
                className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] text-[#54e0ee] hover:bg-[#54e0ee]/12"
              >
                <Eye size={12} /> Restaurar
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end mt-4 pt-3 border-t border-white/[0.07]">
        <button
          type="button"
          onClick={() => void doReset()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] text-[#647488] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
        >
          <RotateCcw size={12} /> Restaurar navegação padrão
        </button>
      </div>
    </ModalShell>
  )
}
