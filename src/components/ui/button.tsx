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
          'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-[#95BBE2]/50 active:scale-[0.96] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
          {
            'bg-gradient-to-b from-[#54e0ee] to-[#22c2d6] text-[#021015] shadow-[0_6px_18px_-6px_rgba(34,194,214,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] hover:brightness-[1.07]': variant === 'default' || variant === 'accent',
            'border border-[#38435C] text-[#EBEBEB] hover:bg-[#38435C]': variant === 'outline',
            'text-[#EBEBEB] hover:bg-[#38435C]': variant === 'ghost',
            'bg-[#EF4444] text-white hover:brightness-110': variant === 'destructive',
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
