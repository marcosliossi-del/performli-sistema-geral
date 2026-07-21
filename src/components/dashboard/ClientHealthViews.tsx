'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { HealthStatus } from '@prisma/client'
import { formatCurrency } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus, PlugZap, Target } from 'lucide-react'

/**
 * SAÚDE ÚNICA — duas visões operacionais (Operação Fundação · Bloco 1).
 *
 * Toggle "Últimos 7 dias" (tendência) × "Resultado do mês" (meta/projeção).
 * Os DOIS conjuntos de dados chegam prontos do servidor na mesma carga (batch,
 * sem N+1): o toggle é puramente client-side, sem refetch. Nenhum cálculo de
 * negócio aqui — só formatação/ordenação. Fonte canônica: getWeeklyTrendBatch
 * (tendência) e getUnifiedClientHealthBatch (mês) via cockpit/page.tsx.
 *
 * Design (diretriz do Marcos): veredito é o elemento dominante de cada linha;
 * um gráfico simples por linha (sparkline 14d / barra realizado×meta com
 * marcador pró-rata); resumo de 5 segundos no topo; máx. 4-5 infos por linha.
 */

type WeeklyVerdict = 'SUBINDO' | 'ESTAVEL' | 'DECAINDO' | 'SEM_FONTE' | 'SEM_DADOS'

export interface HealthViewClient {
  id: string
  name: string
  razaoSocial?: string | null
  slug: string
  logoUrl?: string | null
  primaryManager?: string | null
  status: HealthStatus | null
  weekly: {
    hasRevenueSource: boolean
    faturamento7d: number | null
    faturamentoPrev7d: number | null
    variacaoPct: number | null
    veredito: WeeklyVerdict
    roas7d: number | null
    spend7d: number | null
    series: number[]
  } | null
  month: {
    realizado: number | null
    meta: number | null
    esperadoAteHoje: number | null
    projecao: number | null
    pct: number | null
  } | null
}

interface Props {
  clients: HealthViewClient[]
  updatedAt: string // ISO
  /** Estado do robô diário de sync (heartbeat): quando parado/atrasado, os
   *  números das duas visões estão DESATUALIZADOS e a tela precisa gritar isso
   *  em vez de exibi-los como verdade. null = nunca rodou. */
  syncAlert?: { lastRunIso: string | null; staleHours: number } | null
}

// ─── Paleta (design system dark do Performli) ─────────────────────────────────
const GREEN = '#22C55E'
const AMBER = '#EAB308'
const RED = '#EF4444'
const MUTED = '#87919E'
const FAINT = '#576070'

const SEAL: Record<HealthStatus, { label: string; color: string }> = {
  OTIMO: { label: 'Saudável', color: GREEN },
  REGULAR: { label: 'Em atenção', color: AMBER },
  RUIM: { label: 'Crítico', color: RED },
}

// ─── Vereditos semanais ───────────────────────────────────────────────────────
type WeeklyMeta = { label: string; color: string; icon: typeof TrendingUp }
const WEEKLY_VERDICT: Record<WeeklyVerdict, WeeklyMeta> = {
  SUBINDO: { label: 'Subindo', color: GREEN, icon: TrendingUp },
  ESTAVEL: { label: 'Estável', color: MUTED, icon: Minus },
  DECAINDO: { label: 'Decaindo', color: RED, icon: TrendingDown },
  SEM_DADOS: { label: 'Sem dados no período', color: FAINT, icon: Minus },
  SEM_FONTE: { label: 'Sem fonte de receita conectada', color: FAINT, icon: PlugZap },
}

// Ordenação: Decaindo (maior queda) → Estável → Subindo → sem dados → sem fonte.
function weeklyRank(c: HealthViewClient): number {
  const w = c.weekly
  if (!w) return 9e9
  switch (w.veredito) {
    case 'DECAINDO':
      return -1_000_000 + (w.variacaoPct ?? 0) // mais negativo no topo
    case 'ESTAVEL':
      return 0
    case 'SUBINDO':
      return 1_000_000 - (w.variacaoPct ?? 0)
    case 'SEM_DADOS':
      return 8e9
    case 'SEM_FONTE':
      return 9e9
  }
}

