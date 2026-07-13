'use client'

import { useRouter } from 'next/navigation'
import { Inbox, Kanban, LineChart } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ConversasView = 'inbox' | 'pipeline' | 'supervisao'

const TABS: { key: ConversasView; label: string; icon: React.ElementType }[] = [
  { key: 'inbox', label: 'Inbox', icon: Inbox },
  { key: 'pipeline', label: 'Funil', icon: Kanban },
  { key: 'supervisao', label: 'Supervisão', icon: LineChart },
]

/**
 * Segmented control das 3 visões do módulo. Estado na URL (?view=) — cada troca
 * navega para uma URL limpa da visão (descarta filtros da visão anterior).
 */
export function ConversasTabs({ active }: { active: ConversasView }) {
  const router = useRouter()
  return (
    <div className="inline-flex rounded-xl border border-[#38435C] bg-[#0D2137] p-1 gap-1">
      {TABS.map((t) => {
        const isActive = t.key === active
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => router.push(`/conversas?view=${t.key}`)}
            aria-pressed={isActive}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors',
              isActive
                ? 'bg-[#95BBE2]/15 text-[#95BBE2]'
                : 'text-[#a3b2c2] hover:bg-white/[0.05] hover:text-[#f2f6fa]',
            )}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
