'use client'

import { useState } from 'react'
import { Loader2, PlayCircle } from 'lucide-react'
import { toast } from '@/lib/toast'

type SeedResult = {
  ok?: boolean
  seed?: {
    usersCreated?: number
    usersUpdated?: number
    templatesUpserted?: number
    recurrencesUpserted?: number
    stepsCreated?: number
  }
  recurrence?: { created?: number; skipped?: number; failed?: number }
  error?: string
}

export function SeedOperacaoCard() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SeedResult | null>(null)

  async function run(backfill: boolean) {
    setLoading(true)
    setResult(null)
    try {
      const url = backfill ? '/api/admin/seed-operacao?backfill=1' : '/api/admin/seed-operacao'
      const res = await fetch(url, { method: 'POST' })
      const data: SeedResult = await res.json()
      if (!res.ok) {
        toast(data.error || 'Falha ao semear a operação.', 'err')
      } else {
        setResult(data)
        toast(
          backfill
            ? 'Operação semeada e tarefas geradas nos clientes ativos.'
            : 'Operação semeada (time + templates + recorrências).',
          'ok',
        )
      }
    } catch {
      toast('Não foi possível concluir. Tente novamente.', 'err')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <p className="text-xs text-[#87919E] mb-4">
        Cria (sem duplicar) o time real, os 15 templates de tarefas recorrentes e suas
        recorrências. O <strong>backfill</strong> gera as 15 tarefas fixas para cada cliente
        ativo de hoje, com o responsável certo (gestor, CS, CRM). Pode rodar mais de uma vez.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run(false)}
          disabled={loading}
          className="flex items-center gap-2 text-xs text-[#EBEBEB] border border-[#38435C] rounded-lg px-3 py-2 transition-colors hover:bg-[#38435C]/40 disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}
          Semear operação
        </button>
        <button
          type="button"
          onClick={() => run(true)}
          disabled={loading}
          className="flex items-center gap-2 text-xs font-semibold text-[#0A1E2C] bg-[#95BBE2] rounded-lg px-3 py-2 transition-colors hover:bg-[#95BBE2]/90 disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}
          Semear + gerar tarefas (backfill)
        </button>
      </div>

      {result?.seed && (
        <div className="mt-4 text-xs text-[#87919E] space-y-0.5 border-t border-[#38435C] pt-3">
          <p>Usuários: <span className="text-[#EBEBEB]">{result.seed.usersCreated ?? 0}</span> criados, <span className="text-[#EBEBEB]">{result.seed.usersUpdated ?? 0}</span> atualizados</p>
          <p>Templates: <span className="text-[#EBEBEB]">{result.seed.templatesUpserted ?? 0}</span> · Recorrências: <span className="text-[#EBEBEB]">{result.seed.recurrencesUpserted ?? 0}</span></p>
          {result.recurrence && (
            <p>
              Tarefas geradas: <span className="text-[#EBEBEB]">{result.recurrence.created ?? 0}</span>
              {' · '}puladas (já existiam): <span className="text-[#EBEBEB]">{result.recurrence.skipped ?? 0}</span>
              {' · '}falhas: <span className="text-[#EBEBEB]">{result.recurrence.failed ?? 0}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
