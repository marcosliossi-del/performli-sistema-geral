import { requireSession, getOperacionalBoard, getNovaTarefaContext } from '@/lib/dal'
import { OperacionalBoard } from '@/components/operacional/OperacionalBoard'

export const dynamic = 'force-dynamic'

export default async function OperacionalPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string }>
}) {
  const { task: initialTaskId } = await searchParams
  const { userId, role, name } = await requireSession()
  const [board, ctx] = await Promise.all([
    getOperacionalBoard(userId, role),
    getNovaTarefaContext(userId, role),
  ])
  const canEdit = role !== 'ANALYST'
  const k = board.kpis

  return (
    <div className="space-y-1">
      {/* Header estilo protótipo */}
      <div className="pb-1">
        <h1 className="text-[24px] font-bold text-[#EBEBEB] tracking-[-0.03em]">Central de Tarefas</h1>
        <p className="text-[#647488] text-[12.5px] mt-0.5">
          {ctx.clientes.length} cliente{ctx.clientes.length === 1 ? '' : 's'} · {k.abertas} tarefa{k.abertas === 1 ? '' : 's'} aberta{k.abertas === 1 ? '' : 's'}
        </p>
      </div>

      {/* KPI strip */}
      <div className="flex flex-wrap gap-3 pt-3 pb-1">
        <Kpi label="Abertas" value={k.abertas} />
        <Kpi label="Atrasadas" value={k.atrasadas} tone="late" />
        <Kpi label="Aguardando" value={k.aguardando} />
        <Kpi label="No prazo" value={`${k.noPrazoPct}%`} tone="done" />
        <Kpi label="War Room" value={k.warRoom} tone="crit" />
      </div>

      <OperacionalBoard tasks={board.tasks} ctx={ctx} canEdit={canEdit} initialTaskId={initialTaskId} currentUser={{ id: userId, name }} />
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'late' | 'done' | 'crit' }) {
  const vColor = tone === 'late' ? 'text-danger' : tone === 'done' ? 'text-success' : tone === 'crit' ? 'text-danger' : 'text-[#f2f6fa]'
  return (
    <div className="ak-lift relative overflow-hidden bg-[#161d26] border border-[rgba(255,255,255,0.09)] rounded-[14px] px-4 py-3.5 min-w-[128px] shadow-[0_1px_1px_rgba(0,0,0,0.28),0_10px_28px_-16px_rgba(0,0,0,0.55)]">
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className={`text-[26px] leading-none font-bold tabular tracking-[-0.04em] ${vColor}`}>{value}</div>
      <div className="text-[10.5px] uppercase tracking-[0.06em] text-[#647488] font-semibold mt-1.5">{label}</div>
    </div>
  )
}
