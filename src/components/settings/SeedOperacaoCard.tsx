'use client'

import { useState } from 'react'
import { Loader2, PlayCircle } from 'lucide-react'
import { toast } from '@/lib/toast'

type SeedCounts = {
  usersCreated?: number
  usersUpdated?: number
  templatesUpserted?: number
  recurrencesUpserted?: number
  stepsCreated?: number
}

export function SeedOperacaoCard() {
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [seed, setSeed] = useState<SeedCounts | null>(null)
  const [tally, setTally] = useState<{ created: number; skipped: number; failed: number } | null>(null)
  const [semGestor, setSemGestor] = useState<{ name: string; slug: string }[] | null>(null)

  async function post(qs: string) {
    const res = await fetch(`/api/admin/seed-operacao${qs}`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error || 'Falha na requisição')
    return data
  }

  async function run(backfill: boolean) {
    setLoading(true)
    setProgress(null)
    setTally(null)
    setSemGestor(null)
    try {
      // Fase 1 — seed (rápido): time + templates + recorrências.
      const seedRes = await post('?phase=seed')
      setSeed(seedRes.seed)

      if (!backfill) {
        toast('Operação semeada (time + templates + recorrências).', 'ok')
        return
      }

      // Fase 2 — backfill em lotes (evita timeout serverless). Repete até done.
      const total: number = seedRes.totalActiveClients ?? 0
      let cursor: string | null = null
      let processed = 0
      const acc = { created: 0, skipped: 0, failed: 0 }
      // trava de segurança contra loop infinito
      for (let i = 0; i < 500; i++) {
        const qs = `?phase=backfill&batch=6${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
        const r = await post(qs)
        acc.created += r.created ?? 0
        acc.skipped += r.skipped ?? 0
        acc.failed += r.failed ?? 0
        processed += r.processed ?? 0
        cursor = r.lastId ?? cursor
        setProgress(total ? `${Math.min(processed, total)}/${total} clientes` : `${processed} clientes`)
        setTally({ ...acc })
        if (r.done) break
      }

      // Se houve falhas, mostra quais clientes estão sem gestor (causa comum).
      if (acc.failed > 0) {
        try {
          const diag = await post('?phase=diagnostico')
          setSemGestor(diag.semGestor ?? [])
        } catch { /* diagnóstico é best-effort */ }
      }

      toast('Tarefas geradas nos clientes ativos.', 'ok')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível concluir.', 'err')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <p className="text-xs text-[#87919E] mb-4">
        Cria (sem duplicar) o time real, os 15 templates de tarefas recorrentes e suas
        recorrências. O <strong>backfill</strong> gera as 15 tarefas fixas para cada cliente
        ativo de hoje, com o responsável certo (gestor, CS, CRM). Processa em lotes — pode
        levar alguns segundos. Pode rodar mais de uma vez sem duplicar.
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

      {(loading && progress) && (
        <p className="mt-3 text-xs text-[#95BBE2]">Gerando tarefas… {progress}</p>
      )}

      {(seed || tally) && (
        <div className="mt-4 text-xs text-[#87919E] space-y-0.5 border-t border-[#38435C] pt-3">
          {seed && (
            <>
              <p>Usuários: <span className="text-[#EBEBEB]">{seed.usersCreated ?? 0}</span> criados, <span className="text-[#EBEBEB]">{seed.usersUpdated ?? 0}</span> atualizados</p>
              <p>Templates: <span className="text-[#EBEBEB]">{seed.templatesUpserted ?? 0}</span> · Recorrências: <span className="text-[#EBEBEB]">{seed.recurrencesUpserted ?? 0}</span></p>
            </>
          )}
          {tally && (
            <p>
              Tarefas geradas: <span className="text-[#EBEBEB]">{tally.created}</span>
              {' · '}puladas (já existiam): <span className="text-[#EBEBEB]">{tally.skipped}</span>
              {' · '}falhas: <span className="text-[#EBEBEB]">{tally.failed}</span>
            </p>
          )}
        </div>
      )}

      {semGestor && semGestor.length > 0 && (
        <div className="mt-4 border border-[#F59E0B]/30 bg-[#F59E0B]/5 rounded-lg p-3">
          <p className="text-xs font-semibold text-[#F59E0B] mb-1">
            {semGestor.length} cliente{semGestor.length > 1 ? 's' : ''} sem gestor atribuído
          </p>
          <p className="text-[11px] text-[#87919E] mb-2">
            As tarefas de tráfego desses clientes falham até um gestor ser definido no card do cliente.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {semGestor.map((c) => (
              <a
                key={c.slug}
                href={`/clients/${c.slug}`}
                className="text-[11px] px-2 py-0.5 rounded-full bg-[#38435C]/60 text-[#EBEBEB] hover:bg-[#38435C] transition-colors"
              >
                {c.name}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
