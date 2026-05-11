'use client'

import { useState } from 'react'
import { BarChart3, Edit3 } from 'lucide-react'
import { MetasBulkTable } from './MetasBulkTable'
import { MetasDashboard } from './MetasDashboard'
import type { ClientProgress } from '@/app/actions/progress'

type ClientData = {
  id: string
  name: string
  slug: string
  managerName: string
  goals: {
    FATURAMENTO: number | null
    ROAS: number | null
    SPEND: number | null
  }
  suggestedCpa: number | null
  prevTicketMedio: number | null
}

type Tab = 'dashboard' | 'editar'

export function MetasPageTabs({
  clientsData,
  progress,
  initialYear,
  initialMonth,
}: {
  clientsData: ClientData[]
  progress: ClientProgress[]
  initialYear: number
  initialMonth: number
}) {
  const [tab, setTab] = useState<Tab>('dashboard')

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-[#0A1E2C] border border-[#38435C] rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('dashboard')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
            tab === 'dashboard'
              ? 'bg-[#95BBE2]/15 text-[#95BBE2] border border-[#95BBE2]/20'
              : 'text-[#87919E] hover:text-[#EBEBEB]'
          }`}
        >
          <BarChart3 size={13} />
          Dashboard de Progresso
        </button>
        <button
          onClick={() => setTab('editar')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
            tab === 'editar'
              ? 'bg-[#95BBE2]/15 text-[#95BBE2] border border-[#95BBE2]/20'
              : 'text-[#87919E] hover:text-[#EBEBEB]'
          }`}
        >
          <Edit3 size={13} />
          Editar Metas
        </button>
      </div>

      {tab === 'dashboard' ? (
        <MetasDashboard clients={progress} />
      ) : (
        <MetasBulkTable
          clients={clientsData}
          initialYear={initialYear}
          initialMonth={initialMonth}
        />
      )}
    </div>
  )
}
