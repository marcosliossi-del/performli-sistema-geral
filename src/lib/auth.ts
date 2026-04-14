import 'server-only'
import { compare } from 'bcryptjs'
import { prisma } from './prisma'

export type AuthResult =
  | { success: true; user: { id: string; name: string; email: string; role: 'ADMIN' | 'MANAGER' | 'ANALYST' | 'CS' } }
  | { success: false; error: string }

export async function verifyCredentials(email: string, password: string): Promise<AuthResult> {
  if (!email || !password) {
    return { success: false, error: 'Email e senha são obrigatórios' }
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { id: true, name: true, email: true, role: true, passwordHash: true, active: true },
  })

  if (!user) {
    return { success: false, error: 'Credenciais inválidas' }
  }

  if (!user.active) {
    return { success: false, error: 'Usuário desativado. Contate o administrador.' }
  }

  const passwordMatch = await compare(password, user.passwordHash)
  if (!passwordMatch) {
    return { success: false, error: 'Credenciais inválidas' }
  }

  return {
    success: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  }
}
