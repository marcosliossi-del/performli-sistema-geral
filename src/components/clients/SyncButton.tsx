'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface SyncButtonProps {
  clientId: string
  size?: 'sm' | 'md'
}

export function SyncButton({ clientId, size = 'sm' }: SyncButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const router = useRouter()

  async function handleSync() {
    setState('loading')
    try {
      const res = await fetch('/api/sync/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      if (res.ok) {
        setState('ok')
        router.refresh()
        setTimeout(() => setState('idle'), 3000)
      } else {
        setState('error')
        setTimeout(() => setState('idle'), 3000)
      }
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }

  return (
    <Button variant="outline" size={size} onClick={handleSync} disabled={state === 'loading'}>
      {state === 'loading' && <RefreshCw size={14} className="animate-spin" />}
      {state === 'ok' && <CheckCircle2 size={14} className="text-[#22C55E]" />}
      {state === 'error' && <AlertTriangle size={14} className="text-[#EF4444]" />}
      {state === 'idle' && <RefreshCw size={14} />}
      {state === 'loading' ? 'Calculando...' : state === 'ok' ? 'Atualizado!' : state === 'error' ? 'Erro' : 'Recalcular saúde'}
    </Button>
  )
}
