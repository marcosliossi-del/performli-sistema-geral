'use client'

import { useState } from 'react'
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

/**
 * Sync manual da API GA4Sync (receita autoritativa da loja, agora com receita
 * LÍQUIDA/newCustomers). Antes só rodava no cron diário — caso My Muse:
 * impossível reprocessar o mês após o deploy do líquido sem esperar as 8h.
 */
export function Ga4SyncStoreButton({ clientId }: { clientId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const router = useRouter()

  async function handleSync() {
    setState('loading')
    setErrorMsg(null)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 65_000)
    try {
      const res = await fetch('/api/sync/ga4sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setState('error')
        setErrorMsg(data.error ?? data.result?.errorMessage ?? 'Erro ao sincronizar')
        return
      }
      setState('ok')
      router.refresh()
      setTimeout(() => setState('idle'), 4000)
    } catch (err) {
      clearTimeout(timeoutId)
      setState('error')
      setErrorMsg(err instanceof Error && err.name === 'AbortError' ? 'Tempo esgotado (65s)' : 'Erro de rede')
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        onClick={handleSync}
        disabled={state === 'loading'}
        title="Sincronizar receita da loja (GA4Sync — líquido)"
        className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-[#38435C] text-[#87919E] hover:text-[#EBEBEB] hover:border-[#95BBE2]/40 transition-colors disabled:opacity-50"
      >
        {state === 'loading' ? (
          <RefreshCw size={11} className="animate-spin" />
        ) : state === 'ok' ? (
          <CheckCircle2 size={11} className="text-[#22C55E]" />
        ) : state === 'error' ? (
          <AlertCircle size={11} className="text-[#EF4444]" />
        ) : (
          <RefreshCw size={11} />
        )}
        Sincronizar loja
      </button>
      {state === 'error' && errorMsg && <span className="text-[10px] text-[#EF4444]">{errorMsg}</span>}
    </span>
  )
}