// ─── Vereditos mensais ────────────────────────────────────────────────────────
type MonthVerdict = 'VAI_BATER' | 'NO_RITMO' | 'ABAIXO' | 'SEM_META'
function monthVerdict(m: HealthViewClient['month']): {
  kind: MonthVerdict
  label: string
  color: string
  projPct: number | null
} {
  if (!m || m.meta == null || m.meta <= 0)
    return { kind: 'SEM_META', label: 'Sem meta definida', color: FAINT, projPct: null }
  const projPct = m.projecao != null ? Math.round((m.projecao / m.meta) * 100) : null
  if (m.projecao != null && m.projecao >= m.meta)
    return { kind: 'VAI_BATER', label: 'Vai bater a meta', color: GREEN, projPct }
  if (m.realizado != null && m.esperadoAteHoje != null && m.realizado >= m.esperadoAteHoje)
    return { kind: 'NO_RITMO', label: 'No ritmo', color: AMBER, projPct }
  return {
    kind: 'ABAIXO',
    label: projPct != null ? `Abaixo do ritmo — projeção ${projPct}% da meta` : 'Abaixo do ritmo',
    color: RED,
    projPct,
  }
}

// Ordenação: pior projeção primeiro; sem meta por último.
function monthRank(c: HealthViewClient): number {
  const v = monthVerdict(c.month)
  if (v.kind === 'SEM_META') return 9e9
  return v.projPct ?? 0
}

