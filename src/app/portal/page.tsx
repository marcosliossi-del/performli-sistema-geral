import { Suspense } from 'react'
import { getAuthorizedClient } from '@/lib/portal/session'
import { getPortalKpis, normalizePeriod, type PortalPeriod } from '@/lib/portal/kpis'
import { KPI_REGISTRY } from '@/lib/portal/kpi-registry'
import { PeriodSelector } from '@/components/portal/PeriodSelector'
import { KpiCard } from '@/components/portal/KpiCard'
import { KpiCardSkeleton } from '@/components/portal/KpiCardSkeleton'

export const dynamic = 'force-dynamic'

const PERIOD_LABEL: Record<PortalPeriod, string> = {
  '7d': 'nos últimos 7 dias',
  '14d': 'nos últimos 14 dias',
  '30d': 'nos últimos 30 dias',
  mes_atual: 'no mês atual',
  mes_anterior: 'no mês anterior',
}

export default async function PortalDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { client } = await getAuthorizedClient()
  const { period: rawPeriod } = await searchParams
  const period = normalizePeriod(rawPeriod)

  const firstName = client.name.split(' ')[0]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#EBEBEB] sm:text-2xl">
            Olá, {firstName}
          </h1>
          <p className="mt-1 text-sm text-[#87919E]">
            Veja como sua loja está performando {PERIOD_LABEL[period]}.
          </p>
        </div>
        <PeriodSelector current={period} />
      </div>

      <Suspense fallback={<KpiGridSkeleton />}>
        <KpiSection clientId={client.id} period={period} />
      </Suspense>
    </div>
  )
}

async function KpiSection({
  clientId,
  period,
}: {
  clientId: string
  period: PortalPeriod
}) {
  // Busca UMA vez para todos os cards e distribui pelo registry.
  const data = await getPortalKpis(clientId, period)
  const updatedAt = new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {KPI_REGISTRY.map((def) => (
          <Suspense key={def.key} fallback={<KpiCardSkeleton />}>
            <KpiCard def={def} data={data.get(def.metric)} />
          </Suspense>
        ))}
      </div>
      <p className="text-right text-xs text-[#647488]">
        Atualizado em {updatedAt}
      </p>
    </div>
  )
}

function KpiGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {KPI_REGISTRY.map((def) => (
        <KpiCardSkeleton key={def.key} />
      ))}
    </div>
  )
}
