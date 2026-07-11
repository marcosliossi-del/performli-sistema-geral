import 'server-only'
import { unstable_cache } from 'next/cache'
import { saoPauloDateString } from '@/lib/utils'
import {
  getCategories,
  getChannels,
  getProducts,
  getRegions,
  getRetention,
  Ga4SyncError,
} from '@/services/ga4sync/client'
import { Ga4SyncConfigError, getGa4SyncConfig } from '@/services/ga4sync/config'
import { resolveGa4SyncStoreId } from '@/services/ga4sync/store-resolver'
import type {
  Ga4SyncCategoryRow,
  Ga4SyncChannelRow,
  Ga4SyncPeriod,
  Ga4SyncProductRow,
  Ga4SyncRegionRow,
  Ga4SyncRetentionData,
} from '@/services/ga4sync/types'
import type { PortalPeriod } from './kpis'

/**
 * Camada de DADOS do portal para as QUEBRAS de e-commerce do GA4Sync:
 * canais, produtos, categorias, regiões e retenção/LTV.
 *
 * Aditivo e independente de `kpis.ts` (getPortalKpis/getPortalFunnel/
 * getPortalProjection) e do `MetricSnapshot`: aqui a fonte é a API read-only do
 * GA4Sync (live + cache 60s), consumida pelo client tipado em
 * `src/services/ga4sync/client.ts`.
 *
 * Convenções do portal (obrigatórias):
 *  - `clientId` SEMPRE vem do chamador (que o obtém de `getAuthorizedClient` na
 *    página). A resolução de loja filtra `clientId` (store-resolver).
 *  - Cache `unstable_cache` com chave SEMPRE incluindo `clientId`:
 *    ['portal-ga4sync', <resource>, clientId, <periodKey>]; TTL 60s
 *    (revalidate 60), tag própria `portal-ga4sync:${clientId}` (NÃO reusa a tag
 *    `portal-kpis:${clientId}` — invalidação independente). Alinha com o
 *    Cache-Control max-age=60 da API.
 *  - pt-BR; NUNCA vaza stack/erro cru para o cliente externo.
 *
 * Política de degrade (estados que a UI distingue pelas flags):
 *  1. LOJA NÃO CONECTADA → `storeConnected:false`, todas as seções null,
 *     `unavailable:false`. Sem erro: o cliente simplesmente não tem loja
 *     Nuvemshop conectada.
 *  2. INDISPONÍVEL AGORA → `storeConnected:true`, `unavailable:true`. Ocorre
 *     quando TODAS as seções falharam (Ga4SyncError/timeout/config). A UI
 *     comunica "indisponível no momento".
 *  3. FALHA PARCIAL → `partialFailure:true` (com `unavailable:false`): ALGUMAS
 *     seções falharam (erro real), não todas. Sem esse flag, uma seção que
 *     falhou seria indistinguível de "sem vendas" — e a UI mentiria a causa
 *     (viola a diretriz anti-falha-silenciosa do CLAUDE.md). A UI avisa que
 *     algumas análises não puderam ser carregadas agora.
 *  4. SEÇÃO VAZIA (sem venda) → `storeConnected:true`, `unavailable:false`,
 *     `partialFailure:false`, seção `null` porque a API voltou vazia de fato.
 *     Nunca derruba as outras seções nem a página; nunca inventa número.
 */

// ─── Período: PortalPeriod → parâmetro GA4Sync ────────────────────────────────

/**
 * Traduz o `PortalPeriod` do portal para o período aceito pelo client GA4Sync.
 *
 *   mes_atual    → preset 'this_month'
 *   mes_anterior → preset 'prev_month'
 *   7d           → preset 'last_7d'
 *   30d          → preset 'last_30d'
 *   14d          → intervalo {since,until} (a API não tem preset de 14 dias):
 *                  últimos 14 dias no fuso BRT/SP, `until` inclusivo = hoje SP.
 *                  Diferença deliberada vs. kpis.ts (que fecha em ONTEM): as
 *                  quebras do GA4Sync são "live" e incluem o dia corrente,
 *                  coerente com os presets last_7d/last_30d da própria API.
 */
export function toGa4SyncPeriod(period: PortalPeriod): Ga4SyncPeriod {
  switch (period) {
    case 'mes_atual':
      return 'this_month'
    case 'mes_anterior':
      return 'prev_month'
    case '7d':
      return 'last_7d'
    case '30d':
      return 'last_30d'
    case '14d': {
      const until = saoPauloDateString() // hoje, dia-parede SP (inclusivo)
      const since = addSpDays(until, -13) // 14 dias no total (hoje + 13 anteriores)
      return { since, until }
    }
  }
}

