'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Popover leve reutilizado pelos seletores interativos do módulo (status,
 * prioridade, responsáveis). Sem dependência externa: fecha no Esc, no clique
 * fora e devolve o foco ao gatilho. Alinhado à esquerda por padrão.
 */
export function Popover({
  trigger,
  children,
  align = 'left',
  panelClassName,
  label,
}: {
  trigger: (props: { open: boolean; toggle: () => void; triggerId: string }) => React.ReactNode
  children: (close: () => void) => React.ReactNode
  align?: 'left' | 'right'
  panelClassName?: string
  label: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerId = useId()

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative inline-flex">
      {trigger({ open, toggle: () => setOpen((v) => !v), triggerId })}
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={cn(
            'lg-glass absolute top-full z-50 mt-1 min-w-[200px] rounded-xl border border-[var(--ak-hair)] p-1 shadow-[var(--ak-shadow-pop)]',
            align === 'right' ? 'right-0' : 'left-0',
            panelClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
