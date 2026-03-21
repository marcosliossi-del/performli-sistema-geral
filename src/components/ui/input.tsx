import { cn } from '@/lib/utils'
import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full h-10 px-3 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-[#EBEBEB] placeholder-[#87919E] text-sm',
          'focus:outline-none focus:ring-2 focus:ring-[#95BBE2]/50 focus:border-[#95BBE2]',
          'transition-all duration-150',
          className
        )}
        {...props}
      />
    )
  }
)

Input.displayName = 'Input'
