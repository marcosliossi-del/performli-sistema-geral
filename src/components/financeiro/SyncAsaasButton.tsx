'use client'

import { useState } from 'react'
import { RefreshCw, Loader2, CheckCircle, XCircle } from 'lucide-react'

export function SyncAsaasButton() {
  const [state,   setState]   = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [details, setDetails] = useState<{ msg: string; sub?: string } | null>(null)

  async function handleSync() {
    setState('loading')
    setDetails(null)
    try {
      const res  = await fetch('/api/asaas/sync', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setState('ok')
        const parts = [
          data.customers     != null && `${data.customers} clientes`,
          data.payments      != null && `${data.payments} cobranças`,
          data.subscriptions != null && `${data.subscriptions} assinaturas`,
          data.transfers     != null && `${data.transfers} transferências`,
        ].filter(Boolean).join(' · ')
        setDetails({ msg: 'Sincronizado!', sub: parts || undefined })
      } else {
        setState('error')
        setDetails({ msg: data.error ?? 'Erro ao sincronizar' })
      }
    } catch {
      setState('error')
      setDetails({ msg: 'Erro de conexão com o servidor' })
    }
    setTimeout(() => { setState('idle'); setDetails(null) }, 8000)
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleSync}
        disabled={state === 'loading'}
        className="flex items-center gap-1.5 text-xs text-[#87919E] hover:text-[#EBEBEB] transition-colors disabled:opacity-50"
      >
        {state === 'loading' && <Loader2    size={12} className="animate-spin" />}
        {state === 'ok'      && <CheckCircle size={12} className="text-[#22C55E]" />}
        {state === 'error'   && <XCircle    size={12} className="text-[#EF4444]" />}
        {state === 'idle'    && <RefreshCw  size={12} />}
        {state === 'loading' ? 'Sincronizando...' : state === 'ok' ? details?.msg : state === 'error' ? 'Erro — ver detalhes' : 'Sincronizar Asaas'}
      </button>
      {details?.sub && state === 'ok' && (
        <span className="text-[10px] text-[#87919E]">{details.sub}</span>
      )}
      {details?.msg && state === 'error' && (
        <span className="text-[10px] text-[#EF4444] max-w-xs text-right leading-relaxed">{details.msg}</span>
      )}
    </div>
  )
}
