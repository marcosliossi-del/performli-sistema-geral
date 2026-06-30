'use client'

import { useTransition } from 'react'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { cn, timeAgo } from '@/lib/utils'
import { updateTaskStatus } from '@/app/actions/tasks'
import { TaskStatus } from '@prisma/client'
import Link from 'next/link'

const priorityColors: Record<'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA', string> = {
  CRITICA: 'text-[#EF4444]',
  ALTA:    'text-[#EF4444]',
  MEDIA:   'text-[#EAB308]',
  BAIXA:   'text-[#87919E]',
}

const priorityLabels: Record<'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA', string> = {
  CRITICA: 'Crítica', ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa',
}

interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA'
  dueDate: Date | null
  client: { name: string; slug: string } | null
  user: { name: string }
}

interface Props {
  tasks: Task[]
}

function TaskRow({ task }: { task: Task }) {
  const [isPending, startTransition] = useTransition()
  const isDone    = task.status === 'CONCLUIDO'
  const isOverdue = !isDone && task.dueDate !== null && task.dueDate < new Date()

  function toggle() {
    startTransition(() =>
      updateTaskStatus(task.id, isDone ? 'A_FAZER' : 'CONCLUIDO')
    )
  }

  return (
    <div className={cn('flex items-center gap-4 px-5 py-4 hover:bg-[#38435C]/20 transition-colors', isDone && 'opacity-50')}>
      <button onClick={toggle} className="flex-shrink-0" disabled={isPending}>
        {isPending ? (
          <Loader2 size={20} className="text-[#87919E] animate-spin" />
        ) : isDone ? (
          <CheckCircle2 size={20} className="text-[#22C55E]" />
        ) : (
          <Circle size={20} className="text-[#87919E] hover:text-[#95BBE2] transition-colors" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p className={cn('text-sm text-[#EBEBEB]', isDone && 'line-through text-[#87919E]')}>
          {task.title}
        </p>
        {task.client && (
          <Link href={`/clients/${task.client.slug}`} className="text-xs text-[#95BBE2] hover:underline mt-0.5 block">
            {task.client.name}
          </Link>
        )}
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <span className={cn('text-xs font-medium', priorityColors[task.priority])}>
          {priorityLabels[task.priority]}
        </span>
        {task.dueDate && (
          <span className={cn('text-xs', isOverdue ? 'text-[#EF4444]' : 'text-[#87919E]')}>
            {isOverdue ? '⚠ ' : ''}{task.dueDate.toLocaleDateString('pt-BR')}
          </span>
        )}
      </div>
    </div>
  )
}

export function TaskList({ tasks }: Props) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <CheckCircle2 size={32} className="text-[#38435C] mb-3" />
        <p className="text-[#87919E] text-sm">Nenhuma tarefa encontrada</p>
      </div>
    )
  }

  const naoConcluidas = tasks.filter((t) => t.status !== 'CONCLUIDO' && t.status !== 'CANCELADO')
  const concluidas    = tasks.filter((t) => t.status === 'CONCLUIDO' || t.status === 'CANCELADO')

  const ordered = [...naoConcluidas, ...concluidas]

  return (
    <div className="bg-[#38435C]/20 border border-[#38435C] rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[#38435C] flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#EBEBEB]">Todas as Tarefas</h2>
        <div className="flex gap-3 text-xs text-[#87919E]">
          <span>{pending.length} pendentes</span>
          <span>{inProgress.length} em andamento</span>
          <span>{done.length} concluídas</span>
        </div>
      </div>
      <div className="divide-y divide-[#38435C]/50">
        {ordered.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </div>
    </div>
  )
}
