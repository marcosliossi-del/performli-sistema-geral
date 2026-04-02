'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { slugify } from '@/lib/utils'

export type UpdateClientState = { error?: string; success?: boolean; slug?: string }

export async function updateClient(
  clientId: string,
  data: {
    name?: string
    industry?: string | null
    website?: string | null
    notes?: string | null
    email?: string | null
    phone?: string | null
    document?: string | null
    contractValue?: number | null
    contractStart?: Date | null
  }
): Promise<UpdateClientState> {
  await requireSession()

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { slug: true, name: true } })
  if (!client) return { error: 'Cliente não encontrado.' }

  const updateData: Record<string, unknown> = {}

  if (data.name !== undefined && data.name.trim()) {
    updateData.name = data.name.trim()
    // Only reslug if name changed
    if (data.name.trim() !== client.name) {
      const newSlug = slugify(data.name.trim())
      const conflict = await prisma.client.findFirst({ where: { slug: newSlug, NOT: { id: clientId } } })
      if (conflict) return { error: 'Já existe um cliente com esse nome.' }
      updateData.slug = newSlug
    }
  }
  if ('industry' in data) updateData.industry = data.industry ?? null
  if ('website' in data) updateData.website = data.website ?? null
  if ('notes' in data) updateData.notes = data.notes ?? null
  if ('email' in data) updateData.email = data.email ?? null
  if ('phone' in data) updateData.phone = data.phone ?? null
  if ('document' in data) updateData.document = data.document ?? null
  if ('contractValue' in data) updateData.contractValue = data.contractValue ?? null
  if ('contractStart' in data) updateData.contractStart = data.contractStart ?? null

  const updated = await prisma.client.update({ where: { id: clientId }, data: updateData })

  revalidatePath(`/clients/${updated.slug}`)
  revalidatePath('/clients')
  return { success: true, slug: updated.slug }
}

export async function deleteClient(clientId: string): Promise<UpdateClientState> {
  const session = await requireSession()
  if (session.role !== 'ADMIN') return { error: 'Sem permissão.' }

  await prisma.client.delete({ where: { id: clientId } })
  revalidatePath('/clients')
  redirect('/clients')
}
