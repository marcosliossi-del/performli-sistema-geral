'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { slugify } from '@/lib/utils'
import { PipelineStage } from '@prisma/client'

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
  const email = (formData.get('email') as string)?.trim()
  const phone = (formData.get('phone') as string)?.trim()
  const document = (formData.get('document') as string)?.trim()
  const contractValueRaw = (formData.get('contractValue') as string)?.trim()
  const contractStartRaw = (formData.get('contractStart') as string)?.trim()
  const pipelineStageRaw = (formData.get('pipelineStage') as string)?.trim()

  if (!name) return { error: 'Nome do cliente é obrigatório.' }

  const slug = slugify(name)

  // Check slug uniqueness
  const existing = await prisma.client.findUnique({ where: { slug } })
  if (existing) {
    return { error: `Já existe um cliente com nome similar ("${existing.name}"). Use um nome diferente.` }
  }

  const assignedUserId = managerId || session.userId
  const pipelineStage = (pipelineStageRaw as PipelineStage) || 'ATIVO'

  const client = await prisma.client.create({
    data: {
      name,
      slug,
      industry: industry || null,
      website: website || null,
      notes: notes || null,
      email: email || null,
      phone: phone || null,
      document: document || null,
      contractValue: contractValueRaw ? parseFloat(contractValueRaw) : null,
      contractStart: contractStartRaw ? new Date(contractStartRaw) : null,
      pipelineStage,
      status: pipelineStage === 'CHURNED' ? 'CHURNED' : 'ACTIVE',
      assignments: {
        create: { userId: assignedUserId, isPrimary: true },
      },
      chat: {
        create: {},
      },
    },
  })

  redirect(`/clients/${client.slug}`)
}
