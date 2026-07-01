'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { assertClientMutationAccess, writeAuditLog } from '@/lib/audit'
import { slugify } from '@/lib/utils'
import { BusinessType } from '@prisma/client'

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
    source?: string | null
    businessType?: BusinessType | null
  }
): Promise<UpdateClientState> {
  const session = await requireSession()

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { slug: true, name: true } })
  if (!client) return { error: 'Cliente não encontrado.' }

  try {
    await assertClientMutationAccess(session, clientId)
  } catch (e) {
    return { error: (e as Error).message }
  }

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
  if ('source' in data) updateData.source = data.source ?? null
  if ('businessType' in data && data.businessType != null) updateData.businessType = data.businessType

  const updated = await prisma.client.update({ where: { id: clientId }, data: updateData })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'client.update',
    entityType: 'Client',
    entityId: clientId,
    clientId,
    metadata: { fields: Object.keys(updateData) },
  })

  revalidatePath(`/clients/${updated.slug}`)
  revalidatePath('/clients')
  return { success: true, slug: updated.slug }
}

export async function bulkSetBusinessType(
  clientIds: string[],
  businessType: BusinessType
): Promise<{ updated: number; error?: string }> {
  const session = await requireSession()
  if (clientIds.length === 0) return { updated: 0 }

  // Posse: só altera clientes que o papel permite mutar (ADMIN todos; MANAGER só atribuídos).
  try {
    for (const id of clientIds) {
      await assertClientMutationAccess(session, id)
    }
  } catch (e) {
    return { updated: 0, error: (e as Error).message }
  }

  await prisma.client.updateMany({
    where: { id: { in: clientIds } },
    data:  { businessType },
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'client.bulk_business_type',
    entityType: 'Client',
    entityId: clientIds.join(','),
    metadata: { businessType, count: clientIds.length },
  })

  revalidatePath('/clients')
  return { updated: clientIds.length }
}

export async function deleteClient(clientId: string): Promise<UpdateClientState> {
  const session = await requireSession()
  if (session.role !== 'ADMIN') return { error: 'Sem permissão.' }

  await prisma.client.delete({ where: { id: clientId } })
  revalidatePath('/clients')
  redirect('/clients')
}
