'use client'

import { useEffect, useState } from 'react'

export interface ClientSectionAnchor {
  id: string
  label: string
}

/**
 * Sub-header sticky de navegação interna da página do cliente.
 * O gestor entra 2x/dia e precisa pular direto para a exceção — sem rolar as
 * ~20 seções empilhadas. Puramente de UX: âncoras <a href="#..."> + realce da
 * seção visível via IntersectionObserver (sem libs novas).
 */
export function ClientSectionNav({ anchors }: { anchors: ClientSectionAnchor[] }) {
  const [activeId, setActiveId] = useState<string>(anchors[0]?.id ?? '')

  useEffect(() => {
    const sections = anchors
      .map((a) => document.getElementById(a.id))
      .filter((el): el is HTMLElement => el !== null)
    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // Seção mais próxima do topo entre as visíveis vira a ativa.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) {
          setActiveId(visible[0].target.id)
        }
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: 0 },
    )

    sections.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [anchors])

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const el = document.getElementById(id)
    if (!el) return
    e.preventDefault()
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveId(id)
  }

  return (
    <nav
      aria-label="Seções do cliente"
      className="sticky top-0 z-30 -mx-6 px-6 py-2 bg-[#05141C]/95 backdrop-blur border-b border-[#38435C]/60 print:hidden"
    >
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {anchors.map((a) => {
          const active = a.id === activeId
          return (
            <a
              key={a.id}
              href={`#${a.id}`}
              onClick={(e) => handleClick(e, a.id)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'bg-[#95BBE2]/15 text-[#95BBE2]'
                  : 'bg-[#38435C]/50 text-[#EBEBEB] hover:bg-[#38435C]/80'
              }`}
            >
              {a.label}
            </a>
          )
        })}
      </div>
    </nav>
  )
}
