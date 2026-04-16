'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

const STEPS = [
  { label: 'Sincronizando GA4...',         path: '/api/sync/ga4' },
  { label: 'Sincronizando Meta...',         path: '/api/sync/meta' },
  { label: 'Sincronizando Google Ads...',   path: '/api/sync/google-ads' },
  { label: 'Recalculando saúde...',         path: '/api/sync/health' },
]

export function RecalcHealthButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    try {
      for (const step of STEPS) {
        setResult(step.label)
        const res = await fetch(step.path, {
          method:  'POST',
          body:    '{}',
          headers: { 'Content-Type': 'application/json' },
          signal:  AbortSignal.timeout(90_000),
        }).catch(() => null)

        if (!res?.ok) {
          console.warn(`[RecalcHealth] ${step.path} → ${res?.status ?? 'network error'} (continuing)`)
        }
      }

      setResult('✓ Concluído — recarregando...')
      // Hard reload: page is force-dynamic so there is no stale ISR cache.
      // window.location.reload() guarantees a fresh server render of the full
      // page + layout, updating every section (manager cards, health grid, etc.)
      setTimeout(() => window.location.reload(), 800)
    } catch (e) {
      setResult('Erro ao sincronizar')
      console.error('[RecalcHealth]', e)
      setLoading(false)
    }
    // Don't setLoading(false) here — page reloads, component unmounts anyway
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-1.5 text-xs text-[#87919E] hover:text-[#EBEBEB] transition-colors disabled:opacity-50"
      title="Sincronizar dados e recalcular saúde de todos os clientes"
    >
      <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
      <span>{result ?? 'Recalcular saúde'}</span>
    </button>
  )
}
