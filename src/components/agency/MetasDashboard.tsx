'use client'

import { useState, useTransition } from 'react'
import { generateClientInsight, type ClientInsight } from '@/app/actions/insights'
import type { ClientProgress } from '@/app/actions/progress'
import { formatCurrency } from '@/lib/utils'
import {
  TrendingUp, TrendingDown, Minus, Sparkles, Loader2,
  AlertTriangle, CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  Target, Zap, ArrowRight,
} from 'lucide-react'

type SortKey = 'pct' | 'name' | 'manager' | 'projection'

/** Cliente local/B2B: acompanha meta-resultado (mensagens/agendamentos/…), não faturamento. */
function isLocal(c: ClientProgress): boolean {
  return c.businessType !== 'ECOMMERCE'
}

/** % de progresso principal do cliente: local → meta-resultado; e-commerce → faturamento. */
function primaryPct(c: ClientProgress): number | null {
  return isLocal(c) ? c.localPct : c.pctGoalAchieved
}

/** Tem meta principal definida? (local → meta-resultado; e-commerce → faturamento). */
function hasGoal(c: ClientProgress): boolean {
  return isLocal(c) ? c.localGoal != null : c.goalFaturamento != null
}

const intFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

function pctColor(pct: number | null, monthPct: number): string {
  if (pct === null) return 'text-[#87919E]'
  // Compare achievement vs expected pacing
  const ratio = monthPct > 0 ? pct / (monthPct * 100) : pct / 100
  if (ratio >= 0.9)  return 'text-[#22C55E]'
  if (ratio >= 0.7)  return 'text-[#EAB308]'
  return 'text-[#EF4444]'
}

function progressBarColor(pct: number, monthPct: number): string {
  const ratio = monthPct > 0 ? pct / (monthPct * 100) : pct / 100
  if (ratio >= 0.9)  return 'bg-[#22C55E]'
  if (ratio >= 0.7)  return 'bg-[#EAB308]'
  return 'bg-[#EF4444]'
}

