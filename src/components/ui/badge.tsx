'use client'

import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'otimo' | 'regular' | 'ruim' | 'outline'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        {
          'bg-[#38435C] text-[#EBEBEB]': variant === 'default',
          'badge-otimo': variant === 'otimo',
          'badge-regular': variant === 'regular',
          'badge-ruim': variant === 'ruim',
          'border border-[#38435C] text-[#87919E]': variant === 'outline',
        },
        className
      )}
    >
      {children}
    </span>
  )
}
