'use client'

import { useState } from 'react'
import { Loader2, PlayCircle } from 'lucide-react'
import { toast } from '@/lib/toast'

type LoteResult = {
  criadas: number
  puladas: number
  naoConciliados: string[]
  erros: string[]
}

type VinculoResult = {
  vinculados: number
  jaVinculados: number
  clienteNaoEncontrado: string[]
  semVinculo: string[]
  duplicadosNoAsaas: string[]
  customersReligados: number
}

type ReconcileResult = {
  geradas: number
  conciliadas: number
  reabertas: number
  erros: string[]
}

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
  const [suporte, setSuporte] = useState<{ criadas: number; puladas: number; semCliente: string[]; erros: string[] } | null>(null)
  const [migracao, setMigracao] = useState<Record<string, LoteResult> | null>(null)
  const [reconcile, setReconcile] = useState<ReconcileResult | null>(null)
  const [vinculo, setVinculo] = useState<VinculoResult | null>(null)

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

  async function runSuporte() {
    setLoading(true)
    setSuporte(null)
    try {
      const res = await post('?phase=suporte')
      setSuporte(res.suporte ?? null)
      const s = res.suporte
      toast(`Suporte importado: ${s?.criadas ?? 0} criada(s), ${s?.puladas ?? 0} já existiam.`, 'ok')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível importar o suporte.', 'err')
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

  async function runMigrarClickUp() {
    setLoading(true)
    setMigracao(null)
    try {
      const res = await post('?phase=migrar-clickup&lote=tudo')
      setMigracao(res.migracao ?? null)
      const totalCriadas = Object.values(res.migracao ?? {}).reduce(
        (acc: number, l) => acc + ((l as LoteResult)?.criadas ?? 0),
        0,
      )
      toast(`Migração ClickUp concluída: ${totalCriadas} item(ns) criado(s).`, 'ok')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível migrar do ClickUp.', 'err')
    } finally {
      setLoading(false)
    }
  }

  async function runVincularAsaas() {
    setLoading(true)
    setVinculo(null)
    try {
      const res = await post('?phase=vincular-asaas')
      setVinculo(res.vinculo ?? null)
      const v = res.vinculo
      toast(`Vínculo Asaas: ${v?.vinculados ?? 0} cliente(s) vinculado(s), ${v?.customersReligados ?? 0} customer(s) religado(s).`, 'ok')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível vincular o Asaas.', 'err')
    } finally {
      setLoading(false)
    }
  }

  async function runReconciliarAsaas() {
    setLoading(true)
    setReconcile(null)
    try {
      const res = await post('?phase=reconciliar-asaas')
      setReconcile(res.reconcile ?? null)
      const r = res.reconcile
      toast(`Asaas conciliado: ${r?.geradas ?? 0} gerada(s), ${r?.conciliadas ?? 0} concluída(s), ${r?.reabertas ?? 0} reaberta(s).`, 'ok')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível conciliar o Asaas.', 'err')
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
        <button
          type="button"
          onClick={runSuporte}
          disabled={loading}
          className="flex items-center gap-2 text-xs text-[#EBEBEB] border border-[#38435C] rounded-lg px-3 py-2 transition-colors hover:bg-[#38435C]/40 disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}
          Importar Suporte (ClickUp)
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

      {suporte && (
        <div className="mt-4 text-xs text-[#87919E] space-y-0.5 border-t border-[#38435C] pt-3">
          <p>
            Suporte importado: <span className="text-[#EBEBEB]">{suporte.criadas}</span> criada(s)
            {' · '}já existiam: <span className="text-[#EBEBEB]">{suporte.puladas}</span>
          </p>
          {suporte.semCliente.length > 0 && (
            <p className="text-[#F59E0B]">Sem cliente vinculado (conferir nome): {suporte.semCliente.join(', ')}</p>
          )}
          {suporte.erros.length > 0 && (
            <p className="text-[#EF4444]">Erros: {suporte.erros.join(' | ')}</p>
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

      <div className="mt-6 border-t border-[#38435C] pt-4">
        <p className="text-xs font-semibold text-[#EBEBEB] mb-1">Migração ClickUp</p>
        <p className="text-xs text-[#87919E] mb-3">
          Traz (sem duplicar) as tarefas internas, rituais, contas a pagar e metas do ClickUp,
          e reconcilia os contratos (o Performli vence). A conciliação Asaas gera/conclui as
          tarefas de cobrança pelo status real das faturas. Pode rodar mais de uma vez.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runMigrarClickUp}
            disabled={loading}
            className="flex items-center gap-2 text-xs text-[#EBEBEB] border border-[#38435C] rounded-lg px-3 py-2 transition-colors hover:bg-[#38435C]/40 disabled:opacity-50"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}
            Migrar tudo (ClickUp)
          </button>
          <button
            type="button"
            onClick={runVincularAsaas}
            disabled={loading}
            className="flex items-center gap-2 text-xs text-[#EBEBEB] border border-[#38435C] rounded-lg px-3 py-2 transition-colors hover:bg-[#38435C]/40 disabled:opacity-50"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}
            Vincular clientes ao Asaas
          </button>
          <button
            type="button"
            onClick={runReconciliarAsaas}
            disabled={loading}
            className="flex items-center gap-2 text-xs text-[#EBEBEB] border border-[#38435C] rounded-lg px-3 py-2 transition-colors hover:bg-[#38435C]/40 disabled:opacity-50"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}
            Conciliar Asaas agora
          </button>
        </div>

        {vinculo && (
          <div className="mt-4 text-xs text-[#87919E] space-y-1.5 border-t border-[#38435C]/60 pt-3">
            <p>
              Razões sociais gravadas: <span className="text-[#EBEBEB]">{vinculo.vinculados}</span>
              {' · '}já vinculadas: <span className="text-[#EBEBEB]">{vinculo.jaVinculados}</span>
              {' · '}customers religados: <span className="text-[#EBEBEB]">{vinculo.customersReligados}</span>
            </p>
            {vinculo.clienteNaoEncontrado.length > 0 && (
              <p className="text-[#ff5e6a]">Cliente não encontrado: {vinculo.clienteNaoEncontrado.join(' · ')}</p>
            )}
            {vinculo.duplicadosNoAsaas.length > 0 && (
              <p className="text-[#e3ad45]">
                Duplicados no Asaas (limpar lá quando puder): {vinculo.duplicadosNoAsaas.join(' · ')}
              </p>
            )}
            {vinculo.semVinculo.length > 0 && (
              <p className="text-[#e3ad45]">
                Customers com fatura recente SEM vínculo: {vinculo.semVinculo.join(' · ')}
              </p>
            )}
            {vinculo.semVinculo.length === 0 && (
              <p className="text-[#34c97a]">Todos os customers com fatura recente estão vinculados. ✓</p>
            )}
          </div>
        )}

        {migracao && (
          <div className="mt-4 text-xs text-[#87919E] space-y-1.5">
            {Object.entries(migracao).map(([lote, r]) => (
              <div key={lote} className="border-t border-[#38435C]/60 pt-1.5">
                <p>
                  <span className="text-[#EBEBEB] capitalize">{lote}</span>:{' '}
                  <span className="text-[#EBEBEB]">{r.criadas}</span> criada(s)
                  {' · '}puladas: <span className="text-[#EBEBEB]">{r.puladas}</span>
                </p>
                {r.naoConciliados.length > 0 && (
                  <p className="text-[#F59E0B]">Não conciliados (sem cliente óbvio): {r.naoConciliados.join(', ')}</p>
                )}
                {r.erros.length > 0 && (
                  <p className="text-[#EF4444]">Erros: {r.erros.join(' | ')}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {reconcile && (
          <div className="mt-4 text-xs text-[#87919E] space-y-0.5 border-t border-[#38435C]/60 pt-1.5">
            <p>
              Cobranças geradas: <span className="text-[#EBEBEB]">{reconcile.geradas}</span>
              {' · '}concluídas (pagas): <span className="text-[#EBEBEB]">{reconcile.conciliadas}</span>
              {' · '}reabertas (estorno): <span className="text-[#EBEBEB]">{reconcile.reabertas}</span>
            </p>
            {reconcile.erros.length > 0 && (
              <p className="text-[#EF4444]">Erros: {reconcile.erros.join(' | ')}</p>
            )}
          </div>
        )}
      </div>

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
