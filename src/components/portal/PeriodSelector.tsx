'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'
import type { PortalPeriod } from '@/lib/portal/kpis'

const OPTIONS: Array<{ value: PortalPeriod; label: string }> = [
  { value: '7d', label: '7 dias' },
  { value: '14d', label: '14 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'mes_atual', label: 'Mês atual' },
  { value: 'mes_anterior', label: 'Mês anterior' },
]

interface PeriodSelectorProps {
  current: PortalPeriod
}

export function PeriodSelector({ current }: PeriodSelectorProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  function select(value: PortalPeriod) {
    if (value === current) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('period', value)
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  return (
    <div
      role="group"
      aria-label="Período dos resultados"
      className={`flex flex-wrap gap-1.5 ${pending ? 'opacity-70' : ''}`}
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === current
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => select(opt.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#95BBE2]/50 ${
              active
                ? 'border-[#95BBE2]/40 bg-[#95BBE2]/15 text-[#95BBE2]'
                : 'border-[#38435C] text-[#87919E] hover:bg-white/[0.05] hover:text-[#EBEBEB]'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
