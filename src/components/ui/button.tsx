'use client'

import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'accent'
  size?: 'sm' | 'md' | 'lg' | 'icon'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#95BBE2]/50 disabled:opacity-50 disabled:cursor-not-allowed',
          {
            'bg-[#95BBE2] text-[#05141C] hover:bg-[#7aafd9]': variant === 'default' || variant === 'accent',
            'border border-[#38435C] text-[#EBEBEB] hover:bg-[#38435C]': variant === 'outline',
            'text-[#EBEBEB] hover:bg-[#38435C]': variant === 'ghost',
            'bg-[#EF4444] text-white hover:bg-red-600': variant === 'destructive',
          },
          {
            'h-8 px-3 text-xs': size === 'sm',
            'h-10 px-4 text-sm': size === 'md',
            'h-12 px-6 text-base': size === 'lg',
            'h-9 w-9 p-0': size === 'icon',
          },
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
