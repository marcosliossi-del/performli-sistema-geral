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
  const [carteiras, setCarteiras] = useState<{ updated: number; notFound: string[] } | null>(null)
  const [novos, setNovos] = useState<{ created: string[]; skipped: string[] } | null>(null)
  const [candidates, setCandidates] = useState<{ name: string; slug: string }[] | null>(null)

  async function post(qs: string) {
    const res = await fetch(`/api/admin/seed-operacao${qs}`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error || 'Falha na requisição')
    return data
  }

  async function backfillLoop() {
    let cursor: string | null = null
    let processed = 0
    const acc = { created: 0, skipped: 0, failed: 0 }
    for (let i = 0; i < 500; i++) {
      const qs = `?phase=backfill&batch=6${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
      const r = await post(qs)
      acc.created += r.created ?? 0
      acc.skipped += r.skipped ?? 0
      acc.failed += r.failed ?? 0
      processed += r.processed ?? 0
      cursor = r.lastId ?? cursor
      setProgress(`${processed} clientes`)
      setTally({ ...acc })
      if (r.done) break
    }
    if (acc.failed > 0) {
      try {
        const diag = await post('?phase=diagnostico')
        setSemGestor(diag.semGestor ?? [])
      } catch { /* best-effort */ }
    }
  }

  async function runCarteiras() {
    setLoading(true)
    setProgress(null)
    setTally(null)
    setSemGestor(null)
    setCarteiras(null)
    setNovos(null)
    setCandidates(null)
    try {
      const res = await post('?phase=carteiras')
      setCarteiras(res.carteiras)
      setNovos(res.novos ?? null)
      setCandidates(res.candidates ?? null)
      // Regera as tarefas agora que os gestores estão atribuídos.
      await backfillLoop()
      toast(`Carteiras preenchidas (${res.carteiras?.updated ?? 0} clientes) e tarefas geradas.`, 'ok')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível concluir.', 'err')
    } finally {
      setLoading(false)
    }
  }

  async function runCancelar() {
    if (!candidates || candidates.length === 0) return
    setLoading(true)
    try {
      const res = await post('?phase=cancelar')
      setCandidates([])
      toast(`${res.cancelled?.length ?? 0} cliente(s) cancelado(s) (fora da carteira).`, 'ok')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível cancelar.', 'err')
    } finally {
      setLoading(false)
    }
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
        <button
          type="button"
          onClick={runCarteiras}
          disabled={loading}
          className="flex items-center gap-2 text-xs text-[#EBEBEB] border border-[#38435C] rounded-lg px-3 py-2 transition-colors hover:bg-[#38435C]/40 disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}
          Preencher carteiras (gestor + metas + novos)
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

      {carteiras && (
        <div className="mt-4 text-xs text-[#87919E] space-y-0.5 border-t border-[#38435C] pt-3">
          <p>Carteiras preenchidas: <span className="text-[#EBEBEB]">{carteiras.updated}</span> clientes</p>
          {novos && (novos.created.length > 0 || novos.skipped.length > 0) && (
            <p>
              Novos criados: <span className="text-[#EBEBEB]">{novos.created.join(', ') || '—'}</span>
              {novos.skipped.length > 0 && <> · já existiam: <span className="text-[#EBEBEB]">{novos.skipped.join(', ')}</span></>}
            </p>
          )}
          {carteiras.notFound.length > 0 && (
            <p className="text-[#F59E0B]">Não encontrados (conferir nome): {carteiras.notFound.join(', ')}</p>
          )}
        </div>
      )}

      {candidates && candidates.length > 0 && (
        <div className="mt-4 border border-[#EF4444]/30 bg-[#EF4444]/5 rounded-lg p-3">
          <p className="text-xs font-semibold text-[#EF4444] mb-1">
            {candidates.length} cliente{candidates.length > 1 ? 's' : ''} fora da carteira (candidato a cancelamento)
          </p>
          <p className="text-[11px] text-[#87919E] mb-2">
            Não constam na carteira consolidada. Cancelar dispara o offboarding (suspende recorrências, arquiva mantendo histórico).
          </p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {candidates.map((c) => (
              <span key={c.slug} className="text-[11px] px-2 py-0.5 rounded-full bg-[#38435C]/60 text-[#EBEBEB]">{c.name}</span>
            ))}
          </div>
          <button
            type="button"
            onClick={runCancelar}
            disabled={loading}
            className="flex items-center gap-2 text-xs font-semibold text-white bg-[#EF4444] rounded-lg px-3 py-2 transition-colors hover:bg-[#EF4444]/90 disabled:opacity-50"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : null}
            Cancelar {candidates.length} cliente{candidates.length > 1 ? 's' : ''} fora da carteira
          </button>
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
