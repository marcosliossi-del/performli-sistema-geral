import { getGa4SyncConfig } from './config'
import type {
  Envelope,
  Ga4SyncCategoriesData,
  Ga4SyncChannelsData,
  Ga4SyncErrorBody,
  Ga4SyncErrorCode,
  Ga4SyncKpisData,
  Ga4SyncPeriod,
  Ga4SyncProductsData,
  Ga4SyncRegionsData,
  Ga4SyncResource,
  Ga4SyncRetentionData,
  Ga4SyncStoresResponse,
  Ga4SyncTimelineData,
} from './types'

/**
 * Cliente HTTP read-only do GA4Sync.
 *
 * CLAUDE.md aplicável:
 *  #6 timeout em toda request (AbortSignal.timeout, 15s).
 *  #5 API key nunca em URL nem em log; só host + recurso + status são logados.
 *
 * Características:
 *  - GET only, HTTPS-only (a base já é https), Authorization Bearer fixo, Accept json.
 *  - Retry com backoff exponencial APENAS em 429 e 5xx (máx 3 tentativas).
 *    Respeita Retry-After (segundos) quando presente; senão backoff 2^n * base.
 *  - 4xx (exceto 429) e 401/403 NÃO são retentados — erro tipado imediato.
 *  - Erros de body { error:{code,message} } viram Ga4SyncError com `.code`.
 *  - Client puro (sem cache). A camada de cache (unstable_cache) vem em slice
 *    posterior, por cima destes métodos.
 */

const REQUEST_TIMEOUT_MS = 15_000
const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 500
const MAX_BACKOFF_MS = 8_000
const DEFAULT_PRESET = 'this_month'

/** Erro tipado da API GA4Sync (discriminado por `code`). */
export class Ga4SyncError extends Error {
  readonly code: Ga4SyncErrorCode | string
  readonly httpStatus: number
  readonly resource?: string

  constructor(args: {
    code: Ga4SyncErrorCode | string
    message: string
    httpStatus: number
    resource?: string
  }) {
    super(args.message)
    this.name = 'Ga4SyncError'
    this.code = args.code
    this.httpStatus = args.httpStatus
    this.resource = args.resource
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Extrai host da base para log seguro (sem query/params). */
function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return 'unknown-host'
  }
}

/** Converte período (preset | intervalo) em query params. */
function periodParams(period: Ga4SyncPeriod | undefined): Record<string, string> {
  if (!period) return { period: DEFAULT_PRESET }
  if (typeof period === 'string') return { period }
  return { since: period.since, until: period.until }
}

/**
 * GET genérico com timeout + retry/backoff + mapeamento de erro tipado.
 * Retorna o body JSON já parseado (o chamador conhece o formato do envelope).
 */
