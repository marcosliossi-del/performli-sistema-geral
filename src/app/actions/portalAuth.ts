'use server'

import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import { createPortalSession, destroyPortalSession } from '@/lib/portal/session'

type LoginState = { error?: string }

const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 15

// Mensagem ÚNICA para qualquer falha de credencial/estado — NUNCA diferenciar
// "e-mail não existe" de "senha errada" de "conta bloqueada" (evita enumeração).
const GENERIC_ERROR = 'Credenciais inválidas ou acesso bloqueado. Tente mais tarde.'

/**
 * Login do portal do cliente. Rate limit serverless-safe por contadores no
 * banco (failedAttempts/lockedUntil). Em sucesso, cria sessão, audita e
 * redireciona para /portal.
 */
export async function portalLogin(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) return { error: GENERIC_ERROR }

  let shouldRedirect = false

  try {
    const user = await prisma.clientPortalUser.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    })

    // Usuário inexistente ou inativo → mesma resposta genérica.
    if (!user || !user.active) return { error: GENERIC_ERROR }

    // Lockout ativo.
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      return { error: GENERIC_ERROR }
    }

    const ok = await bcrypt.compare(password, user.passwordHash)

    if (!ok) {
      const failedAttempts = user.failedAttempts + 1
      const locked = failedAttempts >= MAX_ATTEMPTS
      await prisma.clientPortalUser.update({
        where: { id: user.id },
        data: {
          failedAttempts,
          lockedUntil: locked ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil,
        },
      })
      return { error: GENERIC_ERROR }
    }

    // Sucesso: zera contadores, marca login, cria sessão, audita.
    await prisma.clientPortalUser.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    })

    await createPortalSession(user)

    await writeAuditLog({
      action: 'portal.login',
      actorId: user.id,
      actorRole: 'CLIENT_PORTAL',
      entityType: 'ClientPortalUser',
      entityId: user.id,
      clientId: user.clientId,
    })

    shouldRedirect = true
  } catch {
    return { error: GENERIC_ERROR }
  }

  // redirect() lança NEXT_REDIRECT — fica fora do try/catch.
  if (shouldRedirect) redirect('/portal')
  return {}
}

/** Logout do portal: destrói a sessão e volta ao login. */
export async function portalLogout(): Promise<void> {
  await destroyPortalSession()
  redirect('/portal/login')
}
