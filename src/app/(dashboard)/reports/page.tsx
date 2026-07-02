import { requireSession, getClientsForSelect, getReportData, getWeekOptions } from '@/lib/dal'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardValue } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { BarChart3, ChevronLeft, ChevronRight } from 'lucide-react'
import { healthLabels } from '@/lib/health'
import { HealthStatus } from '@prisma/client'
import Link from 'next/link'
import { ReportClientSelect } from '@/components/reports/ReportClientSelect'

interface Props {
  searchParams: Promise<{ clientId?: string; weekOffset?: string }>
}

function fmtValue(value: number, unit: string) {
  if (unit === 'R$') return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (unit === 'x') return `${value.toFixed(2)}x`
  if (unit === '%') return `${value.toFixed(2)}%`
  return value.toLocaleString('pt-BR')
}

export default async function ReportsPage({ searchParams }: Props) {
  const { userId, role } = await requireSession()
  const params = await searchParams

  const clientId   = params.clientId ?? ''
  const weekOffset = Number(params.weekOffset ?? '0')

  const weekOptions = getWeekOptions(8)
  const selectedWeek = weekOptions.find((w) => w.offset === weekOffset) ?? weekOptions[0]

  const [clients, reportData] = await Promise.all([
    getClientsForSelect(userId, role),
    clientId ? getReportData(clientId, selectedWeek.start, selectedWeek.end, { userId, role }) : null,
  ])

  const prevOffset = weekOffset - 1
  const nextOffset = weekOffset + 1 <= 0 ? weekOffset + 1 : null

  function weekUrl(offset: number) {
    return `/reports?clientId=${clientId}&weekOffset=${offset}`
  }

  const overallStatus: HealthStatus | null = reportData
    ? reportData.metrics.some((m) => m.status === 'RUIM')
      ? 'RUIM'
      : reportData.metrics.some((m) => m.status === 'REGULAR')
      ? 'REGULAR'
      : reportData.metrics.length > 0
      ? 'OTIMO'
      : null
    : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#EBEBEB]">Relatórios de Performance</h1>
        <p className="text-[#87919E] text-sm mt-0.5">KPIs semanais dos seus clientes</p>
      </div>

      {/* Filters */}
      <div className="flex items-end gap-4 bg-[#38435C]/20 border border-[#38435C] rounded-xl p-5">
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">Cliente</label>
          <ReportClientSelect
            clients={clients}
            defaultClientId={clientId}
            weekOffset={weekOffset}
          />
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-2">
          <Link
            href={clientId ? weekUrl(prevOffset) : '#'}
            className="w-8 h-10 flex items-center justify-center rounded-lg bg-[#0A1E2C] border border-[#38435C] text-[#87919E] hover:text-[#EBEBEB] hover:border-[#95BBE2] transition-colors"
            aria-label="Semana anterior"
          >
            <ChevronLeft size={16} />
          </Link>
          <div className="min-w-[160px] h-10 px-3 flex items-center justify-center rounded-lg bg-[#0A1E2C] border border-[#38435C]">
            <span className="text-sm text-[#EBEBEB]">{selectedWeek.label}</span>
          </div>
          {nextOffset !== null ? (
            <Link
              href={clientId ? weekUrl(nextOffset) : '#'}
              className="w-8 h-10 flex items-center justify-center rounded-lg bg-[#0A1E2C] border border-[#38435C] text-[#87919E] hover:text-[#EBEBEB] hover:border-[#95BBE2] transition-colors"
              aria-label="Próxima semana"
            >
              <ChevronRight size={16} />
            </Link>
          ) : (
            <div className="w-8 h-10 flex items-center justify-center rounded-lg bg-[#0A1E2C] border border-[#38435C] text-[#38435C] cursor-not-allowed">
              <ChevronRight size={16} />
            </div>
          )}
        </div>
      </div>

      {!clientId ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-2xl bg-[#38435C]/50 flex items-center justify-center mb-4">
            <BarChart3 size={32} className="text-[#87919E]" />
          </div>
          <p className="text-[#EBEBEB] font-medium">Nenhum cliente selecionado</p>
          <p className="text-[#87919E] text-sm mt-1 max-w-xs">
            Selecione um cliente acima para visualizar seus KPIs da semana.
          </p>
        </div>
      ) : !reportData ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-[#EBEBEB] font-medium">Cliente não encontrado</p>
        </div>
      ) : reportData.metrics.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <BarChart3 size={32} className="text-[#38435C] mb-3" />
          <p className="text-[#EBEBEB] font-medium">Sem metas configuradas</p>
          <p className="text-[#87919E] text-sm mt-1 max-w-xs">
            Configure metas para <strong className="text-[#EBEBEB]">{reportData.client.name}</strong> na página do cliente para visualizar os relatórios.
          </p>
          <Link
            href={`/clients/${reportData.client.slug}`}
            className="mt-4 inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[#95BBE2]/15 text-[#95BBE2] text-sm font-medium hover:bg-[#95BBE2]/25 transition-colors"
          >
            Ir para o cliente →
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-[#EBEBEB]">{reportData.client.name}</h2>
              {overallStatus && (
                <Badge variant={overallStatus.toLowerCase() as 'otimo' | 'regular' | 'ruim'}>
                  {healthLabels[overallStatus]}
                </Badge>
              )}
            </div>
            <Link
              href={`/clients/${reportData.client.slug}`}
              className="text-xs text-[#95BBE2] hover:underline"
            >
              Ver cliente →
            </Link>
          </div>

          {/* Metrics grid */}
          <div className="grid grid-cols-3 gap-4">
            {reportData.metrics.map((metric) => (
              <Card key={metric.metric}>
                <CardHeader>
                  <CardTitle>{metric.label}</CardTitle>
                  {metric.status && (
                    <Badge variant={metric.status.toLowerCase() as 'otimo' | 'regular' | 'ruim'}>
                      {healthLabels[metric.status as HealthStatus]}
                    </Badge>
                  )}
                </CardHeader>
                <div className="space-y-3">
                  <div className="flex items-end gap-2">
                    <CardValue>
                      {metric.actual !== null ? fmtValue(metric.actual, metric.unit) : '—'}
                    </CardValue>
                    <p className="text-xs text-[#87919E] mb-1.5">
                      / meta: {fmtValue(metric.target, metric.unit)}
                    </p>
                  </div>
                  {metric.pct !== null && (
                    <>
                      <Progress value={Math.min(metric.pct, 100)} />
                      <p className="text-xs text-[#87919E]">
                        {metric.pct}% da meta atingido{metric.lowerIsBetter ? ' (menor = melhor)' : ''}
                      </p>
                    </>
                  )}
                  {metric.actual === null && (
                    <p className="text-xs text-[#87919E]">Sem dados para este período</p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