function RoasBadge({ actual, goal }: { actual: number | null; goal: number | null }) {
  if (actual === null) return <span className="text-[10px] text-[#87919E]/50">—</span>
  const ok = goal == null || actual >= goal
  return (
    <span className={`text-xs font-semibold ${ok ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
      {actual.toFixed(2)}x{goal != null && ` / ${goal.toFixed(1)}x`}
    </span>
  )
}

function InsightBadge({ level }: { level: 'critical' | 'warning' | 'ok' }) {
  if (level === 'critical') return <AlertCircle size={12} className="text-[#EF4444] flex-shrink-0" />
  if (level === 'warning')  return <AlertTriangle size={12} className="text-[#EAB308] flex-shrink-0" />
  return <CheckCircle2 size={12} className="text-[#22C55E] flex-shrink-0" />
}

function InsightPanel({ data, onClose }: { data: ClientInsight; onClose: () => void }) {
  const riskColors: Record<string, string> = {
    alto:  'text-[#EF4444] border-[#EF4444]/20 bg-[#EF4444]/5',
    medio: 'text-[#EAB308] border-[#EAB308]/20 bg-[#EAB308]/5',
    baixo: 'text-[#22C55E] border-[#22C55E]/20 bg-[#22C55E]/5',
  }
  const riskClass = riskColors[data.riskLevel] ?? riskColors.medio

  return (
    <div className="mt-3 pt-3 border-t border-[#38435C] space-y-3">
      {/* Summary */}
      <div className={`rounded-lg border px-3 py-2 ${riskClass}`}>
        <p className="text-xs font-medium leading-snug">{data.summary}</p>
      </div>

      {/* Priority action */}
      <div className="flex items-start gap-2 bg-[#95BBE2]/5 border border-[#95BBE2]/20 rounded-lg px-3 py-2">
        <ArrowRight size={12} className="text-[#95BBE2] mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-[10px] font-semibold text-[#95BBE2] uppercase tracking-wider mb-0.5">Prioridade agora</p>
          <p className="text-xs text-[#EBEBEB] leading-snug">{data.priority}</p>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-2">
        {data.items.map((item, i) => (
          <div key={i} className="space-y-0.5">
            <div className="flex items-start gap-1.5">
              <InsightBadge level={item.level} />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-[#87919E] uppercase tracking-wider">{item.pillar}</p>
                <p className="text-xs text-[#EBEBEB] leading-snug">{item.finding}</p>
                <p className="text-[10px] text-[#87919E] mt-0.5 leading-snug">{item.action}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button onClick={onClose} className="text-[10px] text-[#87919E] hover:text-[#EBEBEB] transition-colors">
        Fechar análise
      </button>
    </div>
  )
}

/** Bloco de progresso da meta-resultado de cliente local/B2B (mensagens, agendamentos, …). */
function LocalProgress({
  c, barWidth, barClass,
}: { c: ClientProgress; barWidth: number; barClass: string }) {
  const label = c.localMetricLabel ?? 'Resultado'

  if (c.localGoal == null) {
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-[#87919E]">
          <span>{label}</span>
          <span>sem meta de {label.toLowerCase()}</span>
        </div>
        <div className="text-[10px] text-[#EBEBEB] font-semibold">
          {c.localActual != null ? `${intFmt.format(c.localActual)} ${c.periodoLabel}` : '—'}
        </div>
      </div>
    )
  }

  const actual  = c.localActual ?? 0
  const paced   = c.localPacedGoal
  // No ritmo se já alcançou o esperado pró-rata do dia (guarda paced null).
  const onPace  = paced != null && actual >= paced

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-[#87919E]">
        <span>{label}</span>
        <span>meta {intFmt.format(c.localGoal)} {c.periodoLabel}</span>
      </div>
      <div className="text-[11px] text-[#EBEBEB] font-semibold">
        {intFmt.format(actual)} de {intFmt.format(c.localGoal)}
        {c.localPct != null && (
          <span className="text-[#87919E] font-normal"> · {Math.round(c.localPct)}%</span>
        )}
      </div>
      <div className="h-2 rounded-full bg-[#38435C]/60 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barClass}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      {paced != null && (
        <div className="flex items-center gap-1.5 text-[10px] text-[#87919E]">
          <Target size={10} className="flex-shrink-0" />
          <span>
            Ritmo do dia:{' '}
            <span className={`font-semibold ${onPace ? 'text-[#22C55E]' : 'text-[#EAB308]'}`}>
              {intFmt.format(Math.round(paced))} esperados
            </span>
            {' '}({Math.round(c.pctMonthElapsed * 100)}% do mês) {onPace ? '✓' : '⚠'}
          </span>
        </div>
      )}
    </div>
  )
}

function ClientCard({ c }: { c: ClientProgress }) {
  const [insight, setInsight]   = useState<ClientInsight | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [isPending, start]      = useTransition()

  const local      = isLocal(c)
  const pct        = primaryPct(c)
  const monthPct   = c.pctMonthElapsed
  const barWidth   = pct != null ? Math.min(100, pct) : 0
  const barClass   = pct != null ? progressBarColor(pct, monthPct) : 'bg-[#38435C]'
  const textClass  = pctColor(pct, monthPct)

  const onTrack    = pct != null && pct >= monthPct * 100 * 0.9
  const behind     = pct != null && pct < monthPct * 100 * 0.7
  const noGoal     = !hasGoal(c)

  const statusIcon = noGoal   ? <Minus size={12} className="text-[#87919E]" />
                   : onTrack  ? <TrendingUp size={12} className="text-[#22C55E]" />
                   : behind   ? <TrendingDown size={12} className="text-[#EF4444]" />
                   : <Minus size={12} className="text-[#EAB308]" />

  function handleInsight() {
    if (insight) { setExpanded(!expanded); return }
    start(async () => {
      const result = await generateClientInsight(c)
      setInsight(result)
      setExpanded(true)
    })
  }

  return (
    <div className={`bg-[#0A1E2C] border rounded-xl p-4 flex flex-col gap-3 transition-all ${
      behind ? 'border-[#EF4444]/30' : onTrack ? 'border-[#22C55E]/20' : 'border-[#38435C]'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <a
            href={`/clients/${c.slug}`}
            className="text-sm font-semibold text-[#EBEBEB] hover:text-[#95BBE2] transition-colors truncate block"
          >
            {c.name}
          </a>
          <p className="text-[10px] text-[#87919E] mt-0.5">{c.managerName}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {statusIcon}
          {pct != null && (
            <span className={`text-sm font-bold tabular-nums ${textClass}`}>
              {Math.round(pct)}%
            </span>
          )}
        </div>
      </div>

      {local ? (
        <LocalProgress c={c} barWidth={barWidth} barClass={barClass} />
      ) : (
        <>
          {/* Faturamento progress */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-[#87919E]">
              <span>Faturamento</span>
              <span>{c.goalFaturamento ? `meta ${formatCurrency(c.goalFaturamento)}` : 'sem meta de faturamento'}</span>
            </div>
            <div className="h-2 rounded-full bg-[#38435C]/60 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barClass}`}
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-[#EBEBEB] font-semibold">{formatCurrency(c.revenue)}</span>
              {c.projection != null && c.goalFaturamento != null && (
                <span className={`${c.projection >= c.goalFaturamento ? 'text-[#22C55E]' : 'text-[#EAB308]'}`}>
                  proj. {formatCurrency(c.projection)}
                </span>
              )}
            </div>
          </div>

          {/* Pacing indicator */}
          {c.pacedGoal != null && c.goalFaturamento != null && (
            <div className="flex items-center gap-1.5 text-[10px] text-[#87919E]">
              <Target size={10} className="flex-shrink-0" />
              <span>
                Esperado até hoje:{' '}
                <span className={`font-semibold ${
                  c.revenue >= c.pacedGoal ? 'text-[#22C55E]' : 'text-[#EAB308]'
                }`}>
                  {formatCurrency(c.pacedGoal)}
                </span>
                {' '}({Math.round(c.pctMonthElapsed * 100)}% do mês)
              </span>
            </div>
          )}
        </>
      )}

      {/* Divider */}
      <div className="border-t border-[#38435C]" />

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {/* ROAS (e-commerce) ou Custo por resultado (local/B2B) */}
        {local ? (
          <div>
            <p className="text-[10px] text-[#87919E] mb-0.5">
              {c.custoMetricLabel ?? 'Custo'} {c.periodoLabel}
            </p>
            {c.custoRealizado != null ? (
              <span className={`text-xs font-semibold ${
                c.custoAlvo == null ? 'text-[#EBEBEB]'
                  : c.custoRealizado <= c.custoAlvo ? 'text-[#22C55E]' : 'text-[#EF4444]'
              }`}>
                {formatCurrency(c.custoRealizado)}
                {c.custoAlvo != null && (
                  <span className="text-[10px] text-[#87919E]">{' '}/ {formatCurrency(c.custoAlvo)}</span>
                )}
              </span>
            ) : c.custoAlvo != null ? (
              <span className="text-[10px] text-[#87919E]/50">meta {formatCurrency(c.custoAlvo)}</span>
            ) : <span className="text-[10px] text-[#87919E]/50">—</span>}
          </div>
        ) : (
          <div>
            <p className="text-[10px] text-[#87919E] mb-0.5">ROAS</p>
            <RoasBadge actual={c.roas} goal={c.goalRoas} />
          </div>
        )}

        {/* Budget */}
        <div>
          <p className="text-[10px] text-[#87919E] mb-0.5">Budget</p>
          {c.goalSpend != null ? (
            <div>
              <span className="text-xs font-semibold text-[#EBEBEB]">
                {formatCurrency(c.spend)}
              </span>
              <span className="text-[10px] text-[#87919E]">
                {' '}/ {formatCurrency(c.goalSpend)}
              </span>
              {c.pctSpendConsumed != null && (
                <div className="h-1 rounded-full bg-[#38435C]/60 mt-1 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${c.pctSpendConsumed > 100 ? 'bg-[#EF4444]' : 'bg-[#95BBE2]'}`}
                    style={{ width: `${Math.min(100, c.pctSpendConsumed)}%` }}
                  />
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs text-[#87919E]/50">sem meta de budget</span>
          )}
        </div>

        {/* CTR Link */}
        <div>
          <p className="text-[10px] text-[#87919E] mb-0.5">CTR Link</p>
          {c.ctr != null ? (
            <span className={`text-xs font-semibold ${
              c.ctr >= 1.0 ? 'text-[#22C55E]' : c.ctr >= 0.5 ? 'text-[#EAB308]' : 'text-[#EF4444]'
            }`}>
              {c.ctr.toFixed(2)}%
            </span>
          ) : <span className="text-[10px] text-[#87919E]/50">—</span>}
        </div>

        {/* Taxa de Conversão */}
        <div>
          <p className="text-[10px] text-[#87919E] mb-0.5">Conv.</p>
          {c.taxaConversao != null ? (
            <span className={`text-xs font-semibold ${
              c.taxaConversao >= 1.5 ? 'text-[#22C55E]' : c.taxaConversao >= 0.8 ? 'text-[#EAB308]' : 'text-[#EF4444]'
            }`}>
              {c.taxaConversao.toFixed(2)}%
            </span>
          ) : <span className="text-[10px] text-[#87919E]/50">—</span>}
        </div>

        {/* Ticket Médio */}
        <div>
          <p className="text-[10px] text-[#87919E] mb-0.5">Ticket Médio</p>
          {c.ticketMedio != null ? (
            <span className="text-xs font-semibold text-[#EBEBEB]">
              {formatCurrency(c.ticketMedio)}
              {c.prevTicketMedio != null && (
                <span className={`ml-1 text-[10px] ${
                  c.ticketMedio >= c.prevTicketMedio ? 'text-[#22C55E]' : 'text-[#EF4444]'
                }`}>
                  {c.ticketMedio >= c.prevTicketMedio ? '↑' : '↓'}
                </span>
              )}
            </span>
          ) : <span className="text-[10px] text-[#87919E]/50">—</span>}
        </div>

        {/* Dias restantes */}
        <div>
          <p className="text-[10px] text-[#87919E] mb-0.5">Dias restantes</p>
          <span className="text-xs font-semibold text-[#EBEBEB]">{c.daysRemaining}d</span>
        </div>
      </div>

      {/* AI Insight */}
      <button
        onClick={handleInsight}
        disabled={isPending}
        className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg border border-[#38435C] hover:border-[#95BBE2]/30 hover:bg-[#95BBE2]/5 transition-colors text-[10px] font-medium text-[#87919E] hover:text-[#95BBE2] disabled:opacity-50"
      >
        {isPending ? (
          <><Loader2 size={11} className="animate-spin" /> Gerando análise IA...</>
        ) : insight ? (
          expanded
            ? <><ChevronUp size={11} /> Ocultar análise</>
            : <><ChevronDown size={11} /> Ver análise IA</>
        ) : (
          <><Sparkles size={11} /> Gerar análise estratégica IA</>
        )}
      </button>

      {insight && expanded && (
        <InsightPanel data={insight} onClose={() => setExpanded(false)} />
      )}
    </div>
  )
}

export function MetasDashboard({ clients }: { clients: ClientProgress[] }) {
  const [sort, setSort] = useState<SortKey>('pct')

  const withGoal    = clients.filter((c) => hasGoal(c))
  const withoutGoal = clients.filter((c) => !hasGoal(c))

  const onTrack  = withGoal.filter((c) => { const p = primaryPct(c); return p != null && p >= c.pctMonthElapsed * 100 * 0.9 }).length
  const atRisk   = withGoal.filter((c) => { const p = primaryPct(c); return p != null && p >= c.pctMonthElapsed * 100 * 0.7 && p < c.pctMonthElapsed * 100 * 0.9 }).length
  const critical  = withGoal.filter((c) => { const p = primaryPct(c); return p != null && p < c.pctMonthElapsed * 100 * 0.7 }).length

  const sorted = [...withGoal].sort((a, b) => {
    if (sort === 'pct') {
      // Sort by how far behind pacing (worst first)
      const pa = primaryPct(a), pb = primaryPct(b)
      const scoreA = pa != null ? pa - a.pctMonthElapsed * 100 : 999
      const scoreB = pb != null ? pb - b.pctMonthElapsed * 100 : 999
      return scoreA - scoreB
    }
    if (sort === 'name') return a.name.localeCompare(b.name)
    if (sort === 'manager') return a.managerName.localeCompare(b.managerName)
    // projection
    return (b.projection ?? 0) - (a.projection ?? 0)
  })

  const displayClients = [...sorted, ...withoutGoal]

  // "Total Carteira" compara REALIZADO × META de FATURAMENTO — ambos restritos
  // aos MESMOS clientes (os que têm meta de faturamento = e-commerce). Antes o
  // numerador somava a receita de TODOS (inclui locais), inflando o total contra
  // um denominador que só considera metas de faturamento.
  const faturamentoClients = clients.filter((c) => c.goalFaturamento != null)
  const totalRevenue = faturamentoClients.reduce((s, c) => s + c.revenue, 0)
  const totalGoal    = faturamentoClients.reduce((s, c) => s + (c.goalFaturamento ?? 0), 0)

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#0A1E2C] border border-[#22C55E]/20 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#87919E] uppercase tracking-wider mb-1">No Ritmo</p>
          <p className="text-3xl font-bold text-[#22C55E]">{onTrack}</p>
          <p className="text-[10px] text-[#87919E] mt-0.5">≥90% do pacing</p>
        </div>
        <div className="bg-[#0A1E2C] border border-[#EAB308]/20 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#87919E] uppercase tracking-wider mb-1">Em Atenção</p>
          <p className="text-3xl font-bold text-[#EAB308]">{atRisk}</p>
          <p className="text-[10px] text-[#87919E] mt-0.5">70–89% do pacing</p>
        </div>
        <div className="bg-[#0A1E2C] border border-[#EF4444]/20 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#87919E] uppercase tracking-wider mb-1">Crítico</p>
          <p className="text-3xl font-bold text-[#EF4444]">{critical}</p>
          <p className="text-[10px] text-[#87919E] mt-0.5">&lt;70% do pacing</p>
        </div>
        <div className="bg-[#0A1E2C] border border-[#38435C] rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#87919E] uppercase tracking-wider mb-1">Total Carteira</p>
          <p className="text-xl font-bold text-[#EBEBEB]">{formatCurrency(totalRevenue)}</p>
          <p className="text-[10px] text-[#87919E] mt-0.5">
            {totalGoal > 0 ? `de ${formatCurrency(totalGoal)} em metas` : 'faturamento acumulado'}
          </p>
        </div>
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-[#87919E] uppercase tracking-wider">Ordenar por:</span>
        {(['pct', 'name', 'manager', 'projection'] as SortKey[]).map((key) => {
          const labels: Record<SortKey, string> = {
            pct: 'Mais atrasados', name: 'Nome', manager: 'Gestor', projection: 'Maior projeção',
          }
          return (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                sort === key
                  ? 'bg-[#95BBE2]/20 text-[#95BBE2] border border-[#95BBE2]/30'
                  : 'border border-[#38435C] text-[#87919E] hover:text-[#EBEBEB] hover:border-[#38435C]'
              }`}
            >
              {labels[key]}
            </button>
          )
        })}
      </div>

      {/* Client cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {displayClients.map((c) => (
          <ClientCard key={c.id} c={c} />
        ))}
      </div>

      {displayClients.length === 0 && (
        <div className="text-center py-16 text-[#87919E]">
          <Zap size={32} className="mx-auto mb-3 opacity-30" />
          <p>Nenhum cliente ativo encontrado.</p>
        </div>
      )}
    </div>
  )
}
