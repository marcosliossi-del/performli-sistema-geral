'use client'

import { useState } from 'react'
import { RefreshCw, Loader2, CheckCircle, XCircle } from 'lucide-react'

export function SyncAsaasButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [msg,   setMsg]   = useState('')

  async function handleSync() {
    setState('loading')
    setMsg('')
    try {
      const res  = await fetch('/api/asaas/sync', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setState('ok')
        setMsg('Sincronizado!')
      } else {
        setState('error')
        setMsg(data.error ?? 'Erro ao sincronizar')
      }
    } catch {
      setState('error')
      setMsg('Erro de conexão')
    }
    setTimeout(() => setState('idle'), 4000)
  }

  return (
    <button
      onClick={handleSync}
      disabled={state === 'loading'}
      className="flex items-center gap-1.5 text-xs text-[#87919E] hover:text-[#EBEBEB] transition-colors disabled:opacity-50"
    >
      {state === 'loading' && <Loader2   size={12} className="animate-spin" />}
      {state === 'ok'      && <CheckCircle size={12} className="text-[#22C55E]" />}
      {state === 'error'   && <XCircle    size={12} className="text-[#EF4444]" />}
      {state === 'idle'    && <RefreshCw  size={12} />}
      {state === 'loading' ? 'Sincronizando...' : state === 'ok' ? msg : state === 'error' ? msg : 'Sincronizar Asaas'}
    </button>
  )
}
