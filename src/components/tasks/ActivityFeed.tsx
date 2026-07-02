'use client'

import type { ReactNode } from 'react'
import {
  ArrowRightLeft,
  CircleDot,
  Flag,
  MessageSquare,
  Plus,
  Repeat,
  TriangleAlert,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/utils'

export type ActivityVM = {
  id: string
  /** action livre (TaskActivity.action): 'created' | 'status_changed' | ... */
  action: string
  actorName?: string | null
  fromValue?: string | null
  toValue?: string | null
  createdAt: Date | string
}

type Rendered = { icon: ReactNode; phrase: ReactNode }

function strong(v?: string | null) {
  return <span className="font-medium text-text-hi">{v ?? '—'}</span>
}

function describe(a: ActivityVM): Rendered {
  const who = a.actorName ?? 'Alguém'
  switch (a.action) {
    case 'created':
      return { icon: <Plus size={13} />, phrase: <>{who} criou a tarefa</> }
    case 'status_changed':
      return {
        icon: <ArrowRightLeft size={13} />,
        phrase: (
          <>
            {who} mudou o status de {strong(a.fromValue)} para {strong(a.toValue)}
          </>
        ),
      }
    case 'field_changed':
      return {
        icon: <CircleDot size={13} />,
        phrase: (
          <>
            {who} alterou {strong(a.fromValue)} para {strong(a.toValue)}
          </>
        ),
      }
    case 'priority_changed':
      return {
        icon: <Flag size={13} />,
        phrase: (
          <>
            {who} mudou a prioridade para {strong(a.toValue)}
          </>
        ),
      }
    case 'escalated':
      return {
        icon: <TriangleAlert size={13} />,
        phrase: <>{who} escalou a tarefa{a.toValue ? <> para {strong(a.toValue)}</> : null}</>,
      }
    case 'recurred':
      return {
        icon: <Repeat size={13} />,
        phrase: <>Tarefa recorrente regenerada automaticamente</>,
      }
    case 'commented':
      return { icon: <MessageSquare size={13} />, phrase: <>{who} comentou</> }
    default:
      return {
        icon: <CircleDot size={13} />,
        phrase: (
          <>
            {who} atualizou a tarefa
            {a.toValue ? <> ({strong(a.toValue)})</> : null}
          </>
        ),
      }
  }
}

/** Timeline compacta de atividade da tarefa. */
export function ActivityFeed({
  activities,
  className,
}: {
  activities: ActivityVM[]
  className?: string
}) {
  if (activities.length === 0) {
    return <p className={cn('text-[12px] text-text-low', className)}>Sem atividade registrada.</p>
  }
  return (
    <ul className={cn('space-y-3', className)}>
      {activities.map((a) => {
        const { icon, phrase } = describe(a)
        return (
          <li key={a.id} className="flex gap-2.5">
            <span
              className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-text-mid"
              aria-hidden
            >
              {icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] leading-snug text-text-mid">{phrase}</p>
              <span className="text-[11px] text-text-low">
                {timeAgo(typeof a.createdAt === 'string' ? new Date(a.createdAt) : a.createdAt)}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
