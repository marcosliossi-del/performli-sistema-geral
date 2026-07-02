'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { verifyCredentials } from '@/lib/auth'
import { createSession, deleteSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'
import { homeForUser } from '@/lib/home'

export type LoginState = {
  error?: string
}

// Brute force: no máx. 10 tentativas por (email+IP) a cada 5 minutos.
const LOGIN_LIMIT = 10
const LOGIN_WINDOW_MS = 5 * 60 * 1000

export async function login(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const callbackUrl = formData.get('callbackUrl') as string | null

  const h = await headers()
  const ip = (h.get('x-forwarded-for')?.split(',')[0]?.trim()) || 'unknown'
  const rl = await checkRateLimit(`login:${(email || '').toLowerCase()}:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS)
  if (!rl.allowed) {
    return { error: `Muitas tentativas de login. Tente novamente em ${Math.ceil(rl.retryAfterSec / 60)} min.` }
  }

  const result = await verifyCredentials(email, password)

  if (!result.success) {
    return { error: result.error }
  }

  await createSession({
    userId: result.user.id,
    name: result.user.name,
    email: result.user.email,
    role: result.user.role,
    operationalRole: result.user.operationalRole,
  })

  // Respeita o callbackUrl que o middleware preservou (a tela que o usuário
  // tentou abrir antes do login). Só aceita caminho relativo da MESMA origem —
  // precisa começar com "/" e não ser "//" (que o browser trata como URL
  // absoluta para outro host). Caso contrário, pouso por perfil.
  if (isSafeRelativePath(callbackUrl)) {
    redirect(callbackUrl)
  }

  // Pouso por perfil: cada papel entra na SUA tela.
  redirect(homeForUser(result.user.role, result.user.operationalRole))
}

function isSafeRelativePath(path: string | null): path is string {
  // Só caminho relativo à PRÓPRIA origem: "/" único no início (nem "//" nem
  // "/\", que navegadores normalizam para URL de outro host), sem barra
  // invertida nem caracteres de controle em qualquer posição.
  if (!path) return false
  return /^\/(?![/\\])[^\x00-\x1f\\]*$/.test(path)
}

export async function logout() {
  await deleteSession()
  redirect('/login')
}
