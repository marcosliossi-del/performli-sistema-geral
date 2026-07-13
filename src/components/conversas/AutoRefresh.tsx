'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Polling leve (R5 do discovery — sem websocket): revalida os dados do servidor
 * a cada `intervalMs` chamando `router.refresh()`. Pausa quando a aba está em
 * segundo plano (evita refresh inútil). Default 30s.
 */
export function AutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])
  return null
}
