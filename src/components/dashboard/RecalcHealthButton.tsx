'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

const STEPS = [
  { label: 'Sincronizando GA4...', path: '/api/sync/ga4',         body: '{}' },
  { label: 'Sincronizando Meta...', path: '/api/sync/meta',        body: '{}' },
  { label: 'Sincronizando Google Ads...', path: '/api/sync/google-ads', body: '{}' },
  { label: 'Recalculando saúde...', path: '/api/sync/health',      body: '{}' },
]

export function RecalcHealthButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    try {
      for (const step of STEPS) {
        setResult(step.label)
        // Each request has its own timeout — failure of one step doesn't stop the rest
        const res = await fetch(step.path, {
          method: 'POST',
          body: step.body,
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(90_000),
        }).catch(() => null)

        if (!res?.ok) {
          console.warn(`[RecalcHealth] ${step.path} responded ${res?.status ?? 'network error'} — continuing`)
        }
      }

      setResult('✓ Dados atualizados')
      setTimeout(() => { setResult(null); router.refresh() }, 1500)
    } catch (e) {
      setResult('Erro ao sincronizar')
      console.error('[RecalcHealth]', e)
    } finally {
      setLoading(false)
    }
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
