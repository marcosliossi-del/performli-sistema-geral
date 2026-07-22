/**
 * FONTE ÚNICA de "realizado" por (cliente, métrica, período).
 *
 * Corrige o finding S2-014 da auditoria de metas: a mesma meta mostrava
 * "realizado" calculado de formas diferentes conforme a tela
 * (Σ GA4 conversionValue MTD em /agency/metas × HealthScore.actualValue no
 * Client 360 × Client.resultadoRoas na anti-churn), e o ROAS aparecia em 3
 * períodos distintos sem rótulo. Isso fazia os números divergirem entre telas.
 *
 * Aqui existe UMA regra canônica (toda via `aggregateSnapshots` do health-scorer,
 * para não haver duas contas divergentes):
 *  - FATURAMENTO / SALES (e-commerce) → receita com precedência GA4SYNC>GA4 POR
 *    DIA (loja real via GA4Sync > atribuído GA4); cliente só-GA4Sync é medido.
 *  - Métricas de anúncio (LEADS/MENSAGENS/CONVERSIONS/SPEND/…) → soma das
 *    plataformas de anúncio (GA4/GA4SYNC/NUVEMSHOP excluídos do investimento).
 *  - ROAS → revenue ÷ spend da MESMA janela (nunca mistura semana com MTD).
 *
 * A janela SEMANA_FECHADA é IDÊNTICA à do resultado-engine (getWeekRange(hoje-7d))
 * e ambos consomem `aggregateSnapshots`: por isso Client.resultadoRoas volta a
 * bater com o realizado desta fonte (promessa restaurada no Lote 1).
 *
 * Janelas padronizadas (fuso America/Sao_Paulo, reusando os helpers de utils):
 *  - MTD             → 1º dia do mês corrente (00:00 SP) até agora.
 *  - SEMANA_FECHADA  → domingo–sábado anterior (mesma janela do resultado-engine,
 *                      `getWeekRange(hoje - 7d)`), que alimenta Client.resultadoRoas.
 *
 * Toda saída deixa EXPLÍCITO qual janela e qual fonte foram usadas
 * (`{ valor, periodoLabel, fonte }`), porque número certo com rótulo ambíguo
 * ainda é atrito.
 */

import { prisma } from '@/lib/prisma'
import {
  getWeekRange,
  saoPauloDateString,
  formatSaoPauloDateTime,
} from '@/lib/utils'
import { aggregateSnapshots, type AggregatableSnapshot } from '@/services/health-scorer'
import type { MetricType, BusinessType } from '@prisma/client'

export type RealizadoPeriodo = 'MTD' | 'SEMANA_FECHADA'

export type Realizado = {
  /** Valor realizado da fonte canônica; null = indeterminado (sem dado na janela). */
  valor: number | null
  /** Rótulo curto do período, p/ exibir junto do número ("no mês" / "semana passada"). */
  periodoLabel: string
  /** De onde o número veio (GA4, plataformas de anúncio, GA4 ÷ investimento…). */
  fonte: string
}

export type Janela = { start: Date; end: Date; label: string }

/**
 * Período aceito pelas funções de realizado: um dos períodos canônicos OU uma
 * janela EXPLÍCITA {start, end, label} — necessária em telas com navegação
 * temporal (ex.: /reports com weekOffset), onde a semana exibida não é
 * necessariamente a última fechada. A janela explícita usa a MESMA agregação
 * canônica; só a fatia de tempo muda.
 */
export type PeriodoOuJanela = RealizadoPeriodo | Janela

/** Resolve a janela [start, end] e o rótulo de exibição para o período pedido. */
export function resolveJanela(periodo: PeriodoOuJanela, now: Date = new Date()): Janela {
  if (typeof periodo === 'object') return periodo
  if (periodo === 'SEMANA_FECHADA') {
    // Mesma janela do resultado-engine (a semana que contém "hoje - 7 dias"),
    // para que o realizado bata com Client.resultadoRoas.
    const { start, end } = getWeekRange(new Date(now.getTime() - 7 * 86_400_000))
    return { start, end, label: 'semana passada' }
  }
  // MTD — 1º dia do mês corrente até agora.
  // AL-3: o dia-parede SP continua definindo QUAL mês/dia-1 (saoPauloDateString),
  // mas o BOUND de query usa meia-noite UTC (padrão portal/kpis.ts utcDayStart),
  // porque MetricSnapshot.date é @db.Date (00:00Z). Usar saoPauloDayStart aqui
  // gerava 03:00Z e EXCLUÍA o snapshot do dia 1 (00:00Z) do MTD.
  const spDay = saoPauloDateString(now) // 'YYYY-MM-DD' (dia-parede SP)
  const start = new Date(`${spDay.slice(0, 7)}-01T00:00:00.000Z`)
  return { start, end: now, label: 'no mês' }
}

