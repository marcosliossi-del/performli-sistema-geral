'use client'

import { useState } from 'react'
import { Card, CardTitle, CardValue } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckSquare, Clock, AlertTriangle, TrendingUp, Plus, Circle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const mockTasks = [
  {
    id: '1', title: 'Revisar criativos Loja Alpha', priority: 'HIGH', status: 'PENDING',
    client: 'Loja Alpha', dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
  },
  {
    id: '2', title: 'Ajustar orçamento campanha E-commerce Beta', priority: 'MEDIUM', status: 'IN_PROGRESS',
    client: 'E-commerce Beta', dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
  },
  {
    id: '3', title: 'Relatório semanal Marca Gamma', priority: 'HIGH', status: 'PENDING',
    client: 'Marca Gamma', dueDate: new Date(Date.now() - 60 * 60 * 1000),
  },
  {
    id: '4', title: 'Configurar GA4 Tech Delta', priority: 'LOW', status: 'DONE',
    client: 'Tech Delta', dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
  },
]

const priorityColors = {
  HIGH: 'text-[#EF4444]',
  MEDIUM: 'text-[#EAB308]',
  LOW: 'text-[#87919E]',
}

const priorityLabels = { HIGH: 'Alta', MEDIUM: 'Média', LOW: 'Baixa' }

export default function TasksPage() {
  const [tasks, setTasks] = useState(mockTasks)

  const done = tasks.filter((t) => t.status === 'DONE').length
  const thisWeek = tasks.filter((t) => t.status !== 'DONE').length
  const overdue = tasks.filter((t) => t.status !== 'DONE' && t.dueDate < new Date()).length

  const toggleDone = (id: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: t.status === 'DONE' ? 'PENDING' : 'DONE' } : t
      )
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#EBEBEB]">Minhas Tarefas</h1>
          <p className="text-[#87919E] text-sm mt-0.5">Acompanhamento de atividades da semana</p>
        </div>
        <Button>
          <Plus size={16} />
          Nova Tarefa
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Taxa de Conclusão</CardTitle>
              <CardValue>{tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0}%</CardValue>
              <p className="text-xs text-[#87919E] mt-1">{done} de {tasks.length} tarefas</p>
            </div>
            <CheckSquare size={20} className="text-[#95BBE2] mt-1" />
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Esta Semana</CardTitle>
              <CardValue>{thisWeek}</CardValue>
              <p className="text-xs text-[#22C55E] mt-1">↑ 0% vs semana anterior</p>
            </div>
            <TrendingUp size={20} className="text-[#22C55E] mt-1" />
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Tempo Total</CardTitle>
              <CardValue>—</CardValue>
              <p className="text-xs text-[#87919E] mt-1">Média: — /tarefa</p>
            </div>
            <Clock size={20} className="text-[#87919E] mt-1" />
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Atrasadas</CardTitle>
              <CardValue className={overdue > 0 ? 'text-[#EF4444]' : ''}>{overdue}</CardValue>
              <p className="text-xs text-[#87919E] mt-1">{tasks.length - done} pendentes total</p>
            </div>
            <AlertTriangle size={20} className={overdue > 0 ? 'text-[#EF4444] mt-1' : 'text-[#87919E] mt-1'} />
          </div>
        </Card>
      </div>

      {/* Tasks list */}
      <div className="bg-[#38435C]/20 border border-[#38435C] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#38435C] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#EBEBEB]">Todas as Tarefas</h2>
          <div className="flex gap-2">
            {(['PENDING', 'IN_PROGRESS', 'DONE'] as const).map((s) => (
              <span key={s} className="text-xs text-[#87919E]">
                {tasks.filter((t) => t.status === s).length}{' '}
                {s === 'PENDING' ? 'pendentes' : s === 'IN_PROGRESS' ? 'em andamento' : 'concluídas'}
              </span>
            ))}
          </div>
        </div>
        <div className="divide-y divide-[#38435C]/50">
          {tasks.map((task) => {
            const isOverdue = task.status !== 'DONE' && task.dueDate < new Date()
            return (
              <div
                key={task.id}
                className={cn(
                  'flex items-center gap-4 px-5 py-4 hover:bg-[#38435C]/20 transition-colors',
                  task.status === 'DONE' && 'opacity-50'
                )}
              >
                <button onClick={() => toggleDone(task.id)} className="flex-shrink-0">
                  {task.status === 'DONE' ? (
                    <CheckCircle2 size={20} className="text-[#22C55E]" />
                  ) : (
                    <Circle size={20} className="text-[#87919E] hover:text-[#95BBE2] transition-colors" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm text-[#EBEBEB]', task.status === 'DONE' && 'line-through text-[#87919E]')}>
                    {task.title}
                  </p>
                  <p className="text-xs text-[#87919E] mt-0.5">{task.client}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={cn('text-xs font-medium', priorityColors[task.priority as keyof typeof priorityColors])}>
                    {priorityLabels[task.priority as keyof typeof priorityLabels]}
                  </span>
                  <span className={cn('text-xs', isOverdue ? 'text-[#EF4444]' : 'text-[#87919E]')}>
                    {isOverdue ? '⚠ ' : ''}{task.dueDate.toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
