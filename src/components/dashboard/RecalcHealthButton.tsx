'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

export function RecalcHealthButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setResult('Sincronizando...')
    try {
      const res = await fetch('/api/sync/health', {
        method: 'POST',
        body: JSON.stringify({ sync: true }),
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const text = await res.text().catch(() => `HTTP ${res.status}`)
        setResult(`Erro ${res.status}`)
        console.error('[RecalcHealth]', res.status, text)
        return
      }
      const data = await res.json()
      if (data.ok) {
        setResult(`✓ ${data.clientsProcessed} atualizados`)
        // router.refresh() tells Next.js to re-run Server Components for the
        // current page, bypassing the route cache — so fresh DB data is shown
        // immediately instead of the stale ISR-cached version.
        setTimeout(() => { setResult(null); router.refresh() }, 1500)
      } else {
        setResult(data.error ?? 'Erro ao sincronizar')
      }
    } catch (e) {
      setResult('Erro de rede')
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
