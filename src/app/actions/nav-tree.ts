'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import { NavNodeKind } from '@prisma/client'
import { normalizeRole } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { ensureNavTree } from '@/lib/nav-tree'

/**
 * Actions da NAVEGAÇÃO EDITÁVEL (decisão do Marcos, 2026-07-13 — "sidebar como
 * no ClickUp"). TODAS exigem sessão + papel ADMIN estrito (só o ADMIN organiza a
 * navegação global da agência). Toda mutação grava AuditLog (CLAUDE.md #8) e
 * revalida o layout. Mensagens pt-BR operacionais.
 *
 * NÃO há posse por cliente aqui: a árvore é GLOBAL; a "posse" desta feature é a
 * condição de ADMIN (governança da agência), como em space-access.ts.
 *
 * Profundidade máxima = 3 níveis (setor → subpasta → item):
 *   GROUP de raiz  →  GROUP subpasta  →  LEAF
 * Regras de movimentação:
 *   • GROUP de raiz  → só pode ficar na raiz OU virar subpasta de OUTRO grupo de
 *     raiz; nunca dentro de uma subpasta (estouraria 3 níveis). Um grupo que
 *     JÁ contém subpastas não pode virar subpasta (seus filhos passariam do 3º
 *     nível).
 *   • LEAF → qualquer grupo (raiz ou subpasta) ou a raiz.
 *   • Só LEAVES podem ser "ocultas"/restauradas e nunca deletadas; grupos vazios
 *     podem ser deletados.
 */

type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

async function requireAdmin(): Promise<
  { ok: true; session: Awaited<ReturnType<typeof requireSession>> } | { ok: false; error: string }
> {
  const session = await requireSession()
  if (normalizeRole(session.role) !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores podem organizar a navegação.' }
  }
  return { ok: true, session }
}

const labelSchema = z
  .string()
  .trim()
  .min(1, 'Informe um nome.')
  .max(40, 'O nome deve ter no máximo 40 caracteres.')

const idSchema = z.string().min(1, 'Nó inválido.')

function revalidateNav() {
  revalidatePath('/', 'layout')
}

// ─── mover (reordenar / mudar de pai) ────────────────────────────────────────

const moveSchema = z.object({
  nodeId: idSchema,
  newParentId: idSchema.nullable(),
  newIndex: z.number().int().min(0),
})

/**
 * Move um nó para `newParentId` (ou raiz) na posição `newIndex`, reordenando os
 * irmãos numa transação. Valida a profundidade máxima (3 níveis) por espécie.
 */
export async function moveNavNode(
  nodeId: string,
  newParentId: string | null,
  newIndex: number,
): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  const parsed = moveSchema.safeParse({ nodeId, newParentId, newIndex })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }

  const node = await prisma.navNode.findUnique({
    where: { id: parsed.data.nodeId },
    select: { id: true, kind: true, parentId: true },
  })
  if (!node) return { ok: false, error: 'Item não encontrado.' }

  const targetParentId = parsed.data.newParentId

  if (targetParentId === node.id) {
    return { ok: false, error: 'Um item não pode ser movido para dentro de si mesmo.' }
  }

  // Valida o pai de destino e a profundidade.
  if (targetParentId !== null) {
    const parent = await prisma.navNode.findUnique({
      where: { id: targetParentId },
      select: { id: true, kind: true, parentId: true },
    })
    if (!parent) return { ok: false, error: 'Grupo de destino não encontrado.' }
    if (parent.kind !== NavNodeKind.GROUP) {
      return { ok: false, error: 'Só é possível soltar itens dentro de um grupo.' }
    }

    if (node.kind === NavNodeKind.GROUP) {
      // GROUP só pode virar subpasta de um grupo de RAIZ (parent sem pai).
      if (parent.parentId !== null) {
        return { ok: false, error: 'Grupos só podem ter um nível de subpastas (máximo de 3 níveis).' }
      }
      // E não pode conter subpastas (elas passariam do 3º nível).
      const hasSubgroup = await prisma.navNode.findFirst({
        where: { parentId: node.id, kind: NavNodeKind.GROUP },
        select: { id: true },
      })
      if (hasSubgroup) {
        return {
          ok: false,
          error: 'Este grupo tem subpastas e não pode virar subpasta de outro (máximo de 3 níveis).',
        }
      }
    }
  }

  const sameParent = (node.parentId ?? null) === (targetParentId ?? null)

  await prisma.$transaction(async (tx) => {
    // Irmãos do destino (sem o próprio nó), ordenados.
    const targetSiblings = (
      await tx.navNode.findMany({
        where: { parentId: targetParentId, id: { not: node.id } },
        select: { id: true },
        orderBy: { order: 'asc' },
      })
    ).map((s) => s.id)

    const index = Math.min(parsed.data.newIndex, targetSiblings.length)
    targetSiblings.splice(index, 0, node.id)

    for (let i = 0; i < targetSiblings.length; i++) {
      await tx.navNode.update({
        where: { id: targetSiblings[i] },
        data: {
          order: i,
          ...(targetSiblings[i] === node.id ? { parentId: targetParentId } : {}),
        },
      })
    }

    // Se mudou de pai, renumera os irmãos que ficaram na origem (fecha o buraco).
    if (!sameParent) {
      const sourceSiblings = await tx.navNode.findMany({
        where: { parentId: node.parentId, id: { not: node.id } },
        select: { id: true },
        orderBy: { order: 'asc' },
      })
      for (let i = 0; i < sourceSiblings.length; i++) {
        await tx.navNode.update({ where: { id: sourceSiblings[i].id }, data: { order: i } })
      }
    }
  })

  await writeAuditLog({
    actorId: auth.session.userId,
    actorRole: auth.session.role,
    action: 'nav_tree.move',
    entityType: 'NavNode',
    entityId: node.id,
    metadata: { from: node.parentId, to: targetParentId, index: parsed.data.newIndex },
  })

  revalidateNav()
  return { ok: true }
}

