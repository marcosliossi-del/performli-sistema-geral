/**
 * Tipos da API read-only do GA4Sync (KPIs de e-commerce Nuvemshop consolidados).
 *
 * ATENÇÃO: estes tipos foram modelados a partir da SPEC textual fornecida, NÃO
 * do /openapi.json (egress bloqueado no ambiente de dev). Todo campo marcado com
 * `TODO conferir openapi` precisa ser validado contra o schema oficial quando
 * houver acesso/chave. Campos que a spec diz poderem faltar (site.*, ads.hasData)
 * estão modelados como opcionais/nullable — NÃO assuma presença.
 */

// ─── Envelope e erros ────────────────────────────────────────────────────────

export interface Ga4SyncStoreRef {
  storeId: string
  storeName: string
}

export type Ga4SyncPreset =
  | 'today'
  | 'yesterday'
  | 'last_7d'
  | 'last_30d'
  | 'last_90d'
  | 'this_month'
  | 'prev_month'

export interface Ga4SyncPeriodInfo {
  since: string // YYYY-MM-DD (BRT)
  until: string // YYYY-MM-DD (BRT, inclusivo)
  preset: Ga4SyncPreset | null
}

export interface Ga4SyncMeta {
  resource: string
  generatedAt: string // ISO timestamp
  cached: boolean
}

/** Envelope de sucesso padrão de todos os recursos por-loja. */
export interface Envelope<T> {
  store: Ga4SyncStoreRef
  period: Ga4SyncPeriodInfo
  data: T
  meta: Ga4SyncMeta
}

/** Códigos de erro documentados da API. */
export type Ga4SyncErrorCode =
  | 'unauthorized' // 401
  | 'forbidden' // 403
  | 'not_found' // 404
  | 'invalid_period' // 400
  | 'bad_request' // 400
  | 'rate_limited' // 429
  | 'internal_error' // 500

export interface Ga4SyncErrorBody {
  error: {
    code: Ga4SyncErrorCode | string
    message: string
  }
}

/** Período aceito pelos helpers: preset OU intervalo explícito (BRT). */
export type Ga4SyncPeriod = Ga4SyncPreset | { since: string; until: string }

// ─── /stores (lista, sem envelope por-loja) ──────────────────────────────────

export interface Ga4SyncStoreListItem {
  storeId: string
  storeName: string
  niche: string | null
}

/** GET /stores → { data: Ga4SyncStoreListItem[] } (sem store/period/meta). */
export interface Ga4SyncStoresResponse {
  data: Ga4SyncStoreListItem[]
}

// ─── kpis ────────────────────────────────────────────────────────────────────

/** Bloco principal de KPIs. Spec cita ~29 campos; aqui os documentados. */
export interface Ga4SyncKpisBlock {
  revenue: number
  netRevenue: number
  orders: number
  avgTicket: number
  cancelledOrders: number
  cancelRate: number
  newCustomers: number
  recurringCustomers: number
  productsSold: number
  itemsPerOrder: number
  totalShipping: number
  avgShipping: number
  refundRate: number
  repurchaseRate: number
  revenuePerCustomer: number
  prevRevenue: number
  prevOrders: number
  prevAvgTicket: number
  // TODO conferir openapi: campos adicionais (~29 no total) podem existir.
}

export interface Ga4SyncRetentionBlock {
  totalCustomers: number
  customers30d: number
  customers60d: number
  customers90d: number
  avgLTV: number
  avgOrdersPerCustomer: number
}

/** Métricas de site podem vir null (não integrado / sem dado). */
export interface Ga4SyncSiteBlock {
  uniqueVisits: number | null
  cartConversion: number | null
  monthProjection: number | null
}

export interface Ga4SyncKpisData {
  kpis: Ga4SyncKpisBlock
  retention: Ga4SyncRetentionBlock
  /** site.* pode vir null campo-a-campo, e o bloco pode não vir. */
  site?: Ga4SyncSiteBlock | null
}

