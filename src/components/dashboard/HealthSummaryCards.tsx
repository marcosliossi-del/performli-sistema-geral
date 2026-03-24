import { Card, CardTitle, CardValue } from '@/components/ui/card'
import { TrendingUp, AlertTriangle, CheckCircle2, Users } from 'lucide-react'

interface HealthSummaryCardsProps {
  total: number
  otimo: number
  regular: number
  ruim: number
  viewMode: 'ADMIN' | 'GESTOR'
  managerName?: string
}

export function HealthSummaryCards({
  total,
  otimo,
  regular,
  ruim,
  viewMode,
  managerName,
}: HealthSummaryCardsProps) {
  const label = viewMode === 'ADMIN' ? 'clientes' : `seus clientes`

  const otimoPct = total > 0 ? Math.round((otimo / total) * 100) : 0
  const regularPct = total > 0 ? Math.round((regular / total) * 100) : 0
  const ruimPct = total > 0 ? Math.round((ruim / total) * 100) : 0

  return (
    <div className="space-y-4">
      {/* Summary sentence */}
      <div className="bg-[#0A1E2C] border border-[#38435C] rounded-xl p-4">
        <p className="text-[#87919E] text-sm">
          {viewMode === 'ADMIN' ? 'Você tem' : `${managerName ?? 'Você'} tem`}{' '}
          <span className="text-[#EBEBEB] font-semibold">{total} {label}</span>:{' '}
          <span className="text-[#22C55E] font-semibold">{otimo} com meta batida</span>,{' '}
          <span className="text-[#EAB308] font-semibold">{regular} em regular</span>{' '}
          e{' '}
          <span className="text-[#EF4444] font-semibold">{ruim} com performance ruim</span>.
        </p>
        {/* Progress bar breakdown */}
        {total > 0 && (
          <div className="mt-3 flex h-2 rounded-full overflow-hidden gap-0.5">
            {otimo > 0 && (
              <div
                className="bg-[#22C55E] rounded-l-full transition-all"
                style={{ width: `${otimoPct}%` }}
                title={`Ótimo: ${otimo} (${otimoPct}%)`}
              />
            )}
            {regular > 0 && (
              <div
                className="bg-[#EAB308] transition-all"
                style={{ width: `${regularPct}%` }}
                title={`Regular: ${regular} (${regularPct}%)`}
              />
            )}
            {ruim > 0 && (
              <div
                className="bg-[#EF4444] rounded-r-full transition-all"
                style={{ width: `${ruimPct}%` }}
                title={`Ruim: ${ruim} (${ruimPct}%)`}
              />
            )}
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-[#95BBE2]">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Total de Clientes</CardTitle>
              <CardValue>{total}</CardValue>
              <p className="text-xs text-[#87919E] mt-1">clientes ativos</p>
            </div>
            <Users size={20} className="text-[#95BBE2] mt-1" />
          </div>
        </Card>

        <Card className="border-l-4 border-l-[#22C55E]">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Ótimo</CardTitle>
              <CardValue className="text-[#22C55E]">{otimo}</CardValue>
              <p className="text-xs text-[#87919E] mt-1">
                {otimoPct}% — ≥ 90% da meta
              </p>
            </div>
            <CheckCircle2 size={20} className="text-[#22C55E] mt-1" />
          </div>
        </Card>

        <Card className="border-l-4 border-l-[#EAB308]">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Regular</CardTitle>
              <CardValue className="text-[#EAB308]">{regular}</CardValue>
              <p className="text-xs text-[#87919E] mt-1">
                {regularPct}% — 70–89% da meta
              </p>
            </div>
            <TrendingUp size={20} className="text-[#EAB308] mt-1" />
          </div>
        </Card>

        <Card className="border-l-4 border-l-[#EF4444]">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Ruim</CardTitle>
              <CardValue className="text-[#EF4444]">{ruim}</CardValue>
              <p className="text-xs text-[#87919E] mt-1">
                {ruimPct}% — {'< '}70% da meta
              </p>
            </div>
            <AlertTriangle size={20} className="text-[#EF4444] mt-1" />
          </div>
        </Card>
      </div>
    </div>
  )
}
