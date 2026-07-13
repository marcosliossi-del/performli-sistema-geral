'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export interface ClientSectionAnchor {
  id: string
  label: string
}

/** 'sec-visao-geral' → 'visao-geral' (slug usado no ?tab=). */
export function tabSlug(id: string): string {
  return id.replace(/^sec-/, '')
}

/**
 * Navegação por ABAS do Client 360.
 * Cada aba corresponde a uma <section id="sec-..."> renderizada na página.
 * A troca é client-side: alterna a classe `hidden` das sections no DOM e
 * atualiza `?tab=` via router.replace (sem full reload). Deep-link server-side
 * também funciona — a página já esconde as sections não-ativas no SSR.
 *
 * Compatibilidade de âncoras: se a URL chegar com `#sec-...` (ou uma âncora
 * interna como `#chat`), mapeamos para a aba correspondente na montagem.
 */
export function ClientSectionNav({
  anchors,
  activeTab: initialTab,
}: {
  anchors: ClientSectionAnchor[]
  activeTab: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [active, setActive] = useState<string>(initialTab)
  const mounted = useRef(false)

  // Aplica a visibilidade das sections conforme a aba ativa.
  const applyVisibility = useCallback(
    (slug: string) => {
      for (const a of anchors) {
        const el = document.getElementById(a.id)
        if (el) el.classList.toggle('hidden', tabSlug(a.id) !== slug)
      }
    },
    [anchors],
  )

  // Montagem: reconcilia com uma âncora presente na URL (#sec-... ou #chat).
  useEffect(() => {
    if (mounted.current) return
    mounted.current = true

    const hash = window.location.hash.slice(1)
    if (hash) {
      const el = document.getElementById(hash)
      const section = el?.closest('section[id^="sec-"]') as HTMLElement | null
      const fromHash = section ? tabSlug(section.id) : anchors.find((a) => tabSlug(a.id) === hash) ? hash : null
      if (fromHash && fromHash !== active) {
        setActive(fromHash)
        applyVisibility(fromHash)
        return
      }
    }
    applyVisibility(active)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function selectTab(id: string) {
    const slug = tabSlug(id)
    setActive(slug)
    applyVisibility(slug)

    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', slug)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <nav
      aria-label="Seções do cliente"
      role="tablist"
      className="sticky top-0 z-30 -mx-6 px-6 bg-[#05141C]/95 backdrop-blur border-b border-[#38435C]/60 print:hidden"
    >
      <div className="flex items-center gap-1 overflow-x-auto">
        {anchors.map((a) => {
          const isActive = tabSlug(a.id) === active
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => selectTab(a.id)}
              className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'border-[#95BBE2] text-[#95BBE2]'
                  : 'border-transparent text-[#87919E] hover:text-[#EBEBEB]'
              }`}
            >
              {a.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
