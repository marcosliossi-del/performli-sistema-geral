'use client'

import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { tagColor } from './tokens'

/**
 * Chip simples de tag. Cor suave determinística por texto (hash), sempre
 * derivada das variáveis --ak-* (sem hex novo). Aceita cor explícita opcional
 * (ex. cor definida na Tag do banco).
 */
export function TagChip({
  label,
  color,
  size = 'md',
  onRemove,
  className,
}: {
  label: string
  color?: string
  size?: 'sm' | 'md'
  onRemove?: () => void
  className?: string
}) {
  const base = color ?? tagColor(label)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]',
        className,
      )}
      style={{
        color: base,
        borderColor: `color-mix(in srgb, ${base} 30%, transparent)`,
        background: `color-mix(in srgb, ${base} 12%, transparent)`,
      }}
    >
      <span className="truncate">{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover tag ${label}`}
          className="-mr-0.5 rounded-full p-0.5 hover:bg-white/10"
        >
          <X size={10} aria-hidden />
        </button>
      )}
    </span>
  )
}
