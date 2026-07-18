'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { healthLabels, healthBgClasses } from '@/lib/health'
import { HealthStatus } from '@prisma/client'
import { formatCurrency } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus, Target, Wallet, Activity } from 'lucide-react'

/**
 * QUADRO CANÔNICO da "Saúde única" (decisão Marcos 2026-07-18): a saúde vive
 * NUM LUGAR SÓ. Este grid é a única tela que detalha a saúde por cliente; as
 * demais telas apenas linkam para cá. Consome getUnifiedClientHealthBatch via
 * a página (campo `unified`), sem cálculo novo no cliente.
 *
 * "Atingimento geral" = overallAchievementPct (SEM SPEND). O consumo de budget
 * (SPEND) vira barra própria rotulada "Consumo do budget" e NÃO pinta o
 * atingimento (A-121). Status = mesmo enum HealthStatus de sempre.
 */

/** Métricas de consumo de orçamento — separadas do atingimento (A-121). */
const BUDGET_METRICS = new Set(['SPEND', 'INVESTMENT'])

/** Rótulo qualitativo do ROAS (o antigo "Resultado", enum ClientResultado). */
const RESULTADO_LABEL: Record<string, string> = {
  OTIMO: 'Ótimo', BOM: 'Bom', REGULAR: 'Regular', RUIM: 'Ruim', PESSIMO: 'Péssimo',
}
const RESULTADO_COLOR: Record<string, string> = {
  OTIMO: '#22C55E', BOM: '#34c97a', REGULAR: '#EAB308', RUIM: '#EF4444', PESSIMO: '#ff3b4e',
}

/** Espelho serializável de UnifiedClientHealth (Date → ISO string na página). */
export interface UnifiedHealthView {
  status: HealthStatus | null
  overallAchievementPct: number | null
  weeklyRoas: {
    value: number | null
    label: string
    resultado: string | null
  }
  monthlyPacing: {
    realizado: number | null
    meta: number | null
    esperadoAteHoje: number | null
    projecao: number | null
    pct: number | null
    semReceitaComGasto: boolean
  }
  ga4sync: { connected: boolean }
  calculatedAt: string
}

interface ClientHealth {
  id: string
  name: string
  slug: string
  logoUrl?: string | null
  primaryManager?: string | null
  overallStatus: HealthStatus | null
  hasActiveGoal?: boolean
  achievementPct: number
  metrics: {
    name: string
    status: HealthStatus
    pct: number
  }[]
  trend: 'up' | 'down' | 'stable'
  streakDays?: number | null
  streakStatus?: HealthStatus | null
  statusTrend?: 'up' | 'down' | null
  unified?: UnifiedHealthView | null
}

interface ClientHealthGridProps {
  clients: ClientHealth[]
}