// ─── timeline ─────────────────────────────────────────────────────────────────

export interface Ga4SyncTimelinePoint {
  date: string // YYYY-MM-DD
  revenue: number // RECEITA BRUTA do dia (espelha kpis.revenue).
  orders: number
  // ── Receita LÍQUIDA diária (diretriz Marcos 2026-07-22) ──────────────────────
  // O bloco /kpis expõe `netRevenue` no AGREGADO do período, mas NÃO se sabe (egress
  // bloqueado em dev, /openapi.json não verificado) se o /timeline traz o líquido
  // POR DIA. Modelamos `netRevenue`/`newCustomers` como OPCIONAIS: se a API vier a
  // expô-los por ponto, o sync já os persiste; enquanto não, ficam undefined e o
  // faturamento líquido de e-commerce sai da fonte real por-pedido (Nuvemshop).
  // TODO conferir openapi: confirmar se timeline expõe netRevenue/newCustomers por dia.
  netRevenue?: number
  newCustomers?: number
}

/**
 * CONTRATO REAL confirmado em produção (debugStore My Muse, 2026-07-23): o
 * envelope do /timeline traz os pontos DIRETO em `data` (array), não em
 * `data.points` — o shape antigo lia points de um campo inexistente e o sync
 * gravava "SUCCESS · 0 registros". Campos reais por ponto: date, revenue,
 * orders, avgTicket, prevRevenue, prevOrders (sem netRevenue/newCustomers por
 * dia — o líquido continua derivado da razão do /kpis).
 */
export type Ga4SyncTimelineData = Ga4SyncTimelinePoint[]

// ─── channels ─────────────────────────────────────────────────────────────────

export interface Ga4SyncChannelRow {
  channel: string
  revenue: number
  orders: number
  // TODO conferir openapi: participação (%), sessions, etc.
}

export interface Ga4SyncChannelsData {
  channels: Ga4SyncChannelRow[]
}

// ─── products ─────────────────────────────────────────────────────────────────

export interface Ga4SyncProductRow {
  productId: string
  name: string
  revenue: number
  unitsSold: number
  // TODO conferir openapi.
}

export interface Ga4SyncProductsData {
  products: Ga4SyncProductRow[]
}

// ─── categories ───────────────────────────────────────────────────────────────

export interface Ga4SyncCategoryRow {
  category: string
  revenue: number
  unitsSold: number
  // TODO conferir openapi.
}

export interface Ga4SyncCategoriesData {
  categories: Ga4SyncCategoryRow[]
}

// ─── regions ──────────────────────────────────────────────────────────────────

export interface Ga4SyncRegionRow {
  region: string
  revenue: number
  orders: number
  // TODO conferir openapi.
}

export interface Ga4SyncRegionsData {
  regions: Ga4SyncRegionRow[]
}

// ─── retention (recurso dedicado) ─────────────────────────────────────────────

export type Ga4SyncRetentionData = Ga4SyncRetentionBlock

// ─── recursos tipados de forma frouxa (TODO conferir openapi) ─────────────────
// campaigns, payment-methods, coupons, heatmap, storefront, order-status,
// customers, ads. Modelados como `unknown` até validação contra o schema oficial.

/** ads pode vir com hasData:false — nunca assuma presença dos dados. */
export interface Ga4SyncAdsData {
  hasData: boolean
  // TODO conferir openapi: estrutura quando hasData === true.
  [key: string]: unknown
}

/** Recursos ainda não tipados fortemente. */
export type Ga4SyncLooseData = Record<string, unknown>

// ─── Mapa recurso → tipo de data ──────────────────────────────────────────────

export const GA4SYNC_RESOURCES = [
  'kpis',
  'timeline',
  'channels',
  'campaigns',
  'products',
  'categories',
  'regions',
  'payment-methods',
  'coupons',
  'heatmap',
  'storefront',
  'order-status',
  'retention',
  'customers',
  'ads',
] as const

export type Ga4SyncResource = (typeof GA4SYNC_RESOURCES)[number]
