'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { slugify } from '@/lib/utils'

export type ClientFormState = {
  error?: string
}

export async function createClient(
  prevState: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  const session = await requireSession()

  const name = (formData.get('name') as string)?.trim()
  const industry = (formData.get('industry') as string)?.trim()
  const website = (formData.get('website') as string)?.trim()
  const notes = (formData.get('notes') as string)?.trim()
  const managerId = formData.get('managerId') as string

  if (!name) return { error: 'Nome do cliente é obrigatório.' }

  const slug = slugify(name)

  // Check slug uniqueness
  const existing = await prisma.client.findUnique({ where: { slug } })
  if (existing) {
    return { error: `Já existe um cliente com nome similar ("${existing.name}"). Use um nome diferente.` }
  }

  const assignedUserId = managerId || session.userId

  const client = await prisma.client.create({
    data: {
      name,
      slug,
      industry: industry || null,
      website: website || null,
      notes: notes || null,
      status: 'ACTIVE',
      assignments: {
        create: { userId: assignedUserId, isPrimary: true },
      },
    },
  })

  redirect(`/clients/${client.slug}`)
}
