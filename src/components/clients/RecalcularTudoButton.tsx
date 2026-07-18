'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { toast } from '@/lib/toast'

/**
 * Recálculo geral (ADMIN): saúde de TODOS os clientes + Resultado semanal, na
 * hora — sem esperar o cron diário. Criado na auditoria sistêmica para o
 * Marcos validar a convergência dos números após os Lotes 1-6.
 */
export function RecalcularTudoButton() {
  const [running, setRunning] = useState(false)
  const router = useRouter()

  async function run() {
    setRunning(true)
    try {
      const res = await fetch('/api/sync/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recalcResultado: true }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        toast(json?.error ?? 'Falha ao recalcular. Tente novamente.', 'err')
        return
      }
      toast('Saúde e Resultado recalculados para todos os clientes.')
      router.refresh()
    } catch {
      toast('Não foi possível conectar. Verifique a conexão e tente de novo.', 'err')
    } finally {
      setRunning(false)
    }
  }

  return (
    <button
      onClick={run}
      disabled={running}
      className="inline-flex items-center gap-2 rounded-[10px] border border-[#38435C] px-3 py-2 text-[12.5px] font-medium text-[#a3b2c2] hover:bg-white/[0.05] hover:text-[#f2f6fa] disabled:opacity-60 transition-all"
      title="Recalcula o quadro de saúde e o Resultado semanal de todos os clientes agora"
    >
      <RefreshCw size={14} className={running ? 'animate-spin' : ''} />
      {running ? 'Recalculando…' : 'Recalcular saúde (todos)'}
    </button>
  )
}
