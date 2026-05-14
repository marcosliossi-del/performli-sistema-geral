'use client'

import { useState, useTransition } from 'react'
import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'
import { syncWeeklyGoalsFromMonthly } from '@/app/actions/goals'

export function SyncWeeklyGoalsButton() {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ created: number; total: number } | null>(null)
  const [error, setError]   = useState<string | null>(null)

  function handleSync() {
    setResult(null)
    setError(null)
    startTransition(async () => {
      const res = await syncWeeklyGoalsFromMonthly()
      if (res.error) {
        setError(res.error)
      } else {
        setResult({ created: res.created, total: res.total })
      }
    })
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSync}
        disabled={isPending}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#95BBE2]/20 border border-[#95BBE2]/40 text-[#95BBE2] text-xs font-semibold hover:bg-[#95BBE2]/30 disabled:opacity-50 transition-all"
      >
        <RefreshCw size={13} className={isPending ? 'animate-spin' : ''} />
        {isPending ? 'Sincronizando...' : 'Sincronizar Metas Semanais'}
      </button>

      {result && (
        <span className="flex items-center gap-1.5 text-xs text-[#22C55E]">
          <CheckCircle size={13} />
          {result.created > 0
            ? `${result.created} meta${result.created !== 1 ? 's' : ''} semanal${result.created !== 1 ? 'is' : ''} criada${result.created !== 1 ? 's' : ''} (de ${result.total} mensais)`
            : `Todas as ${result.total} metas semanais já existiam`
          }
        </span>
      )}

      {error && (
        <span className="flex items-center gap-1.5 text-xs text-[#EF4444]">
          <AlertCircle size={13} />
          {error}
        </span>
      )}
    </div>
  )
}
