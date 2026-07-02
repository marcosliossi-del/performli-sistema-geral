'use client'

import { CalendarClock, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Chip de prazo — responde "qual o prazo?" em linguagem operacional.
 * Estados: futuro (neutro) · hoje ("Hoje", warning) · atrasado ("há X dias", danger)
 * · sem data ("Sem prazo", low). Ícone Repeat quando a tarefa é recorrente.
 *
 * O cálculo de "hoje/atrasado" é feito por DIA no fuso America/Sao_Paulo,
 * coerente com D-006 (UTC no banco, TZ explícita no cálculo).
 */

const TZ = 'America/Sao_Paulo'

/** Nº de dias inteiros de `date` até hoje (negativo = passado), no fuso Arkza. */
function dayDiffFromToday(date: Date): number {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const toKey = (d: Date) => fmt.format(d) // YYYY-MM-DD
  const today = new Date()
  const a = Date.parse(toKey(date))
  const b = Date.parse(toKey(today))
  return Math.round((a - b) / 86_400_000)
}

function labelFor(days: number, date: Date): string {
  if (days === 0) return 'Hoje'
  if (days < 0) {
    const n = Math.abs(days)
    return n === 1 ? 'Atrasada há 1 dia' : `Atrasada há ${n} dias`
  }
  if (days === 1) return 'Amanhã'
  if (days <= 7) return `Em ${days} dias`
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
  }).format(date)
}

export function DueDateChip({
  dueDate,
  recurring = false,
  size = 'md',
  className,
}: {
  dueDate: Date | string | null | undefined
  recurring?: boolean
  size?: 'sm' | 'md'
  className?: string
}) {
  const textSize = size === 'sm' ? 'text-[11px]' : 'text-xs'
  const iconSize = size === 'sm' ? 12 : 13

  if (dueDate == null) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-text-low', textSize, className)}>
        <CalendarClock size={iconSize} aria-hidden />
        <span>Sem prazo</span>
        {recurring && <Repeat size={iconSize} className="opacity-80" aria-label="Recorrente" />}
      </span>
    )
  }

  const date = typeof dueDate === 'string' ? new Date(dueDate) : dueDate
  const days = dayDiffFromToday(date)
  const tone =
    days < 0 ? 'text-danger' : days === 0 ? 'text-warning' : 'text-text-mid'
  const absolute = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)

  return (
    <span
      className={cn('inline-flex items-center gap-1', tone, textSize, className)}
      title={absolute}
    >
      <CalendarClock size={iconSize} aria-hidden />
      <span className={days <= 0 ? 'font-medium' : undefined}>{labelFor(days, date)}</span>
      {recurring && <Repeat size={iconSize} className="opacity-80" aria-label="Recorrente" />}
    </span>
  )
}
