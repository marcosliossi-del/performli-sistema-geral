import 'server-only'
import { cache } from 'react'
import { prisma } from './prisma'
import { normalizeRole, type Role5 } from './rbac'
import { spaceKeyForPath } from './nav-spaces'

/**
 * Resolução da ACL de navegação por espaço (decisão do Marcos, 2026-07-13).
 *
 * Camada de OVERRIDE sobre a matriz RBAC (permissions.ts) — não a substitui:
 *   • espaço em modo custom  → a lista de usuários MANDA (dá/tira acesso,
 *     ignorando o papel). ADMIN sempre vê tudo.
 *   • espaço sem modo custom → resolveSpaceVisible devolve `null`, sinalizando
 *     "decida pela matriz" (o caller aplica `can(role,'view',module)`).
 *
 * Performance: UMA query por request (todos os modos custom + todas as linhas
 * do usuário), memoizada com React `cache()`.
 */

export type NavOverrides = {
  /** spaceKeys que estão em modo custom (lista personalizada ligada). */
  customSpaces: Set<string>
  /**
   * Para cada spaceKey custom: true se ESTE usuário está na allowlist.
   * Só contém entradas de espaços custom. Espaço custom ausente aqui = usuário
   * fora da lista → false.
   */
  visibleBySpace: Map<string, boolean>
}

/**
 * Overrides efetivos do usuário. Memoizado por request (React cache): mesmo
 * userId no mesmo render → 1 query. ADMIN também passa por aqui (o enforce do
 * "ADMIN vê tudo" é em resolveSpaceVisible/assertPathAccess, não no banco).
 */
export const getNavOverrides = cache(async (userId: string): Promise<NavOverrides> => {
  const [modes, rows] = await Promise.all([
    prisma.navSpaceMode.findMany({
      where: { custom: true },
      select: { spaceKey: true },
    }),
    prisma.navSpaceAccess.findMany({
      where: { userId },
      select: { spaceKey: true },
    }),
  ])

  const customSpaces = new Set(modes.map((m) => m.spaceKey))
  const userSpaces = new Set(rows.map((r) => r.spaceKey))

  const visibleBySpace = new Map<string, boolean>()
  for (const key of customSpaces) {
    visibleBySpace.set(key, userSpaces.has(key))
  }

  return { customSpaces, visibleBySpace }
})

/**
 * Serializa os overrides para um `Record<spaceKey, boolean>` que atravessa a
 * fronteira server→client (props). Só inclui espaços custom. O client consome
 * via `filterNavByOverrides`. ADMIN recebe um record vazio de propósito: no
 * client o ADMIN vê tudo (o próprio filtro trata ADMIN antes deste record).
 */
export function serializeOverrides(overrides: NavOverrides): Record<string, boolean> {
  return Object.fromEntries(overrides.visibleBySpace)
}

/**
 * Decisão de visibilidade de UM espaço:
 *   • ADMIN                       → true (sempre).
 *   • espaço em modo custom        → a lista manda (true/false).
 *   • espaço sem modo custom       → `null` = "cai na matriz RBAC" (o caller
 *     resolve com `can(role,'view',module)`).
 */
export function resolveSpaceVisible(
  role: Role5,
  spaceKey: string,
  overrides: NavOverrides,
): boolean | null {
  if (role === 'ADMIN') return true
  if (!overrides.customSpaces.has(spaceKey)) return null
  return overrides.visibleBySpace.get(spaceKey) ?? false
}

/**
 * Enforcement de ACESSO REAL de um path (choke point = layout do dashboard).
 * Retorna `false` quando algum espaço custom do path bloqueia o usuário — a
 * página deve então redirecionar.
 *
 * Regra: avalia a leaf primeiro; se a leaf está em modo custom, a decisão da
 * leaf é final. Se a leaf não é custom mas o GRUPO é, decide pelo grupo. Se
 * nenhum for custom, retorna true (a matriz RBAC governa em outra camada).
 */
export async function assertPathAccess(
  session: { userId: string; role: string },
  pathname: string,
): Promise<boolean> {
  const role = normalizeRole(session.role)
  if (role === 'ADMIN') return true

  const keys = spaceKeyForPath(pathname) // [leaf?, group?] — específico → amplo
  if (keys.length === 0) return true

  const overrides = await getNavOverrides(session.userId)

  for (const key of keys) {
    const visible = resolveSpaceVisible(role, key, overrides)
    if (visible === null) continue // espaço não-custom → tenta o próximo (grupo)
    return visible // primeiro espaço custom encontrado é decisivo
  }
  return true
}

// NOTA: `filterNavByOverrides` (contrato para a UI client-side) vive em
// `src/lib/nav-spaces.ts` porque este módulo é `server-only` e não pode ser
// importado por componentes client (Sidebar/CommandPalette). Re-exportado aqui
// por conveniência para callers de servidor:
export { filterNavByOverrides } from './nav-spaces'
