'use client'

import { useEffect, useRef } from 'react'

/**
 * Acessibilidade padrão para modais/drawers:
 * - Esc fecha o modal
 * - trava o foco dentro do painel (Tab não escapa)
 * - devolve o foco ao elemento que abriu o modal ao fechar
 * - trava o scroll do body enquanto aberto
 *
 * Uso:
 *   const ref = useModalA11y<HTMLDivElement>(onClose)
 *   <div role="dialog" aria-modal="true" ref={ref}>…</div>
 */
export function useModalA11y<T extends HTMLElement = HTMLDivElement>(
  onClose: () => void,
): React.RefObject<T | null> {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null

    // Foca o primeiro elemento focável do painel ao abrir.
    const focusables = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null)

    focusables()[0]?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = prevOverflow
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  return ref
}
