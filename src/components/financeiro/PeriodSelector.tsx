'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

const PRESETS = [
  { label: 'Hoje',         key: 'today' },
  { label: 'Semana atual', key: 'week' },
  { label: 'Mês atual',    key: 'month' },
  { label: 'Mês anterior', key: 'prev-month' },
  { label: '30 dias',      key: '30d' },
  { label: '90 dias',      key: '90d' },
] as const

type PresetKey = typeof PRESETS[number]['key']

function presetToDates(key: PresetKey): { from: string; to: string } {
  const today = new Date()
  const fmt   = (d: Date) => d.toISOString().split('T')[0]

  switch (key) {
    case 'today': {
      const s = fmt(today)
      return { from: s, to: s }
    }
    case 'week': {
      const dow   = today.getDay()
      const start = new Date(today)
      start.setDate(today.getDate() - dow + (dow === 0 ? -6 : 1))
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      return { from: fmt(start), to: fmt(end) }
    }
    case 'month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      const end   = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      return { from: fmt(start), to: fmt(end) }
    }
    case 'prev-month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const end   = new Date(today.getFullYear(), today.getMonth(), 0)
      return { from: fmt(start), to: fmt(end) }
    }
    case '30d': {
      const start = new Date(today)
      start.setDate(today.getDate() - 29)
      return { from: fmt(start), to: fmt(today) }
    }
    case '90d': {
      const start = new Date(today)
      start.setDate(today.getDate() - 89)
      return { from: fmt(start), to: fmt(today) }
    }
  }
}

export function PeriodSelector() {
  const router     = useRouter()
  const params     = useSearchParams()
  const activeFrom = params.get('from')
  const activeTo   = params.get('to')

  const navigate = useCallback((from: string, to: string) => {
    const p = new URLSearchParams(params.toString())
    p.set('from', from)
    p.set('to', to)
    router.push(`?${p.toString()}`)
  }, [router, params])

  function handlePreset(key: PresetKey) {
    const { from, to } = presetToDates(key)
    navigate(from, to)
  }

  return (
    <div className="bg-[#38435C]/20 border border-[#38435C] rounded-xl p-3 flex flex-wrap items-center gap-3">
      <span className="text-xs text-[#87919E] font-medium">Período</span>

      <div className="flex flex-wrap gap-1">
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => handlePreset(p.key)}
            className="px-3 py-1 rounded-md text-xs transition-colors bg-[#38435C]/40 text-[#87919E] hover:text-[#EBEBEB] hover:bg-[#38435C]/80"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <span className="text-xs text-[#87919E]">De</span>
        <input
          type="date"
          value={activeFrom ?? ''}
          onChange={e => navigate(e.target.value, activeTo ?? e.target.value)}
          className="bg-[#0A1E2C] border border-[#38435C] rounded-md px-2 py-1 text-xs text-[#EBEBEB] outline-none focus:border-[#95BBE2]"
        />
        <span className="text-xs text-[#87919E]">até</span>
        <input
          type="date"
          value={activeTo ?? ''}
          onChange={e => navigate(activeFrom ?? e.target.value, e.target.value)}
          className="bg-[#0A1E2C] border border-[#38435C] rounded-md px-2 py-1 text-xs text-[#EBEBEB] outline-none focus:border-[#95BBE2]"
        />
      </div>
    </div>
  )
}