/** Fonte canônica declarada por métrica (apenas rótulo p/ a UI). */
function fonteDe(metric: MetricType): string {
  // Faturamento/ROAS: LÍQUIDO quando o cliente tem GA4Sync/Nuvemshop (receita real
  // da loja, sem frete); BRUTO (GA4 atribuído) nos demais e-commerces. A régua é
  // dinâmica por dia dentro de aggregateSnapshots — aqui só o rótulo genérico.
  if (metric === 'FATURAMENTO' || metric === 'SALES') return 'faturamento líquido (loja) ou bruto (GA4)'
  if (metric === 'ROAS') return 'faturamento ÷ investimento (mesma janela)'
  return 'plataformas de anúncio'
}

const snapInclude = { platformAccount: { select: { platform: true } } } as const

async function loadBusinessType(clientId: string): Promise<BusinessType> {
  const c = await prisma.client.findUnique({
    where: { id: clientId },
    select: { businessType: true },
  })
  return c?.businessType ?? 'ECOMMERCE'
}

/**
 * Realizado de UMA métrica de UM cliente na janela do período.
 * `businessType` é opcional; se omitido, é buscado (1 query extra).
 */
export async function getRealizado(
  clientId: string,
  metric: MetricType,
  periodo: PeriodoOuJanela,
  businessType?: BusinessType,
): Promise<Realizado> {
  const janela = resolveJanela(periodo)
  const bt = businessType ?? (await loadBusinessType(clientId))

  const snaps = await prisma.metricSnapshot.findMany({
    where: { clientId, date: { gte: janela.start, lte: janela.end } },
    include: snapInclude,
  })

  const valor = aggregateSnapshots(snaps as AggregatableSnapshot[], metric, bt)
  return { valor, periodoLabel: janela.label, fonte: fonteDe(metric) }
}

/**
 * Realizado de VÁRIAS métricas de UM cliente na MESMA janela, com uma única
 * query de snapshots (evita N+1 quando a tela mostra várias metas do cliente).
 * Retorna um Map<metric, Realizado>.
 */
export async function getRealizadoForMetrics(
  clientId: string,
  metrics: MetricType[],
  periodo: PeriodoOuJanela,
  businessType?: BusinessType,
): Promise<Map<MetricType, Realizado>> {
  const janela = resolveJanela(periodo)
  const out = new Map<MetricType, Realizado>()
  if (metrics.length === 0) return out

  const bt = businessType ?? (await loadBusinessType(clientId))
  const snaps = await prisma.metricSnapshot.findMany({
    where: { clientId, date: { gte: janela.start, lte: janela.end } },
    include: snapInclude,
  })

  for (const metric of new Set(metrics)) {
    const valor = aggregateSnapshots(snaps as AggregatableSnapshot[], metric, bt)
    out.set(metric, { valor, periodoLabel: janela.label, fonte: fonteDe(metric) })
  }
  return out
}

/**
 * Variante BATCH para várias telas de visão geral: realizado de UMA métrica
 * para VÁRIOS clientes, com UMA única query de snapshots (sem N+1).
 * Retorna Map<clientId, Realizado>. Clientes sem snapshot ficam com valor null.
 */
export async function getRealizadoBatch(
  clients: Array<{ id: string; businessType: BusinessType }>,
  metric: MetricType,
  // Aceita período canônico OU janela explícita {start,end,label}: telas com
  // navegação de mês (ex.: /agency/metas em meses PASSADOS) passam a janela do
  // mês exibido e continuam usando a MESMA agregação canônica — só a fatia de
  // tempo muda. Sem isso, mês passado caía em cálculo GA4-only divergente (A-005).
  periodo: PeriodoOuJanela,
): Promise<Map<string, Realizado>> {
  const janela = resolveJanela(periodo)
  const out = new Map<string, Realizado>()
  if (clients.length === 0) return out

  const snaps = await prisma.metricSnapshot.findMany({
    where: { clientId: { in: clients.map((c) => c.id) }, date: { gte: janela.start, lte: janela.end } },
    include: snapInclude, // clientId (scalar) já vem por padrão
  })

  const byClient = new Map<string, AggregatableSnapshot[]>()
  for (const s of snaps) {
    const arr = byClient.get(s.clientId) ?? []
    arr.push(s as AggregatableSnapshot)
    byClient.set(s.clientId, arr)
  }

  const fonte = fonteDe(metric)
  for (const c of clients) {
    const arr = byClient.get(c.id) ?? []
    const valor = aggregateSnapshots(arr, metric, c.businessType)
    out.set(c.id, { valor, periodoLabel: janela.label, fonte })
  }
  return out
}

/** Rótulo humano do período — usado por telas que só têm o enum em mãos. */
export function periodoLabelDe(periodo: RealizadoPeriodo): string {
  return periodo === 'SEMANA_FECHADA' ? 'semana passada' : 'no mês'
}

/** Data/hora legível (SP) do fim da janela — p/ "atualizado em". */
export function janelaFimLabel(periodo: RealizadoPeriodo, now: Date = new Date()): string {
  return formatSaoPauloDateTime(resolveJanela(periodo, now).end)
}
