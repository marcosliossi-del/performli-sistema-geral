'use client'

import { useState } from 'react'
import { RefreshCw, CheckCircle2 } from 'lucide-react'

type SyncState = 'idle' | 'running' | 'reloading' | 'done'

export function RecalcHealthButton() {
  const [state,    setState]    = useState<SyncState>('idle')
  const [label,    setLabel]    = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  async function handleClick() {
    setState('running')
    setProgress(null)
    setLabel(null)

    try {
      const res = await fetch('/api/sync/stream', { method: 'GET' })
      if (!res.ok || !res.body) {
        setState('idle')
        setLabel('Erro ao iniciar')
        return
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { done, value } = await reader.read()

        if (!done) {
          buffer += decoder.decode(value, { stream: true })
        }

        // Process buffered SSE messages (also on done, to flush last chunk)
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.split('\n').find(l => l.startsWith('data:'))
          if (!line) continue
          try {
            const event = JSON.parse(line.slice(5).trim())

            if (event.type === 'start') {
              setLabel(event.name)
              setProgress({ done: event.done, total: event.total })
              window.dispatchEvent(new CustomEvent('sync-client-start', { detail: { clientId: event.clientId } }))
            }

            if (event.type === 'done' && event.row) {
              setLabel(event.name)
              setProgress({ done: event.done, total: event.total })
              window.dispatchEvent(new CustomEvent('sync-row-update', { detail: event.row }))
            }
          } catch { /* malformed SSE event */ }
        }

        if (done) break
      }

      // Stream closed = all clients processed. Trigger full dashboard refresh.
      // This runs regardless of whether the 'complete' event was received,
      // making the reload reliable even if the last SSE chunk was lost.
      window.dispatchEvent(new CustomEvent('sync-complete', { detail: {} }))
      setState('reloading')
      setLabel(null)
      setProgress(null)
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      setState('idle')
      setLabel('Erro de conexão')
      console.error('[RecalcHealth]', e)
    }
  }

  if (state === 'reloading') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[#22C55E] animate-pulse">
        <CheckCircle2 size={12} />
        <span>Atualizando dashboard...</span>
      </span>
    )
  }

  const isRunning    = state === 'running'
  const displayLabel =
    isRunning && label && progress
      ? `${label} (${progress.done}/${progress.total})`
      : label ?? 'Recalcular saúde'

  return (
    <button
      onClick={handleClick}
      disabled={isRunning}
      className="flex items-center gap-1.5 text-xs text-[#87919E] hover:text-[#EBEBEB] transition-colors disabled:opacity-60"
      title="Sincronizar todos os clientes e recalcular saúde"
    >
      <RefreshCw size={12} className={isRunning ? 'animate-spin' : ''} />
      <span className="max-w-[200px] truncate">{displayLabel}</span>
    </button>
  )
}
