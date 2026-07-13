'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import { normalizeRole } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { NAV_SPACE_BY_KEY, NAV_SPACES } from '@/lib/nav-spaces'

/**
 * Actions da ACL de navegação por espaço (decisão do Marcos, 2026-07-13).
 * TODAS exigem sessão + papel ADMIN estrito (matriz: só ADMIN configura acesso).
 * Toda mutação grava AuditLog (CLAUDE.md regra #8). Mensagens pt-BR operacionais.
 *
 * NÃO há posse por cliente aqui: a "posse" desta feature é a própria condição
 * de ADMIN (governança da agência), não uma carteira. Por isso não usamos
 * assertClientMutationAccess — validamos papel ADMIN e ponto.
 */

type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

/** Garante sessão autenticada + ADMIN estrito. Retorna a sessão ou lança-erro-friendly. */
async function requireAdmin(): Promise<
  { ok: true; session: Awaited<ReturnType<typeof requireSession>> } | { ok: false; error: string }
> {
  const session = await requireSession()
  if (normalizeRole(session.role) !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores podem configurar acessos por espaço.' }
  }
  return { ok: true, session }
}

const spaceKeySchema = z
  .string()
  .refine((k) => k in NAV_SPACE_BY_KEY, { message: 'Espaço desconhecido.' })

/**
 * Liga/desliga o modo "lista personalizada" de um espaço.
 *  • custom=true  → cria/atualiza NavSpaceMode(custom=true). A partir daí a
 *    lista SUBSTITUI o papel; lista vazia = só ADMIN.
 *  • custom=false → apaga o modo E todas as linhas de acesso do espaço
 *    (volta ao padrão por papel — matriz RBAC).
 */
export async function setSpaceAccessMode(
  spaceKey: string,
  custom: boolean,
): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  const parsed = spaceKeySchema.safeParse(spaceKey)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Espaço inválido.' }
  const key = parsed.data

  if (custom) {
    await prisma.navSpaceMode.upsert({
      where: { spaceKey: key },
      create: { spaceKey: key, custom: true },
      update: { custom: true },
    })
  } else {
    // Desligar: remove o modo e limpa a allowlist (volta ao padrão por papel).
    await prisma.$transaction([
      prisma.navSpaceAccess.deleteMany({ where: { spaceKey: key } }),
      prisma.navSpaceMode.deleteMany({ where: { spaceKey: key } }),
    ])
  }

  await writeAuditLog({
    actorId: auth.session.userId,
    actorRole: auth.session.role,
    action: custom ? 'nav_space.mode_custom_on' : 'nav_space.mode_custom_off',
    entityType: 'NavSpaceMode',
    entityId: key,
    metadata: { spaceKey: key, custom },
  })

  revalidatePath('/', 'layout')
  return { ok: true }
}

const usersSchema = z.array(z.string().min(1)).max(500)

/**
 * Substitui a lista de usuários com acesso a um espaço. Idempotente: apaga as
 * linhas atuais e recria as validadas. Exige que o espaço esteja em modo custom
 * (senão a lista não tem efeito) — liga automaticamente se ainda não estiver.
 * Valida que todos os userIds são usuários ATIVOS.
 */
export async function setSpaceAccessUsers(
  spaceKey: string,
  userIds: string[],
): Promise<ActionResult<{ count: number }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  const keyParsed = spaceKeySchema.safeParse(spaceKey)
  if (!keyParsed.success) return { ok: false, error: keyParsed.error.issues[0]?.message ?? 'Espaço inválido.' }
  const key = keyParsed.data

  const idsParsed = usersSchema.safeParse(userIds)
  if (!idsParsed.success) return { ok: false, error: 'Lista de usuários inválida.' }
  const uniqueIds = Array.from(new Set(idsParsed.data))

  // Valida usuários ativos (defesa: nunca gravar linha para usuário inexistente/inativo).
  if (uniqueIds.length > 0) {
    const found = await prisma.user.findMany({
      where: { id: { in: uniqueIds }, active: true },
      select: { id: true },
    })
    if (found.length !== uniqueIds.length) {
      return { ok: false, error: 'A lista contém usuários inexistentes ou inativos.' }
    }
  }

  await prisma.$transaction([
    // Garante modo custom ligado (a lista só vale em modo custom).
    prisma.navSpaceMode.upsert({
      where: { spaceKey: key },
      create: { spaceKey: key, custom: true },
      update: { custom: true },
    }),
    prisma.navSpaceAccess.deleteMany({ where: { spaceKey: key } }),
    ...(uniqueIds.length > 0
      ? [
          prisma.navSpaceAccess.createMany({
            data: uniqueIds.map((userId) => ({ spaceKey: key, userId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ])

  await writeAuditLog({
    actorId: auth.session.userId,
    actorRole: auth.session.role,
    action: 'nav_space.set_users',
    entityType: 'NavSpaceAccess',
    entityId: key,
    metadata: { spaceKey: key, userIds: uniqueIds, count: uniqueIds.length },
  })

  revalidatePath('/', 'layout')
  return { ok: true, data: { count: uniqueIds.length } }
}

export type SpaceAccessAdminSpace = {
  key: string
  label: string
  kind: string
  group?: string
  hrefs: string[]
  custom: boolean
  userIds: string[]
}

export type SpaceAccessAdminUser = {
  id: string
  name: string
  email: string
  role: string
  avatarUrl: string | null
}

export type SpaceAccessAdminData = {
  spaces: SpaceAccessAdminSpace[]
  staff: SpaceAccessAdminUser[]
}

/**
 * Leitura para o modal do ADMIN: todos os espaços canônicos com seu modo e a
 * allowlist atual, mais todos os usuários staff ATIVOS para o seletor.
 */
export async function getSpaceAccessAdmin(): Promise<ActionResult<SpaceAccessAdminData>> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  const [modes, rows, staff] = await Promise.all([
    prisma.navSpaceMode.findMany({ where: { custom: true }, select: { spaceKey: true } }),
    prisma.navSpaceAccess.findMany({ select: { spaceKey: true, userId: true } }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true, role: true, avatarUrl: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const customSet = new Set(modes.map((m) => m.spaceKey))
  const usersBySpace = new Map<string, string[]>()
  for (const r of rows) {
    const arr = usersBySpace.get(r.spaceKey) ?? []
    arr.push(r.userId)
    usersBySpace.set(r.spaceKey, arr)
  }

  const spaces: SpaceAccessAdminSpace[] = NAV_SPACES.map((s) => ({
    key: s.key,
    label: s.label,
    kind: s.kind,
    group: s.group,
    hrefs: s.hrefs,
    custom: customSet.has(s.key),
    userIds: usersBySpace.get(s.key) ?? [],
  }))

  return {
    ok: true,
    data: {
      spaces,
      staff: staff.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        avatarUrl: u.avatarUrl,
      })),
    },
  }
}
