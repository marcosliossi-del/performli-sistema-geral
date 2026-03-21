import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn('card p-5', className)}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className }: CardProps) {
  return (
    <div className={cn('flex items-center justify-between mb-4', className)}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className }: CardProps) {
  return (
    <h3 className={cn('text-sm font-medium text-[#87919E] uppercase tracking-wider', className)}>
      {children}
    </h3>
  )
}

export function CardValue({ children, className }: CardProps) {
  return (
    <p className={cn('text-3xl font-bold text-[#EBEBEB] mt-1', className)}>
      {children}
    </p>
  )
}

export function CardContent({ children, className }: CardProps) {
  return (
    <div className={cn('', className)}>
      {children}
    </div>
  )
}
