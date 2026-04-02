'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

interface Props {
  platformAccountId: string
  clientId: string
}

export function GoogleAdsSyncButton({ platformAccountId, clientId }: Props) {
  const [loading, setLoading] = useState(false)
  const [status,  setStatus]  = useState<'idle' | 'ok' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function handleSync() {
    setLoading(true)
    setStatus('idle')
    setMessage(null)

    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), 65_000)

    try {
      const res = await fetch('/api/sync/google-ads', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ platformAccountId, clientId }),
        signal:  controller.signal,
      })
      clearTimeout(timeout)

      const json = await res.json()
      if (!res.ok || !json.ok) {
        setStatus('error')
        setMessage(json.error ?? 'Erro desconhecido')
      } else {
        setStatus('ok')
        setMessage(`${json.results?.[0]?.recordsUpserted ?? 0} registros`)
        setTimeout(() => { setStatus('idle'); setMessage(null) }, 4000)
      }
    } catch (err) {
      clearTimeout(timeout)
      setStatus('error')
      setMessage((err as Error).name === 'AbortError' ? 'Tempo esgotado (65s)' : 'Erro de conexão')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={loading}
      title="Sincronizar Google Ads"
      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all disabled:opacity-60 ${
        status === 'ok'    ? 'bg-[#22C55E]/10 border-[#22C55E]/30 text-[#22C55E]'  :
        status === 'error' ? 'bg-[#EF4444]/10 border-[#EF4444]/30 text-[#EF4444]'  :
        'bg-[#4285F4]/10 border-[#4285F4]/30 text-[#4285F4] hover:bg-[#4285F4]/20'
      }`}
    >
      <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
      {loading ? 'Sincronizando...' : status === 'ok' ? `✓ ${message}` : status === 'error' ? message : 'Sync Google Ads'}
    </button>
  )
}
