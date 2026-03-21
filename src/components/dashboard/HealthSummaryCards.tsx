import { Card, CardTitle, CardValue } from '@/components/ui/card'
import { TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react'

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
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-[#95BBE2]">
          <CardTitle>Total de Clientes</CardTitle>
          <CardValue>{total}</CardValue>
          <p className="text-xs text-[#87919E] mt-1">↑ 12% vs mês anterior</p>
        </Card>

        <Card className="border-l-4 border-l-[#22C55E]">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Ótimo</CardTitle>
              <CardValue className="text-[#22C55E]">{otimo}</CardValue>
              <p className="text-xs text-[#87919E] mt-1">≥ 90% da meta</p>
            </div>
            <CheckCircle2 size={20} className="text-[#22C55E] mt-1" />
          </div>
        </Card>

        <Card className="border-l-4 border-l-[#EAB308]">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Regular</CardTitle>
              <CardValue className="text-[#EAB308]">{regular}</CardValue>
              <p className="text-xs text-[#87919E] mt-1">70–89% da meta</p>
            </div>
            <TrendingUp size={20} className="text-[#EAB308] mt-1" />
          </div>
        </Card>

        <Card className="border-l-4 border-l-[#EF4444]">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Ruim</CardTitle>
              <CardValue className="text-[#EF4444]">{ruim}</CardValue>
              <p className="text-xs text-[#87919E] mt-1">{'< '}70% da meta</p>
            </div>
            <AlertTriangle size={20} className="text-[#EF4444] mt-1" />
          </div>
        </Card>
      </div>
    </div>
  )
}
