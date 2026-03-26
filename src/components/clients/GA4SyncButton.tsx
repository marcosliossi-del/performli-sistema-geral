'use client'

import { useState } from 'react'
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface GA4SyncButtonProps {
  platformAccountId: string
}

export function GA4SyncButton({ platformAccountId }: GA4SyncButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const router = useRouter()

  async function handleSync() {
    setState('loading')
    setErrorMsg(null)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 65_000)

    try {
      const res = await fetch('/api/sync/ga4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platformAccountId }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      const data = await res.json()

      if (!res.ok || !data.ok) {
        setState('error')
        setErrorMsg(data.error ?? 'Erro ao sincronizar')
        return
      }

      const result = data.results?.[0]
      if (result?.status === 'FAILED') {
        setState('error')
        setErrorMsg(result.errorMessage ?? 'Sync falhou')
        return
      }

      setState('ok')
      router.refresh()
      setTimeout(() => setState('idle'), 3000)
    } catch (err) {
      clearTimeout(timeoutId)
      setState('error')
      setErrorMsg((err as Error).name === 'AbortError' ? 'Tempo esgotado (65s)' : 'Erro de conexão')
    }
  }

  if (state === 'ok') {
    return (
      <div className="flex items-center gap-1 text-[#22C55E]">
        <CheckCircle2 size={12} />
        <span className="text-[10px]">Sync OK</span>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <button
        onClick={handleSync}
        title={errorMsg ?? 'Erro'}
        className="flex items-center gap-1 text-[#EF4444] hover:text-[#EF4444]/80 transition-colors"
      >
        <AlertCircle size={12} />
        <span className="text-[10px]">Erro · Tentar de novo</span>
      </button>
    )
  }

  return (
    <button
      onClick={handleSync}
      disabled={state === 'loading'}
      title="Sincronizar GA4 agora"
      className="flex items-center gap-1 text-[#87919E] hover:text-[#E37400] transition-colors disabled:opacity-50"
    >
      <RefreshCw size={12} className={state === 'loading' ? 'animate-spin' : ''} />
      <span className="text-[10px]">{state === 'loading' ? 'Sync...' : 'Sincronizar'}</span>
    </button>
  )
}
