'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { getWeekRange } from '@/lib/utils'
import { generateWeeklyChecklistForManager } from '@/services/weekly-checklist-generator'
import type { ChecklistItem } from '@/services/weekly-checklist-generator'

export type ChecklistState = {
  error?: string
  success?: boolean
}

/** Toggle a single checklist item done/undone */
export async function toggleChecklistItem(
  prevState: ChecklistState,
  formData: FormData
): Promise<ChecklistState> {
  const session = await requireSession()
  const { start: weekStart } = getWeekRange()

  const itemClientId = formData.get('itemClientId') as string

  const checklist = await prisma.weeklyChecklist.findUnique({
    where: { managerId_weekStart: { managerId: session.userId, weekStart } },
  })

  if (!checklist) return { error: 'Checklist não encontrado.' }

  const items = checklist.items as ChecklistItem[]
  const updated = items.map((item) =>
    item.clientId === itemClientId ? { ...item, done: !item.done } : item
  )

  await prisma.weeklyChecklist.update({
    where: { id: checklist.id },
    data: { items: updated as object[] },
  })

  revalidatePath('/cockpit')
  return { success: true }
}

/** Force-regenerate this week's checklist */
export async function regenerateChecklist(
  prevState: ChecklistState,
  formData: FormData
): Promise<ChecklistState> {
  const session = await requireSession()

  await generateWeeklyChecklistForManager(session.userId)

  revalidatePath('/cockpit')
  return { success: true }
}