export function ClientHealthViews({ clients, updatedAt, syncAlert }: Props) {
  const [view, setView] = useState<'week' | 'month'>('week')

  const sorted = useMemo(() => {
    const arr = [...clients]
    arr.sort((a, b) => (view === 'week' ? weeklyRank(a) - weeklyRank(b) : monthRank(a) - monthRank(b)))
    return arr
  }, [clients, view])

  const weekSummary = useMemo(() => {
    let subindo = 0, estavel = 0, decaindo = 0, semFonte = 0
    for (const c of clients) {
      const v = c.weekly?.veredito
      if (v === 'SUBINDO') subindo++
      else if (v === 'ESTAVEL') estavel++
      else if (v === 'DECAINDO') decaindo++
      else semFonte++
    }
    return { subindo, estavel, decaindo, semFonte }
  }, [clients])

  const monthSummary = useMemo(() => {
    let vaiBater = 0, noRitmo = 0, abaixo = 0, semMeta = 0
    for (const c of clients) {
      const k = monthVerdict(c.month).kind
      if (k === 'VAI_BATER') vaiBater++
      else if (k === 'NO_RITMO') noRitmo++
      else if (k === 'ABAIXO') abaixo++
      else semMeta++
    }
    return { vaiBater, noRitmo, abaixo, semMeta }
  }, [clients])

  return (
    <div className="space-y-4">
      {/* Falha silenciosa de coleta: robô diário parado → números abaixo NÃO
          refletem a realidade. Banner dominante nas DUAS visões. */}
      {syncAlert && (
        <div className="rounded-xl border border-[#EF4444]/60 bg-[#EF4444]/10 px-4 py-3">
          <p className="text-sm font-bold text-[#EF4444]">
            {syncAlert.lastRunIso
              ? `Sincronização automática parada há ${Math.floor(syncAlert.staleHours / 24) > 0 ? `${Math.floor(syncAlert.staleHours / 24)} dia(s)` : `${Math.round(syncAlert.staleHours)}h`} — os números abaixo estão desatualizados`
              : 'A sincronização automática NUNCA rodou — os números abaixo estão desatualizados'}
          </p>
          <p className="text-[11px] text-[#EBA0A0] mt-0.5">
            Faturamento e gasto param no último sync manual. Configure o CRON_SECRET na Vercel e
            confira em{' '}
            <Link href="/diagnostico-fontes" className="underline">
              Diagnóstico de Fontes
            </Link>
            {syncAlert.lastRunIso
              ? ` · último robô: ${new Date(syncAlert.lastRunIso).toLocaleString('pt-BR')}`
              : ''}
          </p>
        </div>
      )}

      {/* Toggle + carimbo de atualização (regra UX #10) */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-lg bg-[#0A1E2C] border border-[#38435C]/60 p-0.5">
          <ToggleBtn active={view === 'week'} onClick={() => setView('week')} label="Últimos 7 dias" />
          <ToggleBtn active={view === 'month'} onClick={() => setView('month')} label="Resultado do mês" />
        </div>
        <span className="text-[10px] text-[#576070]">
          Atualizado em {new Date(updatedAt).toLocaleString('pt-BR')}
        </span>
      </div>

      {/* Resumo de 5 segundos */}
      {view === 'week' ? (
        <SummaryRow
          items={[
            { n: weekSummary.decaindo, label: 'decaindo', color: RED },
            { n: weekSummary.estavel, label: 'estáveis', color: MUTED },
            { n: weekSummary.subindo, label: 'subindo', color: GREEN },
            { n: weekSummary.semFonte, label: 'sem fonte', color: FAINT },
          ]}
          hint="Faturamento dos últimos 7 dias vs os 7 anteriores"
        />
      ) : (
        <SummaryRow
          items={[
            { n: monthSummary.abaixo, label: 'abaixo do ritmo', color: RED },
            { n: monthSummary.noRitmo, label: 'no ritmo', color: AMBER },
            { n: monthSummary.vaiBater, label: 'vão bater a meta', color: GREEN },
            { n: monthSummary.semMeta, label: 'sem meta', color: FAINT },
          ]}
          hint="Realizado do mês × meta + projeção de fechamento"
        />
      )}

      {/* Linhas */}
      {sorted.length === 0 ? (
        <p className="text-[#87919E] text-sm py-8 text-center">Nenhum cliente na sua carteira.</p>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((c) => (view === 'week' ? <WeekRow key={c.id} c={c} /> : <MonthRow key={c.id} c={c} />))}
        </div>
      )}
    </div>
  )
}

function ToggleBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
        active ? 'bg-[#2D3A4D] text-[#EBEBEB]' : 'text-[#87919E] hover:text-[#EBEBEB]'
      }`}
    >
      {label}
    </button>
  )
}

function SummaryRow({
  items,
  hint,
}: {
  items: { n: number; label: string; color: string }[]
  hint: string
}) {
  return (
    <div className="rounded-xl bg-[#0D2137] border border-[#38435C]/50 px-4 py-3">
      <div className="flex items-end gap-6 flex-wrap">
        {items.map((it) => (
          <div key={it.label} className="flex flex-col">
            <span
              className="text-3xl font-bold leading-none tabular-nums"
              style={{ color: it.n > 0 ? it.color : FAINT }}
            >
              {it.n}
            </span>
            <span className="text-[11px] text-[#87919E] mt-1">{it.label}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[#576070] mt-2">{hint}</p>
    </div>
  )
}

function ClientIdentity({ c }: { c: HealthViewClient }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0 w-52 flex-shrink-0">
      {c.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.logoUrl} alt={c.name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded-lg bg-[#0A1E2C] flex items-center justify-center flex-shrink-0">
          <span className="text-[#95BBE2] font-bold text-xs">{c.name.charAt(0).toUpperCase()}</span>
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[#EBEBEB] font-semibold text-sm truncate">{c.name}</p>
        {c.razaoSocial && c.razaoSocial.trim().toLowerCase() !== c.name.trim().toLowerCase() && (
          <p className="text-[10px] text-[#647488] truncate" title={c.razaoSocial}>
            {c.razaoSocial}
          </p>
        )}
        <div className="flex items-center gap-1.5">
          {c.status && (
            <span className="text-[10px] font-medium" style={{ color: SEAL[c.status].color }}>
              {SEAL[c.status].label}
            </span>
          )}
          {c.primaryManager && <span className="text-[10px] text-[#576070] truncate">· {c.primaryManager}</span>}
        </div>
      </div>
    </div>
  )
}

function RowShell({ c, children }: { c: HealthViewClient; children: React.ReactNode }) {
  return (
    <Link href={`/clients/${c.slug}`}>
      <div className="flex items-center gap-4 rounded-xl bg-[#0D2137] border border-[#38435C]/40 px-4 py-3 hover:bg-[#12293f] hover:border-[#38435C] transition-colors cursor-pointer">
        <ClientIdentity c={c} />
        {children}
      </div>
    </Link>
  )
}

// ─── Visão 1: Últimos 7 dias ──────────────────────────────────────────────────
function WeekRow({ c }: { c: HealthViewClient }) {
  const w = c.weekly
  const meta = WEEKLY_VERDICT[w?.veredito ?? 'SEM_DADOS']
  const Icon = meta.icon
  const measurable = w != null && (w.veredito === 'SUBINDO' || w.veredito === 'ESTAVEL' || w.veredito === 'DECAINDO')

  return (
    <RowShell c={c}>
      {/* Veredito dominante. SEM_DADOS com gasto no período = falha silenciosa
          de coleta (anúncio rodou, faturamento não sincronizou) — gritar isso,
          não um genérico "sem dados". */}
      <div className="flex items-center gap-2 w-44 flex-shrink-0">
        <Icon
          size={20}
          style={{ color: w?.veredito === 'SEM_DADOS' && (w?.spend7d ?? 0) > 0 ? AMBER : meta.color }}
          className="flex-shrink-0"
        />
        <div className="min-w-0">
          {w?.veredito === 'SEM_DADOS' && (w?.spend7d ?? 0) > 0 ? (
            <>
              <p className="text-sm font-bold leading-tight" style={{ color: AMBER }}>
                Faturamento não sincronizado
              </p>
              <p className="text-[11px] text-[#87919E]">anúncios rodaram no período</p>
            </>
          ) : (
            <p className="text-sm font-bold leading-tight" style={{ color: meta.color }}>
              {w?.veredito === 'SEM_DADOS' ? 'Sem sincronização no período' : meta.label}
            </p>
          )}
          {measurable && w?.variacaoPct != null && (
            <p className="text-[11px] text-[#87919E] tabular-nums">
              {w.variacaoPct > 0 ? '+' : ''}
              {w.variacaoPct}% vs semana anterior
            </p>
          )}
        </div>
      </div>

      {/* Sparkline 14 dias */}
      <div className="flex-1 min-w-0 hidden sm:block">
        {measurable && w ? <Sparkline series={w.series} color={meta.color} /> : <span className="text-[10px] text-[#576070]">—</span>}
      </div>

      {/* Métricas secundárias (muted, pequenas) */}
      <div className="flex items-center gap-5 flex-shrink-0 text-right">
        <Metric label="Fat. 7d" value={measurable && w?.faturamento7d != null ? formatCurrency(w.faturamento7d) : '—'} />
        <Metric label="ROAS 7d" value={w?.roas7d != null ? `${w.roas7d.toFixed(2)}x` : '—'} />
        <Metric label="Gasto 7d" value={w?.spend7d != null ? formatCurrency(w.spend7d) : '—'} />
      </div>
    </RowShell>
  )
}

// ─── Visão 2: Resultado do mês ────────────────────────────────────────────────
function MonthRow({ c }: { c: HealthViewClient }) {
  const m = c.month
  const v = monthVerdict(m)
  const hasMeta = m != null && m.meta != null && m.meta > 0

  return (
    <RowShell c={c}>
      {/* Veredito dominante */}
      <div className="flex items-center gap-2 w-52 flex-shrink-0">
        <Target size={18} style={{ color: v.color }} className="flex-shrink-0" />
        <p className="text-sm font-bold leading-tight" style={{ color: v.color }}>
          {v.label}
        </p>
      </div>

      {/* Barra realizado × meta com marcador pró-rata */}
      <div className="flex-1 min-w-0 hidden sm:block">
        {hasMeta && m ? (
          <MetaBar realizado={m.realizado ?? 0} meta={m.meta!} esperado={m.esperadoAteHoje} color={v.color} />
        ) : (
          <span className="text-[10px] text-[#576070]">Cadastre a meta mensal para acompanhar</span>
        )}
      </div>

      {/* Números secundários */}
      <div className="flex items-center gap-5 flex-shrink-0 text-right">
        <Metric label="Realizado" value={m?.realizado != null ? formatCurrency(m.realizado) : '—'} />
        <Metric label="Meta" value={hasMeta ? formatCurrency(m!.meta!) : '—'} />
        <Metric label="Projeção" value={m?.projecao != null ? formatCurrency(m.projecao) : '—'} valueColor={hasMeta ? v.color : undefined} />
      </div>
    </RowShell>
  )
}

function Metric({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="w-24">
      <p className="text-[9px] uppercase tracking-wider text-[#576070]">{label}</p>
      <p className="text-xs font-semibold tabular-nums truncate" style={{ color: valueColor ?? '#EBEBEB' }}>
        {value}
      </p>
    </div>
  )
}

/** Sparkline SVG minimalista — sem eixos, sem grid, sem legenda. */
function Sparkline({ series, color }: { series: number[]; color: string }) {
  if (series.length < 2) return <span className="text-[10px] text-[#576070]">—</span>
  const W = 200
  const H = 32
  const max = Math.max(...series, 1)
  const min = Math.min(...series, 0)
  const range = max - min || 1
  const step = W / (series.length - 1)
  const pts = series.map((v, i) => {
    const x = i * step
    const y = H - 2 - ((v - min) / range) * (H - 4)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  // Divisor entre semana anterior (0-6) e atual (7-13).
  const dividerX = 7 * step
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-8" aria-hidden>
      <line x1={dividerX} y1={0} x2={dividerX} y2={H} stroke={FAINT} strokeWidth={0.5} strokeDasharray="2 2" opacity={0.5} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={(series.length - 1) * step} cy={H - 2 - ((series[series.length - 1] - min) / range) * (H - 4)} r={2} fill={color} />
    </svg>
  )
}

/** Barra realizado×meta com marcador de "onde deveria estar hoje" (pró-rata). */
function MetaBar({
  realizado,
  meta,
  esperado,
  color,
}: {
  realizado: number
  meta: number
  esperado: number | null
  color: string
}) {
  const pct = Math.min(100, Math.max(0, (realizado / meta) * 100))
  const markerPct = esperado != null ? Math.min(100, Math.max(0, (esperado / meta) * 100)) : null
  return (
    <div className="w-full">
      <div className="relative h-2.5 rounded-full bg-[#38435C]/50 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      {/* Marcador pró-rata fora do overflow p/ não ser cortado */}
      {markerPct != null && (
        <div className="relative">
          <div
            className="absolute -top-3.5 w-px h-3.5 bg-[#EBEBEB]"
            style={{ left: `${markerPct}%` }}
            title="Onde você deveria estar hoje (pró-rata)"
          />
        </div>
      )}
      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-[#576070]">{Math.round(pct)}% da meta</span>
        <span className="text-[9px] text-[#576070]">esperado hoje: {markerPct != null ? `${Math.round(markerPct)}%` : '—'}</span>
      </div>
    </div>
  )
}
