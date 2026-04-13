/**
 * Cliente para a API REST da Nuvemshop (Tiendanube).
 *
 * A API da Nuvemshop utiliza OAuth2 para autenticação.
 * Cada loja tem um access_token permanente (não expira).
 *
 * Base URL: https://api.nuvemshop.com.br/v1/{store_id}
 *
 * Variáveis de ambiente do app:
 *   NUVEMSHOP_APP_ID        — ID do aplicativo
 *   NUVEMSHOP_APP_SECRET    — Client secret do aplicativo
 *   NUVEMSHOP_USER_AGENT    — Email cadastrado como User-Agent
 *   NEXT_PUBLIC_APP_URL     — URL base do app (para redirect OAuth)
 */

const NUVEMSHOP_API_BASE = 'https://api.nuvemshop.com.br/v1'
const NUVEMSHOP_AUTH_URL = 'https://www.nuvemshop.com.br/apps/authorize/token'

// ── Types ────────────────────────────────────────────────────────────────────

export interface NuvemshopOAuthResponse {
  access_token: string
  token_type: string
  scope: string
  user_id: number // store ID
}

export interface NuvemshopStoreInfo {
  id: number
  name: { pt: string; es?: string; en?: string }
  url_with_protocol: string
  main_currency: string
  email: string
  plan_name: string
}

export interface NuvemshopRawOrder {
  id: number
  number: number
  status: 'open' | 'closed' | 'cancelled'
  payment_status: 'pending' | 'authorized' | 'paid' | 'voided' | 'refunded' | 'abandoned'
  shipping_status: 'unpacked' | 'fulfilled' | 'unfulfilled' | 'partially_fulfilled'
  currency: string
  subtotal: string
  discount: string
  shipping_cost_customer: string
  total: string
  products: Array<{
    id: number
    name: string
    quantity: number
    price: string
  }>
  coupon: Array<{ code: string }> | null
  customer: {
    id: number
    name: string
    email: string
  } | null
  landing_url: string | null
  referral_url: string | null
  storefront: string | null
  created_at: string
  closed_at: string | null
  cancelled_at: string | null
  paid_at: string | null
}

// ── OAuth helpers ────────────────────────────────────────────────────────────

export function getNuvemshopAuthUrl(state?: string): string {
  const appId = process.env.NUVEMSHOP_APP_ID
  if (!appId) throw new Error('NUVEMSHOP_APP_ID não configurado')

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/nuvemshop/callback`

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: appId,
    redirect_uri: redirectUri,
  })

  if (state) params.set('state', state)

  return `https://www.nuvemshop.com.br/apps/${appId}/authorize?${params.toString()}`
}

export async function exchangeCodeForToken(code: string): Promise<NuvemshopOAuthResponse> {
  const appId = process.env.NUVEMSHOP_APP_ID
  const appSecret = process.env.NUVEMSHOP_APP_SECRET

  if (!appId || !appSecret) {
    throw new Error('NUVEMSHOP_APP_ID e NUVEMSHOP_APP_SECRET devem estar configurados')
  }

  const res = await fetch(NUVEMSHOP_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      code,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Falha na troca do código OAuth Nuvemshop: ${err}`)
  }

  return res.json()
}

// ── API Client ───────────────────────────────────────────────────────────────

export class NuvemshopClient {
  private storeId: string
  private accessToken: string

  constructor(storeId: string, accessToken: string) {
    this.storeId = storeId
    this.accessToken = accessToken
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${NUVEMSHOP_API_BASE}/${this.storeId}${path}`

    const res = await fetch(url, {
      ...options,
      headers: {
        'Authentication': `bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': process.env.NUVEMSHOP_USER_AGENT || 'Performli/1.0 (kyn.leonardo@gmail.com)',
        ...options.headers,
      },
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Nuvemshop API error ${res.status}: ${err}`)
    }

    return res.json()
  }

  async getStoreInfo(): Promise<NuvemshopStoreInfo> {
    return this.request<NuvemshopStoreInfo>('')
  }

  /**
   * Lista pedidos com paginação automática.
   * A API retorna no máximo 200 pedidos por página.
   */
  async getOrders(params: {
    since?: string  // ISO date
    until?: string  // ISO date
    status?: 'open' | 'closed' | 'cancelled' | 'any'
    page?: number
    perPage?: number
  } = {}): Promise<NuvemshopRawOrder[]> {
    const query = new URLSearchParams()

    if (params.since) query.set('created_at_min', params.since)
    if (params.until) query.set('created_at_max', params.until)
    if (params.status && params.status !== 'any') query.set('status', params.status)

    query.set('per_page', String(params.perPage ?? 200))
    query.set('page', String(params.page ?? 1))
    query.set('fields', 'id,number,status,payment_status,shipping_status,currency,subtotal,discount,shipping_cost_customer,total,products,coupon,customer,landing_url,referral_url,storefront,created_at,closed_at,cancelled_at,paid_at')

    return this.request<NuvemshopRawOrder[]>(`/orders?${query.toString()}`)
  }

  /**
   * Busca todos os pedidos paginando automaticamente.
   */
  async getAllOrders(params: {
    since?: string
    until?: string
    status?: 'open' | 'closed' | 'cancelled' | 'any'
  } = {}): Promise<NuvemshopRawOrder[]> {
    const allOrders: NuvemshopRawOrder[] = []
    let page = 1
    const perPage = 200

    while (true) {
      const orders = await this.getOrders({ ...params, page, perPage })
      allOrders.push(...orders)

      if (orders.length < perPage) break
      page++

      // Safety: máximo 50 páginas (10.000 pedidos)
      if (page > 50) break
    }

    return allOrders
  }

  async getOrder(orderId: string | number): Promise<NuvemshopRawOrder> {
    return this.request<NuvemshopRawOrder>(`/orders/${orderId}`)
  }

  /**
   * Registra um webhook para receber notificações de eventos.
   */
  async createWebhook(event: string, url: string): Promise<{ id: number }> {
    return this.request('/webhooks', {
      method: 'POST',
      body: JSON.stringify({ event, url }),
    })
  }

  /**
   * Lista webhooks registrados.
   */
  async listWebhooks(): Promise<Array<{ id: number; event: string; url: string }>> {
    return this.request('/webhooks')
  }

  /**
   * Remove um webhook.
   */
  async deleteWebhook(webhookId: number): Promise<void> {
    await this.request(`/webhooks/${webhookId}`, { method: 'DELETE' })
  }
}