/** Chave estável e serializável do período p/ chave de cache. */
function periodKey(period: PortalPeriod): string {
  const p = toGa4SyncPeriod(period)
  return typeof p === 'string' ? p : `${p.since}_${p.until}`
}

/** Soma `n` dias a um 'YYYY-MM-DD' (aritmética UTC, sem TZ drift no formato). */
function addSpDays(dayStr: string, n: number): string {
  const d = new Date(`${dayStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// ─── Shapes de saída (o que a UI precisa) ─────────────────────────────────────

/** Linha de canal normalizada com participação (%) sobre a receita total. */
export type PortalChannelRow = {
  channel: string
  revenue: number
  orders: number
  /** Participação na receita do período (0–100); null se total 0. */
  sharePct: number | null
}

/** Linha de produto normalizada (top vendidos). */
export type PortalProductRow = {
  productId: string
  name: string
  revenue: number
  unitsSold: number
  /** Participação na receita do período (0–100); null se total 0. */
  sharePct: number | null
}

/** Linha de categoria normalizada. */
export type PortalCategoryRow = {
  category: string
  revenue: number
  unitsSold: number
  sharePct: number | null
}

/** Linha de região normalizada. */
export type PortalRegionRow = {
  region: string
  revenue: number
  orders: number
  sharePct: number | null
}

/** Retenção/LTV do período (30/60/90d + LTV médio). */
export type PortalRetention = {
  totalCustomers: number
  customers30d: number
  customers60d: number
  customers90d: number
  avgLTV: number
  avgOrdersPerCustomer: number
}

/**
 * Quebras de e-commerce do portal. Cada seção é `null` quando: a loja não está
 * conectada, o recurso falhou (degrade por seção) OU a API veio vazia. A UI usa
 * `storeConnected`/`unavailable` para escolher a mensagem certa.
 */
export type PortalBreakdowns = {
  /** Loja Nuvemshop conectada e resolvida (store-resolver). */
  storeConnected: boolean
  /** TODAS as seções falharam com loja conectada → "indisponível no momento". */
  unavailable: boolean
  /**
   * ALGUMAS seções falharam (erro real), mas não todas. A UI usa isto para NÃO
   * apresentar uma seção ausente como "sem vendas" quando na verdade houve
   * falha — anti-falha-silenciosa (CLAUDE.md).
   */
  partialFailure: boolean
  channels: PortalChannelRow[] | null
  products: PortalProductRow[] | null
  categories: PortalCategoryRow[] | null
  regions: PortalRegionRow[] | null
  retention: PortalRetention | null
}

const PRODUCTS_LIMIT = 10
const CATEGORIES_LIMIT = 10
const CHANNELS_LIMIT = 12
const REGIONS_LIMIT = 12

// ─── Helpers de normalização ──────────────────────────────────────────────────

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** % de participação sobre um total; null se total não-positivo. */
function share(value: number, total: number): number | null {
  if (!(total > 0)) return null
  const pct = (value / total) * 100
  return Number.isFinite(pct) ? pct : null
}

/** Resultado de uma seção: valor (ou null) + se a ausência veio de ERRO real. */
type SectionResult<T> = { value: T | null; errored: boolean }

/**
 * Roda uma promise "settled" e converte QUALQUER rejeição (Ga4SyncError,
 * timeout, Ga4SyncConfigError, etc.) em null, marcando `errored:true`. Nunca
 * relança — degrade por seção. `errored` permite distinguir "falhou" de "veio
 * vazio" lá em cima (anti-falha-silenciosa). Não re-loga payloads (o client já
 * loga host+recurso+status).
 */
async function settledOrNull<T>(p: Promise<T>): Promise<SectionResult<T>> {
  try {
    return { value: await p, errored: false }
  } catch (err) {
    if (!(err instanceof Ga4SyncError || err instanceof Ga4SyncConfigError)) {
      // Erro inesperado: também degrada (não vaza p/ o cliente), com log mínimo.
      console.warn('[portal-ga4sync] falha inesperada em seção de quebra')
    }
    return { value: null, errored: true }
  }
}

// ─── Loaders por recurso (cacheados individualmente) ──────────────────────────
//
// Cada recurso tem cache próprio: uma seção lenta/quente não invalida as outras,
// e um recurso que falha não polui o cache dos demais (só falhas viram null e
// NÃO são memoizadas — settledOrNull roda por fora do unstable_cache).

function cachedChannels(clientId: string, storeId: string, period: PortalPeriod) {
  return unstable_cache(
    () => getChannels(storeId, toGa4SyncPeriod(period)),
    ['portal-ga4sync', 'channels', clientId, periodKey(period)],
    { revalidate: 60, tags: [`portal-ga4sync:${clientId}`] },
  )()
}

function cachedProducts(clientId: string, storeId: string, period: PortalPeriod) {
  return unstable_cache(
    () => getProducts(storeId, toGa4SyncPeriod(period), { sort: 'top', limit: PRODUCTS_LIMIT }),
    ['portal-ga4sync', 'products', clientId, periodKey(period)],
    { revalidate: 60, tags: [`portal-ga4sync:${clientId}`] },
  )()
}

function cachedCategories(clientId: string, storeId: string, period: PortalPeriod) {
  return unstable_cache(
    () => getCategories(storeId, toGa4SyncPeriod(period), { limit: CATEGORIES_LIMIT }),
    ['portal-ga4sync', 'categories', clientId, periodKey(period)],
    { revalidate: 60, tags: [`portal-ga4sync:${clientId}`] },
  )()
}

function cachedRegions(clientId: string, storeId: string, period: PortalPeriod) {
  return unstable_cache(
    () => getRegions(storeId, toGa4SyncPeriod(period)),
    ['portal-ga4sync', 'regions', clientId, periodKey(period)],
    { revalidate: 60, tags: [`portal-ga4sync:${clientId}`] },
  )()
}

function cachedRetention(clientId: string, storeId: string, period: PortalPeriod) {
  return unstable_cache(
    () => getRetention(storeId, toGa4SyncPeriod(period)),
    ['portal-ga4sync', 'retention', clientId, periodKey(period)],
    { revalidate: 60, tags: [`portal-ga4sync:${clientId}`] },
  )()
}

// ─── Normalizadores (Envelope → shape da UI). null se vazio. ──────────────────

function normalizeChannels(
  rows: Ga4SyncChannelRow[] | undefined | null,
): PortalChannelRow[] | null {
  if (!rows || rows.length === 0) return null
  const total = rows.reduce((a, r) => a + num(r.revenue), 0)
  const out = rows
    .map((r) => ({
      channel: r.channel,
      revenue: num(r.revenue),
      orders: num(r.orders),
      sharePct: share(num(r.revenue), total),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, CHANNELS_LIMIT)
  return out.length > 0 ? out : null
}

function normalizeProducts(
  rows: Ga4SyncProductRow[] | undefined | null,
): PortalProductRow[] | null {
  if (!rows || rows.length === 0) return null
  const total = rows.reduce((a, r) => a + num(r.revenue), 0)
  const out = rows
    .map((r) => ({
      productId: r.productId,
      name: r.name,
      revenue: num(r.revenue),
      unitsSold: num(r.unitsSold),
      sharePct: share(num(r.revenue), total),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, PRODUCTS_LIMIT)
  return out.length > 0 ? out : null
}

function normalizeCategories(
  rows: Ga4SyncCategoryRow[] | undefined | null,
): PortalCategoryRow[] | null {
  if (!rows || rows.length === 0) return null
  const total = rows.reduce((a, r) => a + num(r.revenue), 0)
  const out = rows
    .map((r) => ({
      category: r.category,
      revenue: num(r.revenue),
      unitsSold: num(r.unitsSold),
      sharePct: share(num(r.revenue), total),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, CATEGORIES_LIMIT)
  return out.length > 0 ? out : null
}

function normalizeRegions(
  rows: Ga4SyncRegionRow[] | undefined | null,
): PortalRegionRow[] | null {
  if (!rows || rows.length === 0) return null
  const total = rows.reduce((a, r) => a + num(r.revenue), 0)
  const out = rows
    .map((r) => ({
      region: r.region,
      revenue: num(r.revenue),
      orders: num(r.orders),
      sharePct: share(num(r.revenue), total),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, REGIONS_LIMIT)
  return out.length > 0 ? out : null
}

function normalizeRetention(
  data: Ga4SyncRetentionData | undefined | null,
): PortalRetention | null {
  if (!data) return null
  const totalCustomers = num(data.totalCustomers)
  // Sem clientes no período = sem dado de retenção real → null (não inventa 0s).
  if (totalCustomers <= 0) return null
  return {
    totalCustomers,
    customers30d: num(data.customers30d),
    customers60d: num(data.customers60d),
    customers90d: num(data.customers90d),
    avgLTV: num(data.avgLTV),
    avgOrdersPerCustomer: num(data.avgOrdersPerCustomer),
  }
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Quebras de e-commerce do portal (cliente, período). Fonte: GA4Sync live +
 * cache 60s por seção. Degrade suave conforme documentado em `PortalBreakdowns`.
 *
 * NUNCA lança para o chamador: falha vira null/flag. `clientId` do chamador
 * (getAuthorizedClient). A resolução de loja filtra `clientId`.
 */
export async function getPortalBreakdowns(
  clientId: string,
  period: PortalPeriod,
): Promise<PortalBreakdowns> {
  const empty: PortalBreakdowns = {
    storeConnected: false,
    unavailable: false,
    partialFailure: false,
    channels: null,
    products: null,
    categories: null,
    regions: null,
    retention: null,
  }

  if (!clientId) return empty

  const storeId = await resolveGa4SyncStoreId(clientId)
  if (!storeId) {
    // Estado 1: loja não conectada. Sem erro, tudo null.
    return empty
  }

  // Config checada UMA vez (evita 5× findMany + 5 throws por request). Chave
  // ausente é ERRO DE SETUP, não indisponibilidade transitória: loga alto (fica
  // visível no log do servidor, não some silenciosamente) e devolve indisponível
  // com storeConnected:true. NÃO grava AuditLog aqui: isto roda a cada render do
  // portal e inundaria a trilha — o log de servidor é o canal certo p/ misconfig.
  try {
    await getGa4SyncConfig()
  } catch (err) {
    if (err instanceof Ga4SyncConfigError) {
      console.error(
        '[portal-ga4sync] GA4SYNC_API_KEY/BASE ausente ou inválida — quebras do portal indisponíveis até configurar a integração.',
      )
      return { ...empty, storeConnected: true, unavailable: true }
    }
    throw err
  }

  // Busca em PARALELO; cada seção degrada isolada. `settledOrNull` NUNCA
  // rejeita (rejeição vira {value:null, errored:true}), então o `Promise.all`
  // não pode falhar — e cada elemento preserva seu tipo de Envelope.
  const [channelsR, productsR, categoriesR, regionsR, retentionR] = await Promise.all([
    settledOrNull(cachedChannels(clientId, storeId, period)),
    settledOrNull(cachedProducts(clientId, storeId, period)),
    settledOrNull(cachedCategories(clientId, storeId, period)),
    settledOrNull(cachedRegions(clientId, storeId, period)),
    settledOrNull(cachedRetention(clientId, storeId, period)),
  ])

  const results = [channelsR, productsR, categoriesR, regionsR, retentionR]
  // Estado 2: TODAS falharam → indisponível. Estado 3: ALGUMAS falharam →
  // falha parcial (a UI não pode chamar seção-que-falhou de "sem vendas").
  const erroredCount = results.filter((r) => r.errored).length
  const allFailed = erroredCount === results.length
  const partialFailure = erroredCount > 0 && !allFailed

  const channels = normalizeChannels(channelsR.value?.data?.channels)
  const products = normalizeProducts(productsR.value?.data?.products)
  const categories = normalizeCategories(categoriesR.value?.data?.categories)
  const regions = normalizeRegions(regionsR.value?.data?.regions)
  const retention = normalizeRetention(retentionR.value?.data)

  return {
    storeConnected: true,
    unavailable: allFailed,
    partialFailure,
    channels,
    products,
    categories,
    regions,
    retention,
  }
}

/**
 * Retenção/LTV do portal (30/60/90d + LTV médio) isolada. Reusa o MESMO cache
 * por-seção de `getPortalBreakdowns` (mesma chave), então chamar as duas não
 * duplica requisição. Degrade suave: null se loja não conectada, indisponível
 * ou sem clientes no período.
 */
export async function getPortalRetention(
  clientId: string,
  period: PortalPeriod,
): Promise<PortalRetention | null> {
  if (!clientId) return null
  const storeId = await resolveGa4SyncStoreId(clientId)
  if (!storeId) return null
  const env = await settledOrNull(cachedRetention(clientId, storeId, period))
  return normalizeRetention(env.value?.data)
}
