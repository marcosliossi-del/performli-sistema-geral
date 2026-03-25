'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { CalendarRange, ChevronDown, Loader2 } from 'lucide-react'

type Preset = {
  label: string
  key: string
  getDates: () => { from: string; to: string }
}

function fmt(d: Date) {
  return d.toISOString().split('T')[0]
}

function yesterday() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d
}

const PRESETS: Preset[] = [
  {
    label: 'Este mês',
    key: 'this_month',
    getDates: () => {
      const t = new Date()
      return { from: fmt(new Date(t.getFullYear(), t.getMonth(), 1)), to: fmt(yesterday()) }
    },
  },
  {
    label: 'Mês anterior',
    key: 'last_month',
    getDates: () => {
      const t = new Date()
      return {
        from: fmt(new Date(t.getFullYear(), t.getMonth() - 1, 1)),
        to: fmt(new Date(t.getFullYear(), t.getMonth(), 0)),
      }
    },
  },
  {
    label: 'Últimos 7 dias',
    key: 'last_7',
    getDates: () => {
      const d = new Date(); d.setDate(d.getDate() - 7)
      return { from: fmt(d), to: fmt(yesterday()) }
    },
  },
  {
    label: 'Últimos 30 dias',
    key: 'last_30',
    getDates: () => {
      const d = new Date(); d.setDate(d.getDate() - 30)
      return { from: fmt(d), to: fmt(yesterday()) }
    },
  },
]

function displayDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatRange(from: string, to: string) {
  return `${displayDate(from)} – ${displayDate(to)}`
}

function detectPreset(from: string, to: string): string | null {
  for (const p of PRESETS) {
    const d = p.getDates()
    if (d.from === from && d.to === to) return p.key
  }
  return 'custom'
}

interface DateRangePickerProps {
  from: string
  to: string
  clientId?: string
}

export function DateRangePicker({ from, to, clientId }: DateRangePickerProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState(from)
  const [customTo, setCustomTo] = useState(to)
  const [syncing, setSyncing] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const activePreset = detectPreset(from, to)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function applyDates(newFrom: string, newTo: string) {
    setOpen(false)

    if (clientId) {
      setSyncing(true)
      try {
        await Promise.all([
          fetch(`/api/sync/meta?since=${newFrom}&until=${newTo}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId }),
          }),
          fetch(`/api/sync/ga4?since=${newFrom}&until=${newTo}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId }),
          }),
        ])
      } catch {
        // silently continue
      } finally {
        setSyncing(false)
      }
    }

    const params = new URLSearchParams(searchParams.toString())
    params.set('from', newFrom)
    params.set('to', newTo)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !syncing && setOpen((v) => !v)}
        disabled={syncing}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-xs text-[#EBEBEB] hover:border-[#95BBE2] transition-colors disabled:opacity-60 disabled:cursor-wait"
      >
        {syncing ? (
          <Loader2 size={13} className="text-[#95BBE2] animate-spin" />
        ) : (
          <CalendarRange size={13} className="text-[#95BBE2]" />
        )}
        <span>{syncing ? 'Sincronizando...' : formatRange(from, to)}</span>
        {!syncing && (
          <ChevronDown size={12} className={`text-[#87919E] transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-[#0A1E2C] border border-[#38435C] rounded-xl shadow-xl w-72 p-3">
          <div className="space-y-0.5 mb-3">
            {PRESETS.map((p) => {
              const dates = p.getDates()
              const isActive = activePreset === p.key
              return (
                <button
                  key={p.key}
                  onClick={() => applyDates(dates.from, dates.to)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                    isActive
                      ? 'bg-[#95BBE2]/15 text-[#95BBE2]'
                      : 'text-[#EBEBEB] hover:bg-[#38435C]/50'
                  }`}
                >
                  <span>{p.label}</span>
                  <span className="text-[#87919E] font-mono">{formatRange(dates.from, dates.to)}</span>
                </button>
              )
            })}
          </div>

          <div className="h-px bg-[#38435C] mb-3" />

          <p className="text-[10px] text-[#87919E] uppercase tracking-wide mb-2">Personalizado</p>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1">
              <p className="text-[10px] text-[#87919E] mb-1">De</p>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full bg-[#060F18] border border-[#38435C] rounded-lg px-2 py-1.5 text-xs text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]"
              />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-[#87919E] mb-1">Até</p>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full bg-[#060F18] border border-[#38435C] rounded-lg px-2 py-1.5 text-xs text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]"
              />
            </div>
          </div>
          <button
            onClick={() => customFrom && customTo && applyDates(customFrom, customTo)}
            disabled={!customFrom || !customTo || customFrom > customTo}
            className="w-full py-1.5 rounded-lg bg-[#95BBE2] text-[#060F18] text-xs font-semibold hover:bg-[#95BBE2]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  )
}
