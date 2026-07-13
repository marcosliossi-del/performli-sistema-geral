import 'server-only'
import { cache } from 'react'
import { prisma } from './prisma'
import { NavNodeKind } from '@prisma/client'
import {
  NAV_TREE_SEED,
  NAV_TREE_SEED_EXCLUDED,
  type NavTree,
  type NavTreeNode,
  type NavCountKey,
  type SeedNode,
} from './nav-tree-shared'

/**
 * DAL + seed da árvore de navegação editável (server-only). Os TIPOS e as
 * transformações puras (client-safe) vivem em `./nav-tree-shared` — re-exportados
 * aqui por conveniência. A árvore é GLOBAL (uma só para a agência).
 */
export {
  navTreeToNavLinks,
  type NavTree,
  type NavTreeNode,
  type NavCountKey,
  type NavLink,
} from './nav-tree-shared'
export { NAV_TREE_SEED_EXCLUDED }

/** Colunas do NavNode que compõem um nó da árvore (sem `children`). */
type NavNodeRow = {
  id: string
  parentId: string | null
  kind: NavNodeKind
  label: string
  href: string | null
  spaceKey: string | null
  module: string | null
  countKey: string | null
  alert: boolean
  icon: string | null
  order: number
  hidden: boolean
  defaultOpen: boolean
}

const NODE_SELECT = {
  id: true,
  parentId: true,
  kind: true,
  label: true,
  href: true,
  spaceKey: true,
  module: true,
  countKey: true,
  alert: true,
  icon: true,
  order: true,
  hidden: true,
  defaultOpen: true,
} as const

function toNode(row: NavNodeRow, childrenByParent: Map<string, NavNodeRow[]>): NavTreeNode {
  const kids = (childrenByParent.get(row.id) ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
  return {
    id: row.id,
    parentId: row.parentId,
    kind: row.kind === 'GROUP' ? 'GROUP' : 'LEAF',
    label: row.label,
    href: row.href,
    spaceKey: row.spaceKey,
    module: row.module,
    countKey: (row.countKey as NavCountKey | null) ?? null,
    alert: row.alert,
    icon: row.icon,
    order: row.order,
    hidden: row.hidden,
    defaultOpen: row.defaultOpen,
    children: kids.map((k) => toNode(k, childrenByParent)),
  }
}

/**
 * Lê a árvore inteira (INCLUINDO nós ocultos — o gerenciador do ADMIN precisa
 * mostrá-los; a renderização normal da sidebar filtra `hidden`). Memoizada por
 * request (React `cache()`). Serializável para atravessar server→client.
 * Garante a semeadura na primeira leitura (idempotente).
 */
export const getNavTree = cache(async (): Promise<NavTree> => {
  await ensureNavTree()

  const rows = (await prisma.navNode.findMany({
    select: NODE_SELECT,
    orderBy: [{ order: 'asc' }],
  })) as NavNodeRow[]

  const childrenByParent = new Map<string, NavNodeRow[]>()
  const roots: NavNodeRow[] = []
  for (const r of rows) {
    if (r.parentId === null) {
      roots.push(r)
    } else {
      const arr = childrenByParent.get(r.parentId) ?? []
      arr.push(r)
      childrenByParent.set(r.parentId, arr)
    }
  }
  roots.sort((a, b) => a.order - b.order)

  return { nodes: roots.map((r) => toNode(r, childrenByParent)) }
})

export type EnsureNavTreeResult = {
  seeded: boolean
  /** Itens do ClickUp deliberadamente fora do seed + motivo (evidência). */
  excluded: typeof NAV_TREE_SEED_EXCLUDED
}

/**
 * Semeia a árvore SE a tabela estiver vazia (idempotente — NÃO é migração de
 * dados). Espelha a organização do ClickUp do Marcos mapeada às rotas reais
 * (ver `NAV_TREE_SEED`). Seguro chamar em toda leitura: um `count` barato antes
 * de qualquer escrita. Concorrência: se dois requests correrem juntos, o segundo
 * encontra `count > 0` e não duplica (e `spaceKey @unique` é a rede de segurança).
 */
export async function ensureNavTree(): Promise<EnsureNavTreeResult> {
  const count = await prisma.navNode.count()
  if (count > 0) return { seeded: false, excluded: NAV_TREE_SEED_EXCLUDED }

  await prisma.$transaction(async (tx) => {
    const createChildren = async (nodes: SeedNode[], parentId: string | null) => {
      let order = 0
      for (const n of nodes) {
        if (n.kind === 'GROUP') {
          const created = await tx.navNode.create({
            data: {
              parentId,
              kind: NavNodeKind.GROUP,
              label: n.label,
              icon: n.icon,
              order: order++,
              defaultOpen: n.defaultOpen ?? false,
            },
            select: { id: true },
          })
          await createChildren(n.children, created.id)
        } else {
          await tx.navNode.create({
            data: {
              parentId,
              kind: NavNodeKind.LEAF,
              label: n.label,
              href: n.href,
              spaceKey: n.spaceKey,
              module: n.module,
              countKey: n.countKey ?? null,
              alert: n.alert ?? false,
              icon: n.icon,
              order: order++,
            },
          })
        }
      }
    }
    await createChildren(NAV_TREE_SEED, null)
  })

  return { seeded: true, excluded: NAV_TREE_SEED_EXCLUDED }
}
