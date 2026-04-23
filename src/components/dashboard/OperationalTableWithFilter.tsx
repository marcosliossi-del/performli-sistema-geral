'use client'

import { useState, useEffect } from 'react'
import { OperationalClientTable, OperationalRow } from './OperationalClientTable'
import { HealthStatus } from '@prisma/client'

type Filter = 'ALL' | HealthStatus

interface Props {
  rows: OperationalRow[]
}

const filterButtons: { label: string; value: Filter }[] = [
  { label: 'Todos',    value: 'ALL'     },
  { label: 'Saudável', value: 'OTIMO'   },
  { label: 'Atenção',  value: 'REGULAR' },
  { label: 'Crítico',  value: 'RUIM'    },
]

export function OperationalTableWithFilter({ rows: initialRows }: Props) {
  const [filter,     setFilter]     = useState<Filter>('ALL')
  const [rows,       setRows]       = useState<OperationalRow[]>(initialRows)
  const [syncingId,  setSyncingId]  = useState<string | null>(null)

  // Listen for real-time row updates dispatched by RecalcHealthButton
  useEffect(() => {
    function onRowUpdate(e: Event) {
      const row = (e as CustomEvent<OperationalRow>).detail
      setSyncingId(row.id)
      setRows(prev => prev.map(r => r.id === row.id ? row : r))
    }
    function onSyncStart(e: Event) {
      const { clientId } = (e as CustomEvent<{ clientId: string }>).detail
      setSyncingId(clientId)
    }
    function onSyncDone() {
      setSyncingId(null)
    }

    window.addEventListener('sync-row-update', onRowUpdate)
    window.addEventListener('sync-client-start', onSyncStart)
    window.addEventListener('sync-complete', onSyncDone)
    return () => {
      window.removeEventListener('sync-row-update', onRowUpdate)
      window.removeEventListener('sync-client-start', onSyncStart)
      window.removeEventListener('sync-complete', onSyncDone)
    }
  }, [])

  const filtered =
    filter === 'ALL'
      ? rows
      : rows.filter(r => r.overallStatus === filter)

  return (
    <div className="space-y-3">
      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {filterButtons.map((btn) => {
          const isActive = filter === btn.value
          const activeColor =
            btn.value === 'OTIMO'    ? 'bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/40'
            : btn.value === 'REGULAR' ? 'bg-[#EAB308]/15 text-[#EAB308] border-[#EAB308]/40'
            : btn.value === 'RUIM'    ? 'bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/40'
            : 'bg-[#95BBE2]/15 text-[#95BBE2] border-[#95BBE2]/40'
          return (
            <button
              key={btn.value}
              onClick={() => setFilter(btn.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                isActive
                  ? activeColor
                  : 'border-[#38435C] text-[#87919E] hover:text-[#EBEBEB] hover:border-[#87919E]'
              }`}
            >
              {btn.label}
              {btn.value !== 'ALL' && (
                <span className="ml-1.5 opacity-70">
                  {rows.filter(r => r.overallStatus === btn.value).length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <OperationalClientTable rows={filtered} syncingClientId={syncingId} />
    </div>
  )
}
