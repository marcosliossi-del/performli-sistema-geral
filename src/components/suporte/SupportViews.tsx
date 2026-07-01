'use client'

import { useState } from 'react'
import { List, LayoutGrid } from 'lucide-react'
import { SupportList } from './SupportList'
import type { SupportRow } from './SupportList'
import { SupportBoard } from './SupportBoard'
import type { SupportCardData } from './SupportBoard'
import type { TaskUser } from '@/components/operacional/TaskDrawer'

type View = 'lista' | 'quadro'

interface Props {
  rows: SupportRow[]
  cards: SupportCardData[]
  users: TaskUser[]
  canEdit: boolean
}

export function SupportViews({ rows, cards, users, canEdit }: Props) {
  const [view, setView] = useState<View>('lista')

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-1 mb-4 flex-shrink-0 bg-[#1B2B3A]/40 border border-[#38435C] rounded-lg p-0.5 w-fit">
        <ToggleButton
          active={view === 'lista'}
          onClick={() => setView('lista')}
          icon={<List size={14} />}
          label="Lista"
        />
        <ToggleButton
          active={view === 'quadro'}
          onClick={() => setView('quadro')}
          icon={<LayoutGrid size={14} />}
          label="Quadro"
        />
      </div>

      {view === 'lista' ? (
        <SupportList initialRows={rows} users={users} canEdit={canEdit} />
      ) : (
        <SupportBoard initialCards={cards} />
      )}
    </div>
  )
}

function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
        active
          ? 'bg-[#0A1E2C] text-[#54e0ee]'
          : 'text-[#87919E] hover:text-[#EBEBEB]'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
