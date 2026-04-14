'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { Role } from '@prisma/client'

const inviteSchema = z.object({
  name:     z.string().min(2, 'Nome obrigatório'),
  email:    z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  role:     z.nativeEnum(Role),
})

export async function inviteUser(formData: FormData) {
  const { role } = await requireSession()
  if (role !== 'ADMIN') throw new Error('Sem permissão')

  const parsed = inviteSchema.safeParse({
    name:     formData.get('name'),
    email:    formData.get('email'),
    password: formData.get('password'),
    role:     formData.get('role'),
  })
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(', '))

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (existing) throw new Error('E-mail já cadastrado')

  const passwordHash = await bcrypt.hash(parsed.data.password, 12)

  // Explicitly pass only schema fields — never spread parsed.data which includes `password`
  await prisma.user.create({
    data: {
      name:         parsed.data.name,
      email:        parsed.data.email,
      role:         parsed.data.role,
      passwordHash,
    },
  })

  revalidatePath('/team')
  revalidatePath('/managers/assignments')
}

export async function updateUserRole(userId: string, newRole: Role) {
  const { role, userId: selfId } = await requireSession()
  if (role !== 'ADMIN') throw new Error('Sem permissão')
  if (userId === selfId) throw new Error('Não é possível alterar seu próprio papel')

  await prisma.user.update({ where: { id: userId }, data: { role: newRole } })
  revalidatePath('/team')
}

export async function toggleUserActive(userId: string) {
  const { role, userId: selfId } = await requireSession()
  if (role !== 'ADMIN') throw new Error('Sem permissão')
  if (userId === selfId) throw new Error('Não é possível desativar sua própria conta')

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { active: true } })
  if (!user) throw new Error('Usuário não encontrado')

  await prisma.user.update({ where: { id: userId }, data: { active: !user.active } })
  revalidatePath('/team')
  revalidatePath('/managers/assignments')
}

export async function deleteUser(userId: string) {
  const { role, userId: selfId } = await requireSession()
  if (role !== 'ADMIN') throw new Error('Sem permissão')
  if (userId === selfId) throw new Error('Não é possível excluir sua própria conta')

  // Assignments cascade-delete via schema onDelete: Cascade
  await prisma.user.delete({ where: { id: userId } })

  revalidatePath('/team')
  revalidatePath('/managers')
  revalidatePath('/managers/assignments')
  revalidatePath('/dashboard')
}
