'use server'

import { randomInt } from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { normalizeRole } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'

/**
 * Gestão ADMIN dos acessos do portal do cliente.
 *
 * Toda action exige autenticação de staff + papel ADMIN (padrão do repo). A
 * senha temporária é exibida UMA vez ao admin e NUNCA é logada / persistida em
 * claro (só o hash bcrypt). Retornos padronizados `{ ok }` | `{ error }`, sem
 * stack trace / erro cru para a UI.
 */
type AccessResult = { ok: true } | { error: string }
type AccessWithPassword = { ok: true; tempPassword: string } | { error: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Alfabeto sem caracteres ambíguos (0/O, 1/l/I) — senha legível de ditar.
const PW_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

/** Senha temporária forte e legível: 3 blocos de 4 chars separados por '-'. */
function generateTempPassword(): string {
  const block = () =>
    Array.from({ length: 4 }, () => PW_ALPHABET[randomInt(PW_ALPHABET.length)]).join('')
  return `${block()}-${block()}-${block()}`
}

async function requireAdmin(): Promise<{ userId: string; role: string } | null> {
  const session = await requireSession()
  if (normalizeRole(session.role) !== 'ADMIN') return null
  return { userId: session.userId, role: session.role }
}

/** Cria um acesso do portal para um cliente. Retorna a senha temporária (1x). */
export async function createPortalAccess(
  clientId: string,
  email: string,
  name: string,
): Promise<AccessWithPassword> {
  const admin = await requireAdmin()
  if (!admin) return { error: 'Sem permissão para gerenciar acessos do portal.' }

  const cleanEmail = String(email ?? '').trim().toLowerCase()
  const cleanName = String(name ?? '').trim()

  if (!EMAIL_RE.test(cleanEmail)) return { error: 'E-mail inválido.' }
  if (cleanName.length < 2) return { error: 'Nome obrigatório.' }

  try {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } })
    if (!client) return { error: 'Cliente não encontrado.' }

    const existing = await prisma.clientPortalUser.findFirst({
      where: { email: { equals: cleanEmail, mode: 'insensitive' } },
      select: { id: true },
    })
    if (existing) return { error: 'Este e-mail já possui acesso ao portal.' }

    const tempPassword = generateTempPassword()
    const passwordHash = await bcrypt.hash(tempPassword, 12)

    const user = await prisma.clientPortalUser.create({
      data: { clientId, email: cleanEmail, name: cleanName, passwordHash },
    })

    await writeAuditLog({
      action: 'portal.access.create',
      actorId: admin.userId,
      actorRole: admin.role,
      entityType: 'ClientPortalUser',
      entityId: user.id,
      clientId,
      metadata: { email: cleanEmail, name: cleanName }, // NUNCA a senha
    })

    return { ok: true, tempPassword }
  } catch {
    return { error: 'Não foi possível criar o acesso.' }
  }
}

/** Gera nova senha temporária, zera o lockout. Retorna a senha (1x). */
export async function resetPortalPassword(userId: string): Promise<AccessWithPassword> {
  const admin = await requireAdmin()
  if (!admin) return { error: 'Sem permissão para gerenciar acessos do portal.' }

  try {
    const user = await prisma.clientPortalUser.findUnique({
      where: { id: userId },
      select: { id: true, clientId: true },
    })
    if (!user) return { error: 'Acesso não encontrado.' }

    const tempPassword = generateTempPassword()
    const passwordHash = await bcrypt.hash(tempPassword, 12)

    await prisma.clientPortalUser.update({
      where: { id: userId },
      data: { passwordHash, failedAttempts: 0, lockedUntil: null },
    })

    await writeAuditLog({
      action: 'portal.access.reset_password',
      actorId: admin.userId,
      actorRole: admin.role,
      entityType: 'ClientPortalUser',
      entityId: userId,
      clientId: user.clientId,
    })

    return { ok: true, tempPassword }
  } catch {
    return { error: 'Não foi possível redefinir a senha.' }
  }
}

/** Revoga (active:false) ou reativa (active:true) um acesso — soft, sem apagar. */
export async function setPortalAccessActive(
  userId: string,
  active: boolean,
): Promise<AccessResult> {
  const admin = await requireAdmin()
  if (!admin) return { error: 'Sem permissão para gerenciar acessos do portal.' }

  try {
    const user = await prisma.clientPortalUser.findUnique({
      where: { id: userId },
      select: { id: true, clientId: true },
    })
    if (!user) return { error: 'Acesso não encontrado.' }

    await prisma.clientPortalUser.update({
      where: { id: userId },
      data: { active },
    })

    await writeAuditLog({
      action: active ? 'portal.access.reactivate' : 'portal.access.revoke',
      actorId: admin.userId,
      actorRole: admin.role,
      entityType: 'ClientPortalUser',
      entityId: userId,
      clientId: user.clientId,
      metadata: { active },
    })

    return { ok: true }
  } catch {
    return { error: 'Não foi possível atualizar o acesso.' }
  }
}
