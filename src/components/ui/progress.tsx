'use client'

import { cn } from '@/lib/utils'

interface ProgressProps {
  value: number // 0-100
  className?: string
  color?: string
}

export function Progress({ value, className, color }: ProgressProps) {
  const clampedValue = Math.min(Math.max(value, 0), 100)

  const barColor =
    color ||
    (clampedValue >= 90 ? '#22C55E' : clampedValue >= 70 ? '#EAB308' : '#EF4444')

  return (
    <div
      className={cn('h-2 w-full rounded-full bg-[#0A1E2C] overflow-hidden', className)}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${clampedValue}%`, backgroundColor: barColor }}
      />
    </div>
  )
}
