import { prisma } from '@/lib/prisma'
import type {
  AsaasBalanceDTO,
  AsaasCustomerDTO,
  AsaasFinancialTransactionDTO,
  AsaasListResponse,
  AsaasPaymentDTO,
  AsaasSubscriptionDTO,
  AsaasTransferDTO,
} from './types'

const PAGE_SIZE = 100

export class AsaasClient {
  private headers: Record<string, string>
  private baseUrl: string

  constructor(apiKey: string, sandbox = false) {
    this.baseUrl = sandbox
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://api.asaas.com/v3'
    this.headers = {
      'access_token': apiKey,
      'Content-Type': 'application/json',
    }
  }

  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    const res = await fetch(url.toString(), {
      headers: this.headers,
      signal:  AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Asaas API ${res.status} on ${path}: ${body}`)
    }
    return res.json() as T
  }

  private async fetchAll<T>(path: string, extra: Record<string, string> = {}): Promise<T[]> {
    const MAX_PAGES = 100 // teto de segurança: 100 * 100 = 10.000 itens
    const items: T[] = []
    let offset = 0
    for (let page = 0; page < MAX_PAGES; page++) {
      const resp = await this.get<AsaasListResponse<T>>(path, {
        ...extra,
        limit:  String(PAGE_SIZE),
        offset: String(offset),
      })
      items.push(...resp.data)
      if (!resp.hasMore) return items
      offset += PAGE_SIZE
    }
    throw new Error(
      `Asaas fetchAll em ${path} excedeu o teto de ${MAX_PAGES} páginas ` +
      `(${MAX_PAGES * PAGE_SIZE} itens) — abortando para não loopar indefinidamente.`,
    )
  }

  async getBalance(): Promise<AsaasBalanceDTO> {
    return this.get<AsaasBalanceDTO>('/finance/balance')
  }

  async getCustomers(): Promise<AsaasCustomerDTO[]> {
    return this.fetchAll<AsaasCustomerDTO>('/customers')
  }

  async getPayments(opts: {
    status?: string
    dueDateGte?: string
    dueDateLte?: string
    paymentDateGte?: string
    paymentDateLte?: string
  } = {}): Promise<AsaasPaymentDTO[]> {
    const params: Record<string, string> = {}
    if (opts.status)         params.status         = opts.status
    if (opts.dueDateGte)     params.dueDateGte     = opts.dueDateGte
    if (opts.dueDateLte)     params.dueDateLte     = opts.dueDateLte
    if (opts.paymentDateGte) params.paymentDateGte = opts.paymentDateGte
    if (opts.paymentDateLte) params.paymentDateLte = opts.paymentDateLte
    return this.fetchAll<AsaasPaymentDTO>('/payments', params)
  }

  async getSubscriptions(): Promise<AsaasSubscriptionDTO[]> {
    return this.fetchAll<AsaasSubscriptionDTO>('/subscriptions')
  }

  async getTransfers(opts: { dateGte?: string; dateLte?: string } = {}): Promise<AsaasTransferDTO[]> {
    const params: Record<string, string> = {}
    // Asaas transfers endpoint uses startDate/endDate (not dateGte/dateLte)
    if (opts.dateGte) params.startDate = opts.dateGte
    if (opts.dateLte) params.endDate   = opts.dateLte
    return this.fetchAll<AsaasTransferDTO>('/transfers', params)
  }

  async getFinancialTransactions(opts: {
    startDate?: string
    endDate?: string
    type?: 'CREDIT' | 'DEBIT'
  } = {}): Promise<AsaasFinancialTransactionDTO[]> {
    const params: Record<string, string> = {}
    if (opts.startDate) params.startDate = opts.startDate
    if (opts.endDate)   params.endDate   = opts.endDate
    if (opts.type)      params.type      = opts.type
    return this.fetchAll<AsaasFinancialTransactionDTO>('/finance/financialTransactions', params)
  }
}

/** Reads API key from DB first, falls back to env var */
export async function getAsaasClient(): Promise<AsaasClient> {
  const rows = await prisma.integrationSetting.findMany({
    where: { key: { in: ['ASAAS_API_KEY', 'ASAAS_SANDBOX'] } },
  })
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]))

  const key     = map.ASAAS_API_KEY     ?? process.env.ASAAS_API_KEY
  const sandbox = (map.ASAAS_SANDBOX    ?? process.env.ASAAS_SANDBOX) === 'true'

  if (!key) throw new Error('ASAAS_API_KEY not configured')
  return new AsaasClient(key, sandbox)
}
