import type {
  AsaasBalanceDTO,
  AsaasCustomerDTO,
  AsaasListResponse,
  AsaasPaymentDTO,
  AsaasSubscriptionDTO,
  AsaasTransferDTO,
} from './types'

const BASE_URL = process.env.ASAAS_SANDBOX === 'true'
  ? 'https://sandbox.asaas.com/api/v3'
  : 'https://api.asaas.com/api/v3'

const PAGE_SIZE = 100

export class AsaasClient {
  private headers: Record<string, string>

  constructor(apiKey: string) {
    this.headers = {
      'access_token': apiKey,
      'Content-Type': 'application/json',
    }
  }

  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`)
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

    const res = await fetch(url.toString(), {
      headers: this.headers,
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Asaas API ${res.status} on ${path}: ${body}`)
    }
    return res.json() as T
  }

  /** Paginate through all items of a list endpoint */
  private async fetchAll<T>(path: string, extra: Record<string, string> = {}): Promise<T[]> {
    const items: T[] = []
    let offset = 0

    while (true) {
      const page = await this.get<AsaasListResponse<T>>(path, {
        ...extra,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      })
      items.push(...page.data)
      if (!page.hasMore) break
      offset += PAGE_SIZE
    }

    return items
  }

  async getBalance(): Promise<AsaasBalanceDTO> {
    return this.get<AsaasBalanceDTO>('/finance/balance')
  }

  async getCustomers(): Promise<AsaasCustomerDTO[]> {
    return this.fetchAll<AsaasCustomerDTO>('/customers')
  }

  /** Fetch payments optionally filtered by status and date range */
  async getPayments(opts: {
    status?: string
    dueDateGte?: string
    dueDateLte?: string
    paymentDateGte?: string
    paymentDateLte?: string
  } = {}): Promise<AsaasPaymentDTO[]> {
    const params: Record<string, string> = {}
    if (opts.status)           params.status           = opts.status
    if (opts.dueDateGte)       params.dueDateGte       = opts.dueDateGte
    if (opts.dueDateLte)       params.dueDateLte       = opts.dueDateLte
    if (opts.paymentDateGte)   params.paymentDateGte   = opts.paymentDateGte
    if (opts.paymentDateLte)   params.paymentDateLte   = opts.paymentDateLte
    return this.fetchAll<AsaasPaymentDTO>('/payments', params)
  }

  async getSubscriptions(): Promise<AsaasSubscriptionDTO[]> {
    return this.fetchAll<AsaasSubscriptionDTO>('/subscriptions')
  }

  async getTransfers(opts: { dateGte?: string; dateLte?: string } = {}): Promise<AsaasTransferDTO[]> {
    const params: Record<string, string> = {}
    if (opts.dateGte) params.dateGte = opts.dateGte
    if (opts.dateLte) params.dateLte = opts.dateLte
    return this.fetchAll<AsaasTransferDTO>('/transfers', params)
  }
}

export function getAsaasClient(): AsaasClient {
  const key = process.env.ASAAS_API_KEY
  if (!key) throw new Error('ASAAS_API_KEY not configured')
  return new AsaasClient(key)
}