// ─── renomear ────────────────────────────────────────────────────────────────

export async function renameNavNode(nodeId: string, label: string): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  const idParsed = idSchema.safeParse(nodeId)
  if (!idParsed.success) return { ok: false, error: 'Nó inválido.' }
  const labelParsed = labelSchema.safeParse(label)
  if (!labelParsed.success) return { ok: false, error: labelParsed.error.issues[0]?.message ?? 'Nome inválido.' }

  const node = await prisma.navNode.findUnique({ where: { id: idParsed.data }, select: { id: true } })
  if (!node) return { ok: false, error: 'Item não encontrado.' }

  await prisma.navNode.update({ where: { id: node.id }, data: { label: labelParsed.data } })

  await writeAuditLog({
    actorId: auth.session.userId,
    actorRole: auth.session.role,
    action: 'nav_tree.rename',
    entityType: 'NavNode',
    entityId: node.id,
    metadata: { label: labelParsed.data },
  })

  revalidateNav()
  return { ok: true }
}

// ─── ocultar / restaurar ─────────────────────────────────────────────────────

/**
 * Oculta ("excluir aba") ou restaura um nó. Ocultar um GROUP esconde o grupo
 * inteiro da navegação (os filhos continuam intactos no banco). A PÁGINA nunca
 * é removida — só some da sidebar. Vale para GROUP e LEAF.
 */
export async function setNavNodeHidden(nodeId: string, hidden: boolean): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  const idParsed = idSchema.safeParse(nodeId)
  if (!idParsed.success) return { ok: false, error: 'Nó inválido.' }

  const node = await prisma.navNode.findUnique({ where: { id: idParsed.data }, select: { id: true } })
  if (!node) return { ok: false, error: 'Item não encontrado.' }

  await prisma.navNode.update({ where: { id: node.id }, data: { hidden } })

  await writeAuditLog({
    actorId: auth.session.userId,
    actorRole: auth.session.role,
    action: hidden ? 'nav_tree.hide' : 'nav_tree.unhide',
    entityType: 'NavNode',
    entityId: node.id,
    metadata: { hidden },
  })

  revalidateNav()
  return { ok: true }
}

// ─── criar / deletar grupo ───────────────────────────────────────────────────

/**
 * Cria um GROUP novo (pasta) na RAIZ, no fim da lista. Subpastas se criam
 * arrastando um grupo de raiz para dentro de outro (moveNavNode).
 */
export async function createNavGroup(label: string): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  const labelParsed = labelSchema.safeParse(label)
  if (!labelParsed.success) return { ok: false, error: labelParsed.error.issues[0]?.message ?? 'Nome inválido.' }

  const last = await prisma.navNode.findFirst({
    where: { parentId: null },
    select: { order: true },
    orderBy: { order: 'desc' },
  })
  const nextOrder = (last?.order ?? -1) + 1

  const created = await prisma.navNode.create({
    data: { kind: NavNodeKind.GROUP, label: labelParsed.data, order: nextOrder, parentId: null, icon: 'Folder' },
    select: { id: true },
  })

  await writeAuditLog({
    actorId: auth.session.userId,
    actorRole: auth.session.role,
    action: 'nav_tree.create_group',
    entityType: 'NavNode',
    entityId: created.id,
    metadata: { label: labelParsed.data },
  })

  revalidateNav()
  return { ok: true, data: { id: created.id } }
}

/**
 * Deleta um GROUP — SÓ se estiver VAZIO. Leaves nunca são deletadas (só
 * ocultas); por isso um grupo com qualquer filho não pode ser removido: mova ou
 * oculte os itens antes.
 */
export async function deleteNavGroup(nodeId: string): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  const idParsed = idSchema.safeParse(nodeId)
  if (!idParsed.success) return { ok: false, error: 'Nó inválido.' }

  const node = await prisma.navNode.findUnique({
    where: { id: idParsed.data },
    select: { id: true, kind: true, label: true, _count: { select: { children: true } } },
  })
  if (!node) return { ok: false, error: 'Grupo não encontrado.' }
  if (node.kind !== NavNodeKind.GROUP) {
    return { ok: false, error: 'Só é possível excluir grupos. Itens de página são ocultados, não excluídos.' }
  }
  if (node._count.children > 0) {
    return {
      ok: false,
      error: 'Este grupo não está vazio. Mova ou oculte os itens dele antes de excluir o grupo.',
    }
  }

  await prisma.navNode.delete({ where: { id: node.id } })

  await writeAuditLog({
    actorId: auth.session.userId,
    actorRole: auth.session.role,
    action: 'nav_tree.delete_group',
    entityType: 'NavNode',
    entityId: node.id,
    metadata: { label: node.label },
  })

  revalidateNav()
  return { ok: true }
}

// ─── reset (escape hatch) ────────────────────────────────────────────────────

/**
 * Apaga a árvore inteira e re-semeia o default (organização do ClickUp). Escape
 * hatch para o ADMIN desfazer uma bagunça. Cascade limpa os filhos.
 */
export async function resetNavTree(): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  await prisma.navNode.deleteMany({})
  const seed = await ensureNavTree()

  await writeAuditLog({
    actorId: auth.session.userId,
    actorRole: auth.session.role,
    action: 'nav_tree.reset',
    entityType: 'NavNode',
    entityId: 'ALL',
    metadata: { seeded: seed.seeded },
  })

  revalidateNav()
  return { ok: true }
}
