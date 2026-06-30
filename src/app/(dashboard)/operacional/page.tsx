import { requireSession, getOperacionalBoard, getNovaTarefaContext } from '@/lib/dal'
import { Card } from '@/components/ui/card'
import { OperacionalBoard } from '@/components/operacional/OperacionalBoard'
import { ListChecks, CheckCircle2, AlertTriangle, Percent } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function OperacionalPage() {
  const { userId, role } = await requireSession()
  const [board, ctx] = await Promise.all([
    getOperacionalBoard(userId, role),
    getNovaTarefaContext(userId, role),
  ])
  const canEdit = role !== 'ANALYST'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#EBEBEB]">Central Operacional</h1>
        <p className="text-[#87919E] text-sm mt-0.5">Tarefas e processos da agência — toda demanda com dono, prazo e evidência.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={ListChecks} label="Total" value={board.kpis.total} cls="text-[#95BBE2]" />
        <Kpi icon={CheckCircle2} label="Concluídas" value={board.kpis.concluidas} cls="text-[#22C55E]" />
        <Kpi icon={AlertTriangle} label="Atrasadas" value={board.kpis.atrasadas} cls={board.kpis.atrasadas > 0 ? 'text-[#EF4444]' : 'text-[#87919E]'} />
        <Kpi icon={Percent} label="Taxa de conclusão" value={`${board.kpis.taxaConclusao}%`} cls="text-[#EBEBEB]" />
      </div>

      <OperacionalBoard tasks={board.tasks} ctx={ctx} canEdit={canEdit} />
    </div>
  )
}

function Kpi({ icon: Icon, label, value, cls }: { icon: typeof ListChecks; label: string; value: number | string; cls: string }) {
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
