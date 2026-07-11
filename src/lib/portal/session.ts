import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import type { ClientPortalUser } from '@prisma/client'

/**
 * Sessão do PORTAL DO CLIENTE — namespace de autenticação SEPARADO do staff.
 *
 * Espelha o mecanismo do auth interno (src/lib/session.ts): jose + JWT HS256 +
 * cookie httpOnly. Mas com cookie próprio (`performli_portal`), payload próprio
 * e model próprio (`ClientPortalUser`). NÃO reusa `Role`/`User`: isolamento duro
 * entre staff interno e cliente externo (decisão §2.1 do diagnóstico).
 *
 * clientId JAMAIS vem de param/body/header — só da sessão assinada.
 */
export type PortalSession = {
  portalUserId: string
  clientId: string
  email: string
  name: string
}

type PortalJwtPayload = PortalSession & { expiresAt: string }

const PORTAL_COOKIE = 'performli_portal'
const EXPIRES_IN = 7 * 24 * 60 * 60 * 1000 // 7 dias
// Claim discriminador (audience): impede que um token interno (mesmo
// SESSION_SECRET) seja aceito como sessão de portal e vice-versa.
export const PORTAL_AUDIENCE = 'performli-portal'

function getSecretKey() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET env var is required')
  return new TextEncoder().encode(secret)
}

/** Cria a sessão do portal para um ClientPortalUser autenticado. */
export async function createPortalSession(user: ClientPortalUser): Promise<void> {
  const expiresAt = new Date(Date.now() + EXPIRES_IN)

  const token = await new SignJWT({
    portalUserId: user.id,
    clientId: user.clientId,
    email: user.email,
    name: user.name,
    expiresAt: expiresAt.toISOString(),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setAudience(PORTAL_AUDIENCE)
    .setExpirationTime(expiresAt)
    .sign(getSecretKey())

  const cookieStore = await cookies()
  cookieStore.set(PORTAL_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  })
}

/** Lê e valida o JWT do cookie do portal. Retorna null se ausente/inválido. */
export async function getPortalSession(): Promise<PortalSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(PORTAL_COOKIE)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ['HS256'],
      audience: PORTAL_AUDIENCE,
    })
    // Validação de shape: um token válido de outro namespace (mesmo segredo)
    // nunca deve ser aceito como sessão de portal sem os campos esperados.
    if (
      typeof payload.portalUserId !== 'string' ||
      typeof payload.clientId !== 'string'
    ) {
      return null
    }
    const p = payload as unknown as PortalJwtPayload
    return {
      portalUserId: p.portalUserId,
      clientId: p.clientId,
      email: p.email,
      name: p.name,
    }
  } catch {
    return null
  }
}

/** Destrói a sessão do portal (logout). */
export async function destroyPortalSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(PORTAL_COOKIE)
}

/**
 * Guard central do portal — chamado no topo de TODA página/action do portal.
 * Resolve cookie → JWT → ClientPortalUser ativo → clientId canônico.
 *
 * Defesa em profundidade: mesmo com o middleware protegendo `/portal`, aqui se
 * revalida o usuário no banco (ativo) e a coerência clientId sessão↔registro.
 * Qualquer inconsistência destrói o cookie e redireciona para o login.
 */
export async function getAuthorizedClient(): Promise<{
  session: PortalSession
  client: { id: string; name: string; slug: string }
}> {
  const session = await getPortalSession()
  if (!session) redirect('/portal/login')

  const user = await prisma.clientPortalUser.findUnique({
    where: { id: session.portalUserId },
    select: { id: true, active: true, clientId: true },
  })

  if (!user || user.active !== true || user.clientId !== session.clientId) {
    await destroyPortalSession()
    redirect('/portal/login')
  }

  const client = await prisma.client.findUnique({
    where: { id: session.clientId },
    select: { id: true, name: true, slug: true },
  })

  if (!client) {
    await destroyPortalSession()
    redirect('/portal/login')
  }

  return { session, client }
}
