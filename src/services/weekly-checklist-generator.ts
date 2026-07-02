/**
 * Weekly Checklist Generator
 *
 * Toda segunda-feira gera um checklist personalizado para cada gestor,
 * listando ações prioritárias baseadas nos clientes em RUIM/REGULAR.
 */

import { prisma } from '@/lib/prisma'
import { getWeekRange } from '@/lib/utils'

export type ChecklistItem = {
  id: string
  clientId: string
  clientName: string
  clientSlug: string
  status: 'RUIM' | 'REGULAR' | 'OTIMO'
  tasks: string[]
  done: boolean
}

async function buildChecklistItemsForManager(
  managerId: string,
  weekStart: Date
): Promise<ChecklistItem[]> {
  const prevWeekStart = new Date(weekStart)
  prevWeekStart.setDate(prevWeekStart.getDate() - 7)

  const clients = await prisma.client.findMany({
    where: {
      status: 'ACTIVE',
      assignments: { some: { userId: managerId } },
    },
    include: {
      healthScores: {
        where: { periodStart: { gte: weekStart } },
        orderBy: { calculatedAt: 'desc' },
      },
      goals: {
        where: {
          period: 'MONTHLY',
          metric: { in: ['SPEND', 'INVESTMENT'] },
        },
        select: { targetValue: true },
        take: 1,
      },
      metricSnapshots: {
        where: {
          date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
        select: { spend: true },
      },
    },
  })

  const items: ChecklistItem[] = []

  for (const client of clients) {
    const scores = client.healthScores
    if (scores.length === 0) continue

    const overallStatus =
      scores.some((s) => s.status === 'RUIM')
        ? 'RUIM'
        : scores.some((s) => s.status === 'REGULAR')
        ? 'REGULAR'
        : 'OTIMO'

    // Só inclui clientes que precisam de atenção
    if (overallStatus === 'OTIMO') continue

    const tasks: string[] = []

    // Métricas em RUIM
    const ruimMetrics = scores
      .filter((s) => s.status === 'RUIM')
      .map((s) => {
        const pct = Math.round(Number(s.achievementPct))
        return `Revisar ${s.metric}: ${pct}% da meta`
      })

    tasks.push(...ruimMetrics.slice(0, 3))

    // Budget alert
    if (client.goals.length > 0 && client.metricSnapshots.length > 0) {
      const budget = Number(client.goals[0].targetValue)
      const spent = client.metricSnapshots.reduce((s, x) => s + Number(x.spend ?? 0), 0)
      const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0
      if (pct >= 80) {
        tasks.push(`⚠️ Budget: ${pct}% consumido no mês`)
      }
    }

    // Task padrão se não houver nada específico
    if (tasks.length === 0) {
      tasks.push('Analisar performance e ajustar campanhas')
    }

    items.push({
      id: client.id,
      clientId: client.id,
      clientName: client.name,
      clientSlug: client.slug,
      status: overallStatus,
      tasks,
      done: false,
    })
  }

  // Ordena: RUIM primeiro, depois REGULAR
  items.sort((a, b) => {
    if (a.status === 'RUIM' && b.status !== 'RUIM') return -1
    if (a.status !== 'RUIM' && b.status === 'RUIM') return 1
    return a.clientName.localeCompare(b.clientName)
  })

  return items
}

export async function generateWeeklyChecklistForManager(managerId: string): Promise<{
  created: boolean
  itemCount: number
}> {
  const { start: weekStart } = getWeekRange()

  const items = await buildChecklistItemsForManager(managerId, weekStart)

  await prisma.weeklyChecklist.upsert({
    where: { managerId_weekStart: { managerId, weekStart } },
    create: { managerId, weekStart, items: items as object[] },
    update: { items: items as object[], updatedAt: new Date() },
  })

  return { created: true, itemCount: items.length }
}

export async function generateAllWeeklyChecklists(): Promise<{
  managersProcessed: number
  totalItems: number
}> {
  const managers = await prisma.user.findMany({
    where: {
      active: true,
      role: { in: ['GESTOR_TRAFEGO', 'MANAGER', 'ADMIN'] },
    },
    select: { id: true },
  })

  let totalItems = 0
  for (const manager of managers) {
    // Resiliência: falha em um gestor não pode quebrar a rotina inteira.
    try {
      const result = await generateWeeklyChecklistForManager(manager.id)
      totalItems += result.itemCount
    } catch (err) {
      console.error(`[generateAllWeeklyChecklists] falha no gestor ${manager.id}:`, err)
    }
  }

  return { managersProcessed: managers.length, totalItems }
}