async function getJson<T>(
  path: string,
  params: Record<string, string>,
  logLabel: string,
): Promise<T> {
  const { baseUrl, apiKey } = await getGa4SyncConfig()

  const url = new URL(`${baseUrl}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const urlStr = url.toString()
  const host = hostOf(urlStr)

  let lastErr: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response
    try {
      res = await fetch(urlStr, {
        method: 'GET',
        headers: {
          // API key NUNCA em URL/log — só neste header.
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (err) {
      // Timeout / erro de rede: retentável dentro do teto.
      lastErr = err
      if (attempt < MAX_ATTEMPTS) {
        await sleep(Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS))
        continue
      }
      throw new Ga4SyncError({
        code: 'internal_error',
        message: `GA4Sync network/timeout em ${logLabel}: ${(err as Error)?.message ?? 'erro'}`,
        httpStatus: 0,
        resource: logLabel,
      })
    }

    if (res.ok) {
      return (await res.json()) as T
    }

    const status = res.status
    const retryable = status === 429 || (status >= 500 && status <= 599)

    // Log seguro: host + recurso + status. Sem key, sem body de auth.
    console.warn(`[ga4sync] ${host} ${logLabel} → HTTP ${status}`)

    if (retryable && attempt < MAX_ATTEMPTS) {
      const retryAfter = parseRetryAfter(res.headers.get('Retry-After'))
      const backoff =
        retryAfter ??
        Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS)
      await sleep(backoff)
      continue
    }

    // Sem mais retries (ou 4xx não-retentável): mapear erro do body.
    throw await toGa4SyncError(res, logLabel)
  }

  // Esgotou tentativas retentáveis.
  throw new Ga4SyncError({
    code: 'internal_error',
    message: `GA4Sync falhou após ${MAX_ATTEMPTS} tentativas em ${logLabel}: ${
      (lastErr as Error)?.message ?? 'erro desconhecido'
    }`,
    httpStatus: 0,
    resource: logLabel,
  })
}

/** Retry-After em segundos → ms (ignora formato HTTP-date, raro nesta API). */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null
  const secs = Number(header)
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, MAX_BACKOFF_MS)
  return null
}

/** Mapeia resposta de erro para Ga4SyncError, tolerando body não-JSON. */
async function toGa4SyncError(res: Response, resource: string): Promise<Ga4SyncError> {
  let code: Ga4SyncErrorCode | string = fallbackCode(res.status)
  let message = `GA4Sync HTTP ${res.status} em ${resource}`
  try {
    const body = (await res.json()) as Partial<Ga4SyncErrorBody>
    if (body?.error?.code) code = body.error.code
    if (body?.error?.message) message = body.error.message
  } catch {
    // body não-JSON — mantém defaults; NÃO logar body (pode conter dados).
  }
  return new Ga4SyncError({ code, message, httpStatus: res.status, resource })
}

function fallbackCode(status: number): Ga4SyncErrorCode {
  switch (status) {
    case 400:
      return 'bad_request'
    case 401:
      return 'unauthorized'
    case 403:
      return 'forbidden'
    case 404:
      return 'not_found'
    case 429:
      return 'rate_limited'
    default:
      return 'internal_error'
  }
}

// ─── API pública ──────────────────────────────────────────────────────────────

/** GET /stores — lista de lojas visíveis para a chave (sem envelope por-loja). */
export async function getStores(): Promise<Ga4SyncStoresResponse> {
  return getJson<Ga4SyncStoresResponse>('/stores', {}, 'stores')
}

/**
 * GET /stores/{storeId}/{resource} genérico.
 * `storeId` = NuvemshopStore.storeId (ver store-resolver). Sempre do chamador.
 */
export async function getStoreResource<T>(
  storeId: string,
  resource: Ga4SyncResource,
  params: Record<string, string> = {},
): Promise<Envelope<T>> {
  const path = `/stores/${encodeURIComponent(storeId)}/${resource}`
  return getJson<Envelope<T>>(path, params, `${resource}:${storeId}`)
}

// ─── Helpers tipados por recurso ──────────────────────────────────────────────

export function getKpis(
  storeId: string,
  period?: Ga4SyncPeriod,
): Promise<Envelope<Ga4SyncKpisData>> {
  return getStoreResource<Ga4SyncKpisData>(storeId, 'kpis', periodParams(period))
}

export function getTimeline(
  storeId: string,
  period?: Ga4SyncPeriod,
): Promise<Envelope<Ga4SyncTimelineData>> {
  return getStoreResource<Ga4SyncTimelineData>(storeId, 'timeline', periodParams(period))
}

export function getChannels(
  storeId: string,
  period?: Ga4SyncPeriod,
): Promise<Envelope<Ga4SyncChannelsData>> {
  return getStoreResource<Ga4SyncChannelsData>(storeId, 'channels', periodParams(period))
}

export function getProducts(
  storeId: string,
  period?: Ga4SyncPeriod,
  opts: { limit?: number; sort?: 'top' | 'least' } = {},
): Promise<Envelope<Ga4SyncProductsData>> {
  const params = periodParams(period)
  if (opts.limit != null) params.limit = String(opts.limit)
  if (opts.sort) params.sort = opts.sort
  return getStoreResource<Ga4SyncProductsData>(storeId, 'products', params)
}

export function getCategories(
  storeId: string,
  period?: Ga4SyncPeriod,
  opts: { limit?: number } = {},
): Promise<Envelope<Ga4SyncCategoriesData>> {
  const params = periodParams(period)
  if (opts.limit != null) params.limit = String(opts.limit)
  return getStoreResource<Ga4SyncCategoriesData>(storeId, 'categories', params)
}

export function getRegions(
  storeId: string,
  period?: Ga4SyncPeriod,
): Promise<Envelope<Ga4SyncRegionsData>> {
  return getStoreResource<Ga4SyncRegionsData>(storeId, 'regions', periodParams(period))
}

export function getRetention(
  storeId: string,
  period?: Ga4SyncPeriod,
): Promise<Envelope<Ga4SyncRetentionData>> {
  return getStoreResource<Ga4SyncRetentionData>(storeId, 'retention', periodParams(period))
}
