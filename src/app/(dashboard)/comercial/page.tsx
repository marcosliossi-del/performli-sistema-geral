import { Suspense } from 'react'
import { Target, TrendingUp, Flame, DollarSign } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { formatCurrency } from '@/lib/utils'
import { LeadKanban } from '@/components/comercial/LeadKanban'
import { HOT_STATUSES, KANBAN_STAGES } from '@/components/comercial/types'

export const dynamic = 'force-dynamic'

async function getLeads() {
  const leads = await prisma.agencyLead.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: {
      activities: {
        orderBy: { occurredAt: 'desc' },
        include: { user: { select: { name: true, avatarUrl: true } } },
      },
    },
  })
  return leads.map(l => ({
    ...l,
    value:       l.value ? Number(l.value) : null,
    probability: l.probability ?? null,
    expectedCloseAt: l.expectedCloseAt ? l.expectedCloseAt.toISOString() : null,
    closedAt:    l.closedAt ? l.closedAt.toISOString() : null,
    createdAt:   l.createdAt.toISOString(),
    updatedAt:   l.updatedAt.toISOString(),
    activities:  l.activities.map(a => ({
      ...a,
      occurredAt: a.occurredAt.toISOString(),
    })),
    utmSource:   l.utmSource   ?? null,
    utmMedium:   l.utmMedium   ?? null,
    utmCampaign: l.utmCampaign ?? null,
    utmContent:  l.utmContent  ?? null,
  }))
}

export default async function ComercialPage() {
  const leads = await getLeads()

  const activeLeads = leads.filter(l => KANBAN_STAGES.includes(l.status as any))
  const hotLeads    = leads.filter(l => HOT_STATUSES.includes(l.status as any))
  const pipelineVal = activeLeads.reduce((s, l) => s + (l.value ?? 0), 0)

  const allNovo        = leads.filter(l => l.status === 'NOVO').length
  const allFechado     = leads.filter(l => l.status === 'FECHADO').length
  const conversionRate = allNovo + allFechado > 0
    ? Math.round((allFechado / (allNovo + allFechado)) * 100)
    : 0

  const kpis = [
    {
      icon: Target,
      label: 'Taxa de conversão',
      value: `${conversionRate}%`,
      color: '#95BBE2',
    },
    {
      icon: Flame,
      label: 'Leads quentes',
      value: String(hotLeads.length),
      color: '#F59E0B',
    },
    {
      icon: TrendingUp,
      label: 'Leads ativos',
      value: String(activeLeads.length),
      color: '#8B5CF6',
    },
    {
      icon: DollarSign,
      label: 'Pipeline total',
      value: formatCurrency(pipelineVal),
      color: '#22C55E',
    },
  ]

  return (
    <div className="flex flex-col gap-5 p-5 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#EBEBEB]">CRM Comercial</h1>
          <p className="text-sm text-[#87919E] mt-0.5">Pipeline de vendas da agência</p>
        </div>
        <a
          href="/comercial/dashboard"
          className="text-xs text-[#87919E] hover:text-[#EBEBEB] transition-colors border border-[#38435C] rounded-lg px-3 py-1.5"
        >
          Ver dashboard
        </a>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(kpi => (
          <div key={kpi.label} className="bg-[#0D2137] border border-[#38435C] rounded-xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${kpi.color}18` }}>
              <kpi.icon size={16} style={{ color: kpi.color }} />
            </div>
            <div>
              <p className="text-xs text-[#87919E]">{kpi.label}</p>
              <p className="text-base font-bold text-[#EBEBEB]">{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Kanban */}
      <Suspense fallback={<div className="text-sm text-[#87919E]">Carregando...</div>}>
        <LeadKanban initialLeads={leads as any} />
      </Suspense>
    </div>
  )
}
