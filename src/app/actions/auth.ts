'use server'

import { redirect } from 'next/navigation'
import { verifyCredentials } from '@/lib/auth'
import { createSession, deleteSession } from '@/lib/session'

export type LoginState = {
  error?: string
}

export async function login(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

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
