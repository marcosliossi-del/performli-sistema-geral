import { requireSession, getTasks, getClientsForSelect } from '@/lib/dal'
import { Card, CardTitle, CardValue } from '@/components/ui/card'
import { CheckSquare, Clock, AlertTriangle, TrendingUp } from 'lucide-react'
import { TaskList } from '@/components/tasks/TaskList'
import { TaskFormModal } from '@/components/tasks/TaskFormModal'

export default async function TasksPage() {
  const { userId, role } = await requireSession()

  const [tasks, clients] = await Promise.all([
    getTasks(userId, role),
    getClientsForSelect(userId, role),
  ])

  const done    = tasks.filter((t) => t.status === 'CONCLUIDO').length
  const pending = tasks.filter((t) => t.status !== 'CONCLUIDO').length
  const overdue = tasks.filter(
    (t) => t.status !== 'CONCLUIDO' && t.dueDate !== null && t.dueDate < new Date()
  ).length
  const completionPct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#EBEBEB]">Minhas Tarefas</h1>
          <p className="text-[#87919E] text-sm mt-0.5">Acompanhamento de atividades</p>
        </div>
        <TaskFormModal clients={clients} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Taxa de Conclusão</CardTitle>
              <CardValue>{completionPct}%</CardValue>
              <p className="text-xs text-[#87919E] mt-1">{done} de {tasks.length} tarefas</p>
            </div>
            <CheckSquare size={20} className="text-[#95BBE2] mt-1" />
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Pendentes</CardTitle>
              <CardValue>{pending}</CardValue>
              <p className="text-xs text-[#87919E] mt-1">aguardando conclusão</p>
            </div>
            <TrendingUp size={20} className="text-[#95BBE2] mt-1" />
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Concluídas</CardTitle>
              <CardValue>{done}</CardValue>
              <p className="text-xs text-[#87919E] mt-1">nesta lista</p>
            </div>
            <Clock size={20} className="text-[#87919E] mt-1" />
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Atrasadas</CardTitle>
              <CardValue className={overdue > 0 ? 'text-[#EF4444]' : ''}>{overdue}</CardValue>
              <p className="text-xs text-[#87919E] mt-1">{pending} pendentes total</p>
            </div>
            <AlertTriangle size={20} className={overdue > 0 ? 'text-[#EF4444] mt-1' : 'text-[#87919E] mt-1'} />
          </div>
        </Card>
      </div>

      <TaskList tasks={tasks} />
    </div>
  )
}