export function ClientHealthGrid({ clients }: ClientHealthGridProps) {
  if (clients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-[#38435C] flex items-center justify-center mb-4">
          <span className="text-2xl">📊</span>
        </div>
        <p className="text-[#87919E] text-sm">Nenhum cliente cadastrado ainda.</p>
        <Link
          href="/clients/new"
          className="mt-3 text-[#95BBE2] text-sm hover:underline"
        >
          Cadastrar primeiro cliente →
        </Link>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {clients.map((client) => (
        <ClientCard key={client.id} client={client} />
      ))}
    </div>
  )
}

function ClientCard({ client }: { client: ClientHealth }) {
  const TrendIcon =
    client.trend === 'up'
      ? TrendingUp
      : client.trend === 'down'
      ? TrendingDown
      : Minus

  const trendColor =
    client.trend === 'up'
      ? 'text-[#22C55E]'
      : client.trend === 'down'
      ? 'text-[#EF4444]'
      : 'text-[#87919E]'

  const u = client.unified ?? null

  // "Atingimento geral" — preferimos o valor do unified (SEM SPEND). Fallback ao
  // legado só se o unified não veio; null = sem performance medível.
  const atingimento =
    u?.overallAchievementPct != null ? u.overallAchievementPct : client.achievementPct

  // SPEND vira barra própria; badges de métrica ficam SÓ com performance.
  const budgetMetric = client.metrics.find((m) => BUDGET_METRICS.has(m.name))
  const perfMetrics = client.metrics.filter((m) => !BUDGET_METRICS.has(m.name))

  const pacing = u?.monthlyPacing ?? null
  const roas = u?.weeklyRoas ?? null

  return (
    <Link href={`/clients/${client.slug}`}>
      <div className="card p-4 hover:bg-[#2D3A4D] transition-all duration-150 cursor-pointer group">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            {client.logoUrl ? (
              <img
                src={client.logoUrl}
                alt={client.name}
                className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-[#0A1E2C] flex items-center justify-center flex-shrink-0">
                <span className="text-[#95BBE2] font-bold text-sm">
                  {client.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[#EBEBEB] font-semibold text-sm truncate group-hover:text-[#95BBE2] transition-colors">
                {client.name}
              </p>
              {client.primaryManager && (
                <p className="text-[#87919E] text-xs truncate">{client.primaryManager}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <TrendIcon size={14} className={trendColor} />
              {client.overallStatus ? (
                <div className="flex items-center gap-0.5">
                  {client.statusTrend === 'up' && (
                    <span className="text-[#22C55E] text-xs font-bold leading-none">↑</span>
                  )}
                  {client.statusTrend === 'down' && (
                    <span className="text-[#EF4444] text-xs font-bold leading-none">↓</span>
                  )}
                  <Badge variant={client.overallStatus.toLowerCase() as 'otimo' | 'regular' | 'ruim'}>
                    {healthLabels[client.overallStatus]}
                  </Badge>
                </div>
              ) : client.hasActiveGoal ? (
                <span
                  className="text-[10px] text-[#95BBE2] px-2 py-0.5 rounded-full bg-[#95BBE2]/10"
                  title="Meta cadastrada — a saúde aparece assim que o próximo sync trouxer os dados"
                >
                  Aguardando dados
                </span>
              ) : (
                <span
                  className="text-[10px] text-[#87919E] px-2 py-0.5 rounded-full bg-[#38435C]/50"
                  title="Cliente sem meta configurada — cadastre a meta para acompanhar a saúde"
                >
                  Sem meta
                </span>
              )}
            </div>
            {client.streakDays != null && client.streakDays >= 3 && client.streakStatus && (
              <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${
                client.streakStatus === 'RUIM'
                  ? 'bg-[#EF4444]/15 text-[#EF4444]'
                  : client.streakStatus === 'REGULAR'
                  ? 'bg-[#EAB308]/15 text-[#EAB308]'
                  : 'bg-[#22C55E]/15 text-[#22C55E]'
              }`}>
                há {client.streakDays} dias
              </span>
            )}
          </div>
        </div>

        {/* Atingimento geral (SEM SPEND — A-121) */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-[#87919E]">Atingimento geral</span>
            <span className="text-xs font-semibold text-[#EBEBEB]">
              {u?.overallAchievementPct == null && client.achievementPct === 0
                ? '—'
                : `${Math.round(atingimento)}%`}
            </span>
          </div>
          <Progress value={atingimento} />
          <p className="text-[9px] text-[#576070] mt-0.5">Sem consumo de budget</p>
        </div>

        {/* Consumo do budget (SPEND) — barra própria, NÃO pinta o atingimento */}
        {budgetMetric && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-[#87919E] flex items-center gap-1">
                <Wallet size={11} /> Consumo do budget
              </span>
              <span className={`text-xs font-semibold ${
                budgetMetric.pct > 100 ? 'text-[#EF4444]' : 'text-[#EBEBEB]'
              }`}>
                {Math.round(budgetMetric.pct)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[#38435C]/60 overflow-hidden">
              <div
                className={`h-full rounded-full ${budgetMetric.pct > 100 ? 'bg-[#EF4444]' : 'bg-[#95BBE2]'}`}
                style={{ width: `${Math.min(100, budgetMetric.pct)}%` }}
              />
            </div>
          </div>
        )}

        {/* Pacing mensal compacto (faturamento) */}
        {pacing && (pacing.meta != null || pacing.realizado != null) && (
          <div className="mb-3 rounded-lg bg-[#0A1E2C]/60 border border-[#38435C]/50 px-3 py-2 space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#87919E] uppercase tracking-wider">
              <Target size={10} /> Pacing do mês
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              <PacingCell label="Realizado" value={pacing.realizado} strong />
              <PacingCell label="Meta" value={pacing.meta} />
              <PacingCell label="Esperado até hoje" value={pacing.esperadoAteHoje} />
              <PacingCell
                label="Projeção"
                value={pacing.projecao}
                cls={
                  pacing.projecao != null && pacing.meta != null
                    ? pacing.projecao >= pacing.meta ? 'text-[#22C55E]' : 'text-[#EAB308]'
                    : undefined
                }
              />
            </div>
          </div>
        )}

        {/* ROAS semana passada (o antigo "Resultado" vira ISSO) */}
        {roas && (roas.value != null || roas.resultado) && (
          <div className="mb-2 flex items-center gap-1.5 text-[11px]">
            <Activity size={11} className="text-[#87919E] flex-shrink-0" />
            <span className="text-[#87919E]">ROAS {roas.label}:</span>
            <span className="font-semibold text-[#EBEBEB] tabular-nums">
              {roas.value != null ? `${roas.value.toFixed(2)}x` : '—'}
            </span>
            {roas.resultado && RESULTADO_LABEL[roas.resultado] && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{
                  color: RESULTADO_COLOR[roas.resultado] ?? '#87919E',
                  background: `${RESULTADO_COLOR[roas.resultado] ?? '#87919E'}1f`,
                }}
              >
                {RESULTADO_LABEL[roas.resultado]}
              </span>
            )}
          </div>
        )}

        {/* GA4Sync + aviso operacional de receita zerada com gasto */}
        {u && (
          <div className="mb-2 space-y-1">
            {u.ga4sync.connected ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#22C55E]">
                GA4Sync ✓
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#EAB308]">
                ⚠️ Loja não vinculada
              </span>
            )}
            {pacing?.semReceitaComGasto && (
              <p className="text-[10px] text-[#EF4444] leading-snug">
                {u.ga4sync.connected
                  ? 'R$ 0 de receita com anúncios rodando — sem vendas no período.'
                  : 'R$ 0 de receita com anúncios rodando — loja GA4Sync não vinculada?'}
              </p>
            )}
          </div>
        )}

        {/* Badges de métricas de PERFORMANCE (sem SPEND) */}
        {perfMetrics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {perfMetrics.slice(0, 4).map((m) => (
              <div
                key={m.name}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${healthBgClasses[m.status]}`}
              >
                <span>{m.name}</span>
                <span>{Math.round(m.pct)}%</span>
              </div>
            ))}
          </div>
        )}

        {/* Carimbo de atualização (regra UX #10) */}
        {u && (
          <p className="text-[9px] text-[#576070] mt-3 pt-2 border-t border-[#38435C]/40">
            Atualizado em {new Date(u.calculatedAt).toLocaleString('pt-BR')}
          </p>
        )}
      </div>
    </Link>
  )
}

function PacingCell({
  label, value, strong, cls,
}: { label: string; value: number | null; strong?: boolean; cls?: string }) {
  return (
    <div className="flex items-center justify-between gap-1">
      <span className="text-[#87919E]">{label}</span>
      <span className={`tabular-nums ${cls ?? (strong ? 'text-[#EBEBEB] font-semibold' : 'text-[#EBEBEB]')}`}>
        {value != null ? formatCurrency(value) : '—'}
      </span>
    </div>
  )
}
