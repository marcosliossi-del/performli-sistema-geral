import { Suspense } from 'react'
import { getAuthorizedClient } from '@/lib/portal/session'
import {
  getPortalKpis,
  getPortalProjection,
  getPortalFunnel,
  normalizePeriod,
  type PortalPeriod,
} from '@/lib/portal/kpis'
import { KPI_REGISTRY } from '@/lib/portal/kpi-registry'
import { PeriodSelector } from '@/components/portal/PeriodSelector'
import { KpiCard } from '@/components/portal/KpiCard'
import { KpiCardSkeleton } from '@/components/portal/KpiCardSkeleton'
import { ProjectionCard } from '@/components/portal/ProjectionCard'
import { FunnelSection } from '@/components/portal/FunnelSection'
import { ComingSoonNote } from '@/components/portal/ComingSoonNote'

export const dynamic = 'force-dynamic'

const PERIOD_LABEL: Record<PortalPeriod, string> = {
  '7d': 'Últimos 7 dias',
  '14d': 'Últimos 14 dias',
  '30d': 'Últimos 30 dias',
  mes_atual: 'Mês atual',
  mes_anterior: 'Mês anterior',
}

/**
 * KPIs de CUSTO onde MENOR é melhor: a seta para baixo (queda) deve pintar
 * VERDE e a alta VERMELHO. O KpiCard inverte a semântica de cor via
 * `lowerIsBetter`. Hoje só o CPS (custo por visita).
 */
const LOWER_IS_BETTER = new Set(['cps'])

/**
 * KPIs sem juízo de valor no delta: variação mostrada em cinza neutro. Para o
 * lojista, gastar mais ou menos em anúncios não é intrinsecamente bom nem ruim
 * (depende da estratégia) — pintar de verde uma alta de investimento seria
 * enganoso. Por isso o delta do Investimento é neutro.
 */
const NEUTRAL_DELTA = new Set(['investimento'])

export default async function PortalDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { client } = await getAuthorizedClient()
  const { period: rawPeriod } = await searchParams
  const period = normalizePeriod(rawPeriod)

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[#647488]">
            {client.name}
          </p>
          <h1 className="mt-0.5 text-xl font-bold text-[#EBEBEB] sm:text-2xl">
            Painel de análise
          </h1>
          <p className="mt-1 text-sm text-[#87919E]">
            {PERIOD_LABEL[period]} — como sua loja está performando.
          </p>
        </div>
        <PeriodSelector current={period} />
      </header>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardSection clientId={client.id} period={period} />
      </Suspense>
    </div>
  )
}

async function DashboardSection({
  clientId,
  period,
}: {
  clientId: string
  period: PortalPeriod
}) {
  // clientId vem SEMPRE da sessão (getAuthorizedClient), nunca de param/query.
  // Busca as três fontes em paralelo. Projeção INDEPENDE do período (mês atual).
  const [kpis, projection, funnel] = await Promise.all([
    getPortalKpis(clientId, period),
    getPortalProjection(clientId),
    getPortalFunnel(clientId, period),
  ])

  const updatedAt = new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="space-y-6">
      {/* Grid de KPIs na ORDEM do registry (Projeção encaixa como standalone). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {KPI_REGISTRY.map((def) =>
          def.standalone ? (
            <ProjectionCard key={def.key} def={def} data={projection} />
          ) : (
            <KpiCard
              key={def.key}
              def={def}
              data={kpis.get(def.key)}
              lowerIsBetter={LOWER_IS_BETTER.has(def.key)}
              neutralDelta={NEUTRAL_DELTA.has(def.key)}
            />
          ),
        )}
      </div>

      <FunnelSection funnel={funnel} />

      <ComingSoonNote />

      {/* Regra 10 do CLAUDE.md: tela com dado crítico mostra última atualização. */}
      <p className="text-right text-xs text-[#647488]">Atualizado em {updatedAt}</p>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {KPI_REGISTRY.map((def) => (
          <KpiCardSkeleton key={def.key} />
        ))}
      </div>
      <div
        className="h-56 animate-pulse rounded-2xl border border-[#38435C] bg-[#0A1E2C]"
        aria-busy="true"
        aria-label="Carregando funil de vendas"
      />
    </div>
  )
}
