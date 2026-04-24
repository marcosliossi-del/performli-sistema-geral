import { ArrowLeft, Target, Flame, DollarSign, TrendingUp, Clock, BarChart2, Users, CheckCircle, XCircle } from 'lucide-react'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { formatCurrency } from '@/lib/utils'
import { KANBAN_STAGES, STAGE_CONFIG, HOT_STATUSES } from '@/components/comercial/types'
import type { LeadStatus } from '@/components/comercial/types'

export const dynamic = 'force-dynamic'

async function getCrmData() {
  const leads = await prisma.agencyLead.findMany({
    where: { deletedAt: null },
    select: {
      status:          true,
      value:           true,
      probability:     true,
      createdAt:       true,
      closedAt:        true,
      expectedCloseAt: true,
      source:          true,
      utmSource:       true,
      utmMedium:       true,
      utmCampaign:     true,
    },
  })

  return leads.map(l => ({
    ...l,
    value:       l.value ? Number(l.value) : null,
    createdAt:   l.createdAt,
    closedAt:    l.closedAt,
    expectedCloseAt: l.expectedCloseAt,
  }))
}

export default async function ComercialDashboardPage() {
  const leads = await getCrmData()

  // Funnel counts
  const funnelCounts = KANBAN_STAGES.map(s => ({
    status: s,
    count:  leads.filter(l => l.status === s).length,
    value:  leads.filter(l => l.status === s).reduce((sum, l) => sum + (l.value ?? 0), 0),
  }))

  const fechados = leads.filter(l => l.status === 'FECHADO')
  const perdidos = leads.filter(l => l.status === 'PERDIDO')
  const hot      = leads.filter(l => HOT_STATUSES.includes(l.status as LeadStatus))
  const active   = leads.filter(l => KANBAN_STAGES.includes(l.status as LeadStatus))

  const pipelineTotal = active.reduce((s, l) => s + (l.value ?? 0), 0)
  const fechadoTotal  = fechados.reduce((s, l) => s + (l.value ?? 0), 0)

  // Conversion
  const convBase = leads.filter(l => l.status === 'NOVO' || l.status === 'FECHADO').length
  const convRate = convBase > 0 ? Math.round((fechados.length / convBase) * 100) : 0

  // Average cycle (days from createdAt to closedAt for FECHADO)
  const cicloMedio = fechados.filter(l => l.closedAt).length > 0
    ? Math.round(
        fechados
          .filter(l => l.closedAt)
          .reduce((s, l) => {
            const diff = new Date(l.closedAt!).getTime() - new Date(l.createdAt).getTime()
            return s + diff / (1000 * 60 * 60 * 24)
          }, 0) / fechados.filter(l => l.closedAt).length,
      )
    : 0

  // Weighted pipeline (value × probability)
  const weightedPipeline = active
    .filter(l => l.probability != null)
    .reduce((s, l) => s + (l.value ?? 0) * ((l.probability ?? 0) / 100), 0)

  // Campaign attribution
  const campaignMap = new Map<string, { leads: number; fechados: number; perdidos: number; value: number }>()
  leads.forEach(l => {
    const key = l.utmCampaign ?? (l.utmSource ? `[${l.utmSource}]` : null)
    if (!key) return
    const curr = campaignMap.get(key) ?? { leads: 0, fechados: 0, perdidos: 0, value: 0 }
    curr.leads++
    if (l.status === 'FECHADO') { curr.fechados++; curr.value += l.value ?? 0 }
    if (l.status === 'PERDIDO') curr.perdidos++
    campaignMap.set(key, curr)
  })
  const campaignStats = Array.from(campaignMap.entries())
    .map(([name, d]) => ({
      name,
      ...d,
      convRate: d.leads > 0 ? Math.round((d.fechados / d.leads) * 100) : 0,
    }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 10)

  // Source breakdown
  const sourceCounts: Record<string, number> = {}
  leads.forEach(l => {
    const src = l.source ?? 'Não informado'
    sourceCounts[src] = (sourceCounts[src] ?? 0) + 1
  })
  const topSources = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)

  const maxFunnel = Math.max(...funnelCounts.map(f => f.count), 1)

  const kpis = [
    { icon: Target,      label: 'Taxa de conversão',     value: `${convRate}%`,              color: '#95BBE2' },
    { icon: Flame,       label: 'Leads quentes',          value: String(hot.length),           color: '#F59E0B' },
    { icon: DollarSign,  label: 'Pipeline total',         value: formatCurrency(pipelineTotal), color: '#22C55E' },
    { icon: CheckCircle, label: 'Receita fechada',        value: formatCurrency(fechadoTotal),  color: '#22C55E' },
    { icon: TrendingUp,  label: 'Pipeline ponderado',     value: formatCurrency(weightedPipeline), color: '#8B5CF6' },
    { icon: Users,       label: 'Total de leads',         value: String(leads.length),         color: '#3B82F6' },
    { icon: Clock,       label: 'Ciclo médio (dias)',     value: cicloMedio > 0 ? String(cicloMedio) : '–', color: '#F59E0B' },
    { icon: XCircle,     label: 'Perdidos',               value: String(perdidos.length),      color: '#EF4444' },
  ]

  return (
    <div className="flex flex-col gap-6 p-5 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/comercial" className="text-[#87919E] hover:text-[#EBEBEB] transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-[#EBEBEB]">Dashboard Comercial</h1>
          <p className="text-sm text-[#87919E] mt-0.5">Visão analítica do pipeline</p>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map(kpi => (
          <div key={kpi.label} className="bg-[#0D2137] border border-[#38435C] rounded-xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${kpi.color}18` }}>
              <kpi.icon size={16} style={{ color: kpi.color }} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-[#87919E] leading-tight">{kpi.label}</p>
              <p className="text-base font-bold text-[#EBEBEB] truncate">{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Funnel */}
        <div className="bg-[#0D2137] border border-[#38435C] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-5">
            <BarChart2 size={15} className="text-[#87919E]" />
            <h2 className="text-sm font-semibold text-[#EBEBEB]">Funil de conversão</h2>
          </div>
          <div className="space-y-3">
            {funnelCounts.map((stage, idx) => {
              const cfg = STAGE_CONFIG[stage.status]
              const pct = Math.round((stage.count / maxFunnel) * 100)
              const prevCount = idx > 0 ? funnelCounts[idx - 1].count : stage.count
              const dropRate = prevCount > 0 && idx > 0
                ? Math.round(((prevCount - stage.count) / prevCount) * 100)
                : null

              return (
                <div key={stage.status}>
                  {dropRate !== null && dropRate > 0 && (
                    <div className="flex items-center gap-2 mb-1 pl-1">
                      <div className="w-px h-3 bg-[#38435C] ml-1" />
                      <span className="text-[10px] text-[#EF4444]">−{dropRate}% drop</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-[#87919E] w-32 truncate flex-shrink-0">{cfg.label}</span>
                    <div className="flex-1 h-6 bg-[#38435C]/30 rounded-lg overflow-hidden">
                      <div
                        className="h-full rounded-lg flex items-center justify-end pr-2 transition-all"
                        style={{
                          width:      `${Math.max(pct, 4)}%`,
                          background: cfg.color,
                          opacity:    0.7 + 0.3 * (1 - idx / funnelCounts.length),
                        }}
                      >
                        {stage.count > 0 && (
                          <span className="text-[10px] font-bold text-white">{stage.count}</span>
                        )}
                      </div>
                    </div>
                    {stage.value > 0 && (
                      <span className="text-[10px] text-[#87919E] w-20 text-right flex-shrink-0">
                        {formatCurrency(stage.value)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Closed / lost */}
            <div className="border-t border-[#38435C] pt-3 grid grid-cols-2 gap-3 mt-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
                <span className="text-xs text-[#87919E]">Fechados</span>
                <span className="text-xs font-semibold text-[#22C55E] ml-auto">{fechados.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#EF4444]" />
                <span className="text-xs text-[#87919E]">Perdidos</span>
                <span className="text-xs font-semibold text-[#EF4444] ml-auto">{perdidos.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sources */}
        <div className="bg-[#0D2137] border border-[#38435C] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-5">
            <Users size={15} className="text-[#87919E]" />
            <h2 className="text-sm font-semibold text-[#EBEBEB]">Origens dos leads</h2>
          </div>
          {topSources.length === 0 ? (
            <p className="text-xs text-[#87919E] text-center py-6">Nenhum dado disponível</p>
          ) : (
            <div className="space-y-3">
              {topSources.map(([src, count]) => {
                const pct = Math.round((count / leads.length) * 100)
                return (
                  <div key={src} className="flex items-center gap-3">
                    <span className="text-xs text-[#87919E] w-28 truncate flex-shrink-0">{src}</span>
                    <div className="flex-1 h-5 bg-[#38435C]/30 rounded-lg overflow-hidden">
                      <div
                        className="h-full bg-[#95BBE2]/60 rounded-lg flex items-center justify-end pr-2"
                        style={{ width: `${Math.max(pct, 4)}%` }}
                      >
                        <span className="text-[10px] font-bold text-white">{count}</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-[#87919E] w-8 text-right flex-shrink-0">{pct}%</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Campaign attribution */}
      <div className="bg-[#0D2137] border border-[#38435C] rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-5">
          <BarChart2 size={15} className="text-[#87919E]" />
          <h2 className="text-sm font-semibold text-[#EBEBEB]">Atribuição de campanhas</h2>
        </div>
        {campaignStats.length === 0 ? (
          <p className="text-xs text-[#87919E] text-center py-6">Nenhum lead com UTM de campanha registrado</p>
        ) : (
          <>
            {/* Bar chart */}
            <div className="space-y-2 mb-5">
              {campaignStats.map(camp => {
                const maxLeads = campaignStats[0].leads
                const pct = Math.round((camp.leads / maxLeads) * 100)
                return (
                  <div key={camp.name} className="flex items-center gap-3">
                    <span className="text-xs text-[#87919E] w-36 truncate flex-shrink-0">{camp.name}</span>
                    <div className="flex-1 h-5 bg-[#38435C]/30 rounded-lg overflow-hidden">
                      <div
                        className="h-full bg-[#95BBE2]/60 rounded-lg flex items-center justify-end pr-2"
                        style={{ width: `${Math.max(pct, 4)}%` }}
                      >
                        <span className="text-[10px] font-bold text-white">{camp.leads}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[#87919E] border-b border-[#38435C]">
                    <th className="text-left py-2 font-medium">Campanha</th>
                    <th className="text-center py-2 font-medium">Leads</th>
                    <th className="text-center py-2 font-medium">Fechados</th>
                    <th className="text-center py-2 font-medium">Perdidos</th>
                    <th className="text-right py-2 font-medium">Taxa conv.</th>
                    <th className="text-right py-2 font-medium">Valor fechado</th>
                  </tr>
                </thead>
                <tbody>
                  {campaignStats.map(camp => (
                    <tr key={camp.name} className="border-b border-[#38435C]/50 hover:bg-[#38435C]/10 transition-colors">
                      <td className="py-2.5 text-[#EBEBEB] truncate max-w-[160px]">{camp.name}</td>
                      <td className="py-2.5 text-center text-[#EBEBEB]">{camp.leads}</td>
                      <td className="py-2.5 text-center text-[#22C55E]">{camp.fechados}</td>
                      <td className="py-2.5 text-center text-[#EF4444]">{camp.perdidos}</td>
                      <td className="py-2.5 text-right text-[#87919E]">{camp.convRate}%</td>
                      <td className="py-2.5 text-right text-[#EBEBEB]">
                        {camp.value > 0 ? formatCurrency(camp.value) : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Stage value breakdown table */}
      <div className="bg-[#0D2137] border border-[#38435C] rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-[#EBEBEB] mb-4">Valor por estágio</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[#87919E] border-b border-[#38435C]">
                <th className="text-left py-2 font-medium">Estágio</th>
                <th className="text-center py-2 font-medium">Leads</th>
                <th className="text-right py-2 font-medium">Valor total</th>
                <th className="text-right py-2 font-medium">Ticket médio</th>
                <th className="text-right py-2 font-medium">Pipeline pond.</th>
              </tr>
            </thead>
            <tbody>
              {funnelCounts.map(stage => {
                const cfg = STAGE_CONFIG[stage.status]
                const stageLeads = leads.filter(l => l.status === stage.status)
                const withValue  = stageLeads.filter(l => l.value)
                const ticket     = withValue.length > 0 ? stage.value / withValue.length : 0
                const weighted   = stageLeads
                  .filter(l => l.probability != null)
                  .reduce((s, l) => s + (l.value ?? 0) * ((l.probability ?? 0) / 100), 0)

                return (
                  <tr key={stage.status} className="border-b border-[#38435C]/50 hover:bg-[#38435C]/10 transition-colors">
                    <td className="py-2.5">
                      <span className="font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
                    </td>
                    <td className="py-2.5 text-center text-[#EBEBEB]">{stage.count}</td>
                    <td className="py-2.5 text-right text-[#EBEBEB]">
                      {stage.value > 0 ? formatCurrency(stage.value) : '–'}
                    </td>
                    <td className="py-2.5 text-right text-[#87919E]">
                      {ticket > 0 ? formatCurrency(ticket) : '–'}
                    </td>
                    <td className="py-2.5 text-right text-[#87919E]">
                      {weighted > 0 ? formatCurrency(weighted) : '–'}
                    </td>
                  </tr>
                )
              })}
              <tr className="font-semibold">
                <td className="py-2.5 text-[#EBEBEB]">Total ativo</td>
                <td className="py-2.5 text-center text-[#EBEBEB]">{active.length}</td>
                <td className="py-2.5 text-right text-[#22C55E]">{formatCurrency(pipelineTotal)}</td>
                <td className="py-2.5 text-right" />
                <td className="py-2.5 text-right text-[#8B5CF6]">{formatCurrency(weightedPipeline)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
