import { requireSession, getValidationQueue } from '@/lib/dal'
import { Card } from '@/components/ui/card'
import { ValidationQueue } from '@/components/operacional/ValidationQueue'
import { ShieldCheck, Clock, AlertTriangle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ValidacoesPage() {
  const { userId, role } = await requireSession()
  const { items, canDecide } = await getValidationQueue(userId, role)

  const atrasadas = items.filter((i) => i.waitingDays >= 3).length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#EBEBEB]">Validação da CS</h1>
        <p className="text-[#87919E] text-sm mt-0.5">
          Check-ins e prestações de contas que os gestores enviaram — aprove ou peça ajustes.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Kpi icon={ShieldCheck} label="Aguardando validação" value={items.length} cls="text-[#95BBE2]" />
        <Kpi icon={AlertTriangle} label="Esperando há 3+ dias" value={atrasadas} cls={atrasadas > 0 ? 'text-[#EF4444]' : 'text-[#87919E]'} />
        <Kpi icon={Clock} label="Seu papel" value={canDecide ? 'Valida' : 'Acompanha'} cls="text-[#EBEBEB]" />
      </div>

      <ValidationQueue items={items} canDecide={canDecide} />
    </div>
  )
}

function Kpi({ icon: Icon, label, value, cls }: { icon: typeof Clock; label: string; value: number | string; cls: string }) {
  return (
    <Card className="p-3 ak-lift">
      <div className="flex items-center gap-2">
        <Icon size={14} className={cls} />
        <p className="text-[10px] text-[#87919E] uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-2xl font-bold mt-1 tabular ${cls}`}>{value}</p>
    </Card>
  )
}
