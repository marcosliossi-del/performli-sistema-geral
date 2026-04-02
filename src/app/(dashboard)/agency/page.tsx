import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireSession, getAgencyOverview } from '@/lib/dal'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { healthLabels, healthBgClasses } from '@/lib/health'
import { HealthStatus } from '@prisma/client'
import { TrendingUp, TrendingDown, Minus, Users, DollarSign, BarChart2, ShoppingCart, Heart, UserMinus } from 'lucide-react'

function HealthDot({ status }: { status: HealthStatus | null }) {
  if (!status) return <span className="w-2 h-2 rounded-full bg-[#38435C] inline-block" />
  const colors = { OTIMO: 'bg-[#22C55E]', REGULAR: 'bg-[#EAB308]', RUIM: 'bg-[#EF4444]' }
  return <span className={`w-2 h-2 rounded-full ${colors[status]} inline-block`} />
}

function RoasBadge({ roas }: { roas: number | null }) {
  if (roas === null) return <span className="text-[#87919E]">—</span>
  const color = roas >= 3 ? 'text-[#22C55E]' : roas >= 1.5 ? 'text-[#EAB308]' : 'text-[#EF4444]'
  return <span className={`font-semibold ${color}`}>{roas.toFixed(2)}x</span>
}

export default async function AgencyPage() {
  const session = await requireSession()
  if (session.role !== 'ADMIN') redirect('/dashboard')

  const data = await getAgencyOverview()
  const total = data.health.otimo + data.health.regular + data.health.ruim + data.health.unknown

  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#EBEBEB]">Visão Geral da Agência</h1>
        <p className="text-sm text-[#87919E] mt-0.5">Mês atual · todos os clientes ativos</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard
          icon={<DollarSign size={16} className="text-[#22C55E]" />}
          label="Receita Total MTD"
          value={formatCurrency(data.totalRevenue)}
          sub="fonte: GA4"
        />
        <KpiCard
          icon={<BarChart2 size={16} className="text-[#95BBE2]" />}
          label="Investimento Total MTD"
          value={formatCurrency(data.totalSpend)}
          sub="Meta + Google + TikTok"
        />
        <KpiCard
          icon={<TrendingUp size={16} className="text-[#EAB308]" />}
          label="ROAS Médio"
          value={data.weightedRoas !== null ? `${data.weightedRoas.toFixed(2)}x` : '—'}
          sub="ponderado pelo investimento"
        />
        <KpiCard
          icon={<ShoppingCart size={16} className="text-[#87919E]" />}
          label="Total de Compras"
          value={formatNumber(data.totalPurchases, 0)}
          sub={`${data.activeClients} clientes ativos`}
        />
      </div>

      {/* Health distribution */}
      <div className="bg-[#0A1E2C] border border-[#38435C] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-[#EBEBEB] mb-4">Distribuição de Saúde</h2>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {([
            { key: 'otimo',   label: 'Ótimo',   count: data.health.otimo,   color: '#22C55E', bar: 'bg-[#22C55E]' },
            { key: 'regular', label: 'Regular', count: data.health.regular, color: '#EAB308', bar: 'bg-[#EAB308]' },
            { key: 'ruim',    label: 'Ruim',    count: data.health.ruim,    color: '#EF4444', bar: 'bg-[#EF4444]' },
          ] as const).map((s) => (
            <div key={s.key} className="text-center">
              <p className="text-3xl font-bold" style={{ color: s.color }}>{s.count}</p>
              <p className="text-xs text-[#87919E] mt-0.5">{s.label}</p>
              <p className="text-[10px] text-[#87919E]">{pct(s.count)}% dos clientes</p>
            </div>
          ))}
        </div>
        {/* Bar visual */}
        <div className="h-2 rounded-full overflow-hidden flex gap-0.5">
          {data.health.otimo > 0 && (
            <div className="bg-[#22C55E] rounded-full" style={{ width: `${pct(data.health.otimo)}%` }} />
          )}
          {data.health.regular > 0 && (
            <div className="bg-[#EAB308] rounded-full" style={{ width: `${pct(data.health.regular)}%` }} />
          )}
          {data.health.ruim > 0 && (
            <div className="bg-[#EF4444] rounded-full" style={{ width: `${pct(data.health.ruim)}%` }} />
          )}
          {data.health.unknown > 0 && (
            <div className="bg-[#38435C] rounded-full" style={{ width: `${pct(data.health.unknown)}%` }} />
          )}
        </div>
        {data.health.unknown > 0 && (
          <p className="text-[10px] text-[#87919E] mt-1">{data.health.unknown} cliente(s) sem metas configuradas</p>
        )}
      </div>

      {/* Manager breakdown + At-risk */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Manager table */}
        <div className="bg-[#0A1E2C] border border-[#38435C] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[#EBEBEB] mb-4 flex items-center gap-2">
            <Users size={14} className="text-[#95BBE2]" />
            Performance por Gestor
          </h2>
          {data.byManager.length === 0 ? (
            <p className="text-sm text-[#87919E]">Nenhum gestor com clientes ativos.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[#87919E] border-b border-[#38435C]">
                    <th className="text-left pb-2">Gestor</th>
                    <th className="text-right pb-2">Clientes</th>
                    <th className="text-right pb-2">Receita</th>
                    <th className="text-right pb-2">Invest.</th>
                    <th className="text-right pb-2">ROAS</th>
                    <th className="text-right pb-2">Saúde</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#38435C]/50">
                  {data.byManager.map((m) => (
                    <tr key={m.id} className="text-[#EBEBEB]">
                      <td className="py-2 font-medium">{m.name}</td>
                      <td className="py-2 text-right text-[#87919E]">{m.clientCount}</td>
                      <td className="py-2 text-right">{m.revenue > 0 ? formatCurrency(m.revenue) : '—'}</td>
                      <td className="py-2 text-right">{m.spend > 0 ? formatCurrency(m.spend) : '—'}</td>
                      <td className="py-2 text-right"><RoasBadge roas={m.roas} /></td>
                      <td className="py-2 text-right">
                        <span className="flex items-center justify-end gap-1.5">
                          <span className="text-[#22C55E]">{m.otimo}</span>
                          <span className="text-[#87919E]">/</span>
                          <span className="text-[#EAB308]">{m.regular}</span>
                          <span className="text-[#87919E]">/</span>
                          <span className="text-[#EF4444]">{m.ruim}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* At-risk clients */}
        <div className="bg-[#0A1E2C] border border-[#38435C] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[#EBEBEB] mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#EF4444]" />
            Clientes em Risco ({data.atRiskClients.length})
          </h2>
          {data.atRiskClients.length === 0 ? (
            <p className="text-sm text-[#22C55E]">Nenhum cliente em status Ruim esta semana.</p>
          ) : (
            <div className="space-y-2">
              {data.atRiskClients.slice(0, 8).map((c) => (
                <Link
                  key={c.id}
                  href={`/clients/${c.slug}`}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#38435C]/30 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <HealthDot status={c.status} />
                    <span className="text-sm text-[#EBEBEB] group-hover:text-[#95BBE2] transition-colors">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[#87919E]">
                    {c.manager && <span>{c.manager}</span>}
                    {c.revenue > 0 && <span>{formatCurrency(c.revenue)}</span>}
                    <RoasBadge roas={c.roas} />
                  </div>
                </Link>
              ))}
              {data.atRiskClients.length > 8 && (
                <p className="text-xs text-[#87919E] text-center pt-1">+{data.atRiskClients.length - 8} clientes</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Top performers */}
      {data.topClients.length > 0 && (
        <div className="bg-[#0A1E2C] border border-[#38435C] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[#EBEBEB] mb-4 flex items-center gap-2">
            <TrendingUp size={14} className="text-[#22C55E]" />
            Top 5 — Melhor ROAS do Mês
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#87919E] border-b border-[#38435C]">
                  <th className="text-left pb-2">#</th>
                  <th className="text-left pb-2">Cliente</th>
                  <th className="text-right pb-2">Receita</th>
                  <th className="text-right pb-2">Investimento</th>
                  <th className="text-right pb-2">ROAS</th>
                  <th className="text-right pb-2">Gestor</th>
                  <th className="text-right pb-2">Saúde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#38435C]/50">
                {data.topClients.map((c, i) => (
                  <tr key={c.id} className="text-[#EBEBEB]">
                    <td className="py-2 text-[#87919E]">{i + 1}</td>
                    <td className="py-2">
                      <Link href={`/clients/${c.slug}`} className="hover:text-[#95BBE2] transition-colors font-medium">
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-2 text-right">{c.revenue > 0 ? formatCurrency(c.revenue) : '—'}</td>
                    <td className="py-2 text-right">{c.spend > 0 ? formatCurrency(c.spend) : '—'}</td>
                    <td className="py-2 text-right"><RoasBadge roas={c.roas} /></td>
                    <td className="py-2 text-right text-[#87919E]">{c.manager ?? '—'}</td>
                    <td className="py-2 text-right">
                      <span className="flex items-center justify-end gap-1.5">
                        <HealthDot status={c.status} />
                        <span className="text-[#87919E]">{c.status ? healthLabels[c.status] : '—'}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* LTV & Churn Rate */}
      <div className="grid grid-cols-2 gap-4">
        {/* LTV */}
        <div className="bg-[#0A1E2C] border border-[#38435C] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Heart size={16} className="text-[#95BBE2]" />
            <h2 className="text-sm font-semibold text-[#EBEBEB]">LTV — Valor dos Contratos</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-[#87919E] mb-1">LTV Total da Base</p>
              <p className="text-2xl font-bold text-[#EBEBEB]">{formatCurrency(data.totalLTV)}</p>
              <p className="text-[10px] text-[#87919E] mt-1">soma dos contratos ativos</p>
            </div>
            <div>
              <p className="text-xs text-[#87919E] mb-1">LTV Médio por Cliente</p>
              <p className="text-2xl font-bold text-[#EBEBEB]">
                {data.avgLTV !== null ? formatCurrency(data.avgLTV) : '—'}
              </p>
              <p className="text-[10px] text-[#87919E] mt-1">clientes com contrato cadastrado</p>
            </div>
          </div>
        </div>

        {/* Churn Rate */}
        <div className="bg-[#0A1E2C] border border-[#38435C] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <UserMinus size={16} className="text-[#EF4444]" />
            <h2 className="text-sm font-semibold text-[#EBEBEB]">Churn Rate</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-[#87919E] mb-1">Taxa de Churn</p>
              <p className={`text-2xl font-bold ${data.churnRate !== null && data.churnRate > 20 ? 'text-[#EF4444]' : data.churnRate !== null && data.churnRate > 10 ? 'text-[#EAB308]' : 'text-[#22C55E]'}`}>
                {data.churnRate !== null ? `${data.churnRate}%` : '—'}
              </p>
              <p className="text-[10px] text-[#87919E] mt-1">churned / total histórico</p>
            </div>
            <div>
              <p className="text-xs text-[#87919E] mb-1">Churned Total</p>
              <p className="text-2xl font-bold text-[#EF4444]">{data.churnedClients}</p>
              <p className="text-[10px] text-[#87919E] mt-1">clientes perdidos</p>
            </div>
            <div>
              <p className="text-xs text-[#87919E] mb-1">Churn este mês</p>
              <p className={`text-2xl font-bold ${data.churnedThisMonth > 0 ? 'text-[#EF4444]' : 'text-[#22C55E]'}`}>
                {data.churnedThisMonth}
              </p>
              <p className="text-[10px] text-[#87919E] mt-1">saídas no mês atual</p>
            </div>
          </div>
        </div>
      </div>

      {/* All clients link */}
      <div className="flex justify-end">
        <Link href="/clients" className="text-sm text-[#95BBE2] hover:text-[#95BBE2]/80 transition-colors">
          Ver todos os clientes →
        </Link>
      </div>
    </div>
  )
}

function KpiCard({ icon, label, value, sub }: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="bg-[#0A1E2C] border border-[#38435C] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className="text-[10px] font-medium text-[#87919E] uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-bold text-[#EBEBEB]">{value}</p>
      <p className="text-[10px] text-[#87919E] mt-1">{sub}</p>
    </div>
  )
}
