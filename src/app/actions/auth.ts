'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { verifyCredentials } from '@/lib/auth'
import { createSession, deleteSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'

export type LoginState = {
  error?: string
}

// Brute force: no máx. 10 tentativas por (email+IP) a cada 5 minutos.
const LOGIN_LIMIT = 10
const LOGIN_WINDOW_MS = 5 * 60 * 1000

export async function login(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

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
  })

  redirect('/dashboard')
}

export async function logout() {
  await deleteSession()
  redirect('/login')
}
