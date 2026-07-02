import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import type { OperationalRole } from '@prisma/client'

export type SessionPayload = {
  userId: string
  name: string
  email: string
  // Papel bruto do enum Prisma `Role` — inclui legados (MANAGER/ANALYST) e os
  // papéis v2. Toda decisão de autorização deve passar por `normalizeRole()`
  // (src/lib/rbac) na fronteira antes de usar este valor.
  role:
    | 'ADMIN'
    | 'MANAGER'
    | 'ANALYST'
    | 'CS'
    | 'SUPERVISOR_TRAFEGO'
    | 'ANALISTA_TRAFEGO'
    | 'GESTOR_TRAFEGO'
  // Papel operacional (rotina Arkza) — só para roteamento/pouso por perfil.
  // Opcional: sessões antigas não têm o campo e caem no fallback por role.
  operationalRole?: OperationalRole | null
  expiresAt: string
}

const SESSION_COOKIE = 'performli_session'
const EXPIRES_IN = 7 * 24 * 60 * 60 * 1000 // 7 days

function getSecretKey() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET env var is required')
  return new TextEncoder().encode(secret)
}

export async function createSession(payload: Omit<SessionPayload, 'expiresAt'>) {
  const expiresAt = new Date(Date.now() + EXPIRES_IN)

  const token = await new SignJWT({ ...payload, expiresAt: expiresAt.toISOString() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getSecretKey())

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  })
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value

  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ['HS256'],
    })
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

export async function deleteSession() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}
