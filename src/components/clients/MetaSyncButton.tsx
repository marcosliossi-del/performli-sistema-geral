'use client'

import { useState } from 'react'
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface MetaSyncButtonProps {
  platformAccountId: string
}

export function MetaSyncButton({ platformAccountId }: MetaSyncButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const router = useRouter()

  async function handleSync() {
    setState('loading')
    setErrorMsg(null)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 65_000)

    try {
      const res = await fetch('/api/sync/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platformAccountId }),
        signal: controller.signal,
      })

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
      setState('error')
      setErrorMsg((err as Error).name === 'AbortError' ? 'Tempo esgotado (65s)' : 'Erro de conexão')
    } finally {
      clearTimeout(timeoutId)
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
      <div className="flex flex-col gap-1">
        <button
          onClick={handleSync}
          className="flex items-center gap-1 text-[#EF4444] hover:text-[#EF4444]/80 transition-colors"
        >
          <AlertCircle size={12} />
          <span className="text-[10px]">Erro · Tentar de novo</span>
        </button>
        {errorMsg && (
          <span className="text-[9px] text-[#EF4444]/70 max-w-[200px] break-words leading-tight">
            {errorMsg}
          </span>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={handleSync}
      disabled={state === 'loading'}
      title="Sincronizar agora"
      className="flex items-center gap-1 text-[#87919E] hover:text-[#95BBE2] transition-colors disabled:opacity-50"
    >
      <RefreshCw size={12} className={state === 'loading' ? 'animate-spin' : ''} />
      <span className="text-[10px]">{state === 'loading' ? 'Sync...' : 'Sincronizar'}</span>
    </button>
  )
}
