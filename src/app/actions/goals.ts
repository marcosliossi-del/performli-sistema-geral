'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { MetricType } from '@prisma/client'

export type GoalState = {
  error?: string
  success?: boolean
}

export async function createGoal(prevState: GoalState, formData: FormData): Promise<GoalState> {
  await requireSession()

  const clientId = formData.get('clientId') as string
  const metric = formData.get('metric') as string
  const targetValue = formData.get('targetValue') as string
  const startDate = formData.get('startDate') as string
  const endDate = formData.get('endDate') as string
  const notes = formData.get('notes') as string

  if (!clientId || !metric || !targetValue || !startDate || !endDate) {
    return { error: 'Preencha todos os campos obrigatórios.' }
  }

  const target = parseFloat(targetValue)
  if (isNaN(target) || target < 0) {
    return { error: 'Valor da meta inválido.' }
  }

  const start = new Date(startDate)
  const end = new Date(endDate)
  if (end < start) {
    return { error: 'A data de fim deve ser após a data de início.' }
  }

  // Check client exists
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { slug: true },
  })
  if (!client) return { error: 'Cliente não encontrado.' }

  try {
    await prisma.goal.create({
      data: {
        clientId,
        metric: metric as MetricType,
        period: 'WEEKLY',
        targetValue: target,
        startDate: start,
        endDate: end,
        notes: notes || null,
      },
    })
  } catch (e: unknown) {
    const err = e as { code?: string }
    if (err?.code === 'P2002') {
      return { error: 'Já existe uma meta para esta métrica neste período.' }
    }
    return { error: 'Erro ao salvar meta. Tente novamente.' }
  }

  revalidatePath(`/clients/${client.slug}`)
  return { success: true }
}
