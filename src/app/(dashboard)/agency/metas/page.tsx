import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import { MetasBulkTable } from '@/components/agency/MetasBulkTable'
import { MetasDashboard } from '@/components/agency/MetasDashboard'
import { fetchMonthProgress } from '@/app/actions/progress'
import { MetasPageTabs } from '@/components/agency/MetasPageTabs'
import { SyncWeeklyGoalsButton } from '@/components/agency/SyncWeeklyGoalsButton'
import { normalizeRole, can, stripSensitive } from '@/lib/rbac'
import { LOCAL_RESULT_METRICS } from '@/lib/metas/metricOptions'
import type { MetricType } from '@prisma/client'

export const dynamic = 'force-dynamic'

export default async function MetasPage() {
  const session = await requireSession()
  const role = normalizeRole(session.role)
  // RBAC v2: metas — GESTOR não vê (matriz gestaoEquipeMetas: NONE → redirect);
  // ADMIN vê tudo; SUPERVISOR/ANALISTA/CS leem SEM metas de receita (strip).
  if (!can(role, 'view', 'gestaoEquipeMetas')) redirect('/cockpit')

  const now = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() // 0-indexed

  const monthStart = new Date(year, month, 1)
  const monthEnd   = new Date(year, month + 1, 0)
  const prevStart  = new Date(year, month - 1, 1)
  const prevEnd    = new Date(year, month, 0)

  // Fetch data for both views in parallel
  const [clients, progress, prevHealthScores] = await Promise.all([
    prisma.client.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        businessType: true,
        assignments: {
          where: { isPrimary: true },
          select: { user: { select: { name: true } } },
          take: 1,
        },
        goals: {
          where: {
            period: 'MONTHLY',
            startDate: { lte: monthEnd },
            endDate:   { gte: monthStart },
            metric: {
              in: ['FATURAMENTO', 'ROAS', 'SPEND', 'CPL', 'CPA', ...LOCAL_RESULT_METRICS.map((m) => m.value)],
            },
          },
          orderBy: { updatedAt: 'asc' },
          select: { metric: true, targetValue: true },
        },
      },
    }),
    fetchMonthProgress(year, month),
    prisma.healthScore.findMany({
      where: {
        metric: 'TICKET_MEDIO',
        period: 'MONTHLY',
        periodStart: { gte: prevStart, lte: prevEnd },
      },
      select: { clientId: true, actualValue: true },
    }),
  ])

  const prevTicket = new Map(
    prevHealthScores.map((hs) => [hs.clientId, Number(hs.actualValue)])
  )

  const localResultSet = new Set<MetricType>(LOCAL_RESULT_METRICS.map((m) => m.value))

  const clientsData = clients.map((c) => {
    const fat   = c.goals.find((g) => g.metric === 'FATURAMENTO')
    const roas  = c.goals.find((g) => g.metric === 'ROAS')
    const spend = c.goals.find((g) => g.metric === 'SPEND')
    const cpl   = c.goals.find((g) => g.metric === 'CPL')
    const cpa   = c.goals.find((g) => g.metric === 'CPA')
    // Métrica-resultado PRINCIPAL do cliente local/B2B (default por cliente): a
    // meta não-taxa existente no mês. c.goals já vem em orderBy updatedAt asc, o
    // último match é o mais recente e prevalece.
    let localMetric: MetricType | null = null
    let localValue: number | null = null
    for (const g of c.goals) {
      if (localResultSet.has(g.metric)) {
        localMetric = g.metric
        localValue  = Number(g.targetValue)
      }
    }
    const tm    = prevTicket.get(c.id) ?? null
    // Meta de FATURAMENTO é RECEITA (REVENUE_METRICS): oculta para não-ADMIN via
    // stripSensitive('Goal'). Metas operacionais ficam.
    const fatStripped = fat
      ? stripSensitive(role, 'Goal', { metric: 'FATURAMENTO', targetValue: Number(fat.targetValue) })
      : null
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      businessType: c.businessType,
      managerName: c.assignments[0]?.user?.name ?? '—',
      goals: {
        FATURAMENTO: fatStripped && 'targetValue' in fatStripped ? (fatStripped.targetValue as number) : null,
        ROAS:        roas  ? Number(roas.targetValue)  : null,
        SPEND:       spend ? Number(spend.targetValue) : null,
        CPL:         cpl   ? Number(cpl.targetValue)   : null,
        CPA:         cpa   ? Number(cpa.targetValue)   : null,
        localMetric,
        localValue,
      },
      suggestedCpa:    tm != null ? Math.round(tm * 0.10 * 100) / 100 : null,
      prevTicketMedio: tm,
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#EBEBEB]">Metas Mensais</h1>
          <p className="text-[#87919E] text-sm mt-0.5">
            Acompanhe o progresso de cada cliente e defina metas com auto-cálculo de ROAS e CPA.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <SyncWeeklyGoalsButton />
          <p className="text-[10px] text-[#87919E] max-w-xs text-right">
            Cria metas semanais a partir das mensais para o health score funcionar por semana
          </p>
        </div>
      </div>
      <MetasPageTabs
        clientsData={clientsData}
        progress={progress}
        initialYear={year}
        initialMonth={month}
      />
    </div>
  )
}
