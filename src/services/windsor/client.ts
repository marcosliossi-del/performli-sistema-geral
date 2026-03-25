/**
 * Cliente para a Windsor.ai Connector API.
 * Substitui o acesso direto ao Meta Ads Graph API e à GA4 Data API.
 *
 * Documentação: https://windsor.ai/api-documentation/
 *
 * Endpoint base:  https://connectors.windsor.ai/{connector}
 * Auth:           ?api_key=WINDSOR_API_KEY
 * Conectores:     facebook  |  googleanalytics4
 */

const WINDSOR_BASE = 'https://connectors.windsor.ai'

// ── Meta Ads (facebook) ───────────────────────────────────────────────────────
// Windsor facebook connector espelha nomes da Meta Graph API em snake_case.
// ROAS não é campo nativo — calculado no transformer (action_values_purchase / spend).
const META_FIELDS = [
  'date',
  'account_id',
  'account_name',
  'spend',
  'impressions',
  'clicks',
  'reach',
  'frequency',
  'ctr',
  'cpc',
  'actions_purchase',         // contagem de compras/conversões de compra
  'action_values_purchase',   // receita de compras (para calcular ROAS)
].join(',')

// Nível de campanha + conjunto — inclui campaign_id/name e adset_id/name
const META_CAMPAIGN_FIELDS = [
  'date',
  'account_id',
  'campaign_id',
  'campaign_name',
  'adset_id',
  'adset_name',
  'spend',
  'impressions',
  'clicks',
  'reach',
  'ctr',
  'cpc',
  'actions_purchase',
  'action_values_purchase',
].join(',')

// ── GA4 (googleanalytics4) ────────────────────────────────────────────────────
// Windsor GA4 usa snake_case (não camelCase nem nomes UA).
const GA4_FIELDS = [
  'date',
  'account_id',
  'sessions',
  'screen_page_views',   // page views (não "pageviews")
  'active_users',        // usuários ativos (não "users")
  'engagement_rate',     // snake_case (não "engagementRate")
  'ecommerce_purchases', // compras de e-commerce (não o genérico "conversions")
  'totalRevenue',        // camelCase GA4 nativo — único nome aceito pelo Windsor
  'newUsers',            // novos usuários únicos — base para CAC
].join(',')

// ── Tipos de resposta ─────────────────────────────────────────────────────────

export interface WindsorMetaRow {
  date: string
  account_id?: string
  account_name?: string
  spend?: number | string
  impressions?: number | string
  clicks?: number | string
  reach?: number | string
  frequency?: number | string
  ctr?: number | string
  cpc?: number | string
  conversions?: number | string
  actions_purchase?: number | string
  action_values_purchase?: number | string
}

export interface WindsorMetaCampaignRow {
  date: string
  account_id?: string
  campaign_id?: string
  campaign_name?: string
  adset_id?: string
  adset_name?: string
  spend?: number | string
  impressions?: number | string
  clicks?: number | string
  reach?: number | string
  ctr?: number | string
  cpc?: number | string
  actions_purchase?: number | string
  action_values_purchase?: number | string
}

export interface WindsorGA4Row {
  date: string
  account_id?: string
  sessions?: number | string
  screen_page_views?: number | string
  active_users?: number | string
  engagement_rate?: number | string
  ecommerce_purchases?: number | string  // snake_case (padrão Windsor GA4)
  ecommercePurchases?: number | string   // camelCase (fallback)
  totalRevenue?: number | string         // camelCase GA4 nativo
  total_revenue?: number | string        // snake_case (Windsor às vezes normaliza)
  new_users?: number | string            // novos usuários (para CAC)
  newUsers?: number | string             // camelCase fallback
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Converte campo Windsor (string ou number) para number. */
export function toNum(val: number | string | undefined | null): number {
  if (val === undefined || val === null || val === '') return 0
  return typeof val === 'number' ? val : parseFloat(val) || 0
}

// ── Cliente Windsor ───────────────────────────────────────────────────────────

export class WindsorClient {
  private readonly apiKey: string

  constructor() {
    const key = process.env.WINDSOR_API_KEY
    if (!key) throw new Error('WINDSOR_API_KEY não configurada')
    this.apiKey = key
  }

  private async query<T>(
    connector: 'facebook' | 'googleanalytics4',
    fields: string,
    accountId: string,
    since: string, // YYYY-MM-DD
    until: string  // YYYY-MM-DD
  ): Promise<T[]> {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      fields,
      date_from: since,
      date_to: until,
      account_id: accountId,
      _renderer: 'json',
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25_000)

    let res: Response
    try {
      res = await fetch(`${WINDSOR_BASE}/${connector}?${params}`, {
        next: { revalidate: 0 },
        signal: controller.signal,
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(`Windsor API timeout (${connector}) — sem resposta em 45s`)
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }

    if (!res.ok) {
      const body = await res.text()
      throw new Error(
        `Windsor API error ${res.status} (${connector}): ${body.slice(0, 300)}`
      )
    }

    const json = await res.json()
    // Windsor pode retornar array direto ou { data: [...] }
    return Array.isArray(json) ? json : ((json as { data?: T[] }).data ?? [])
  }

  /**
   * Busca insights diários do Meta Ads para uma conta de anúncios.
   * accountId: no formato act_XXXXX (igual ao Meta ad account ID)
   */
  async getMetaInsights(
    accountId: string,
    since: string,
    until: string
  ): Promise<WindsorMetaRow[]> {
    return this.query<WindsorMetaRow>('facebook', META_FIELDS, accountId, since, until)
  }

  /**
   * Busca insights diários por campanha + conjunto de anúncios do Meta.
   * Retorna uma linha por campanha/adset/dia.
   */
  async getMetaCampaignInsights(
    accountId: string,
    since: string,
    until: string
  ): Promise<WindsorMetaCampaignRow[]> {
    return this.query<WindsorMetaCampaignRow>('facebook', META_CAMPAIGN_FIELDS, accountId, since, until)
  }

  /**
   * Busca relatório diário do GA4 para uma propriedade.
   * propertyId: ID ou nome da propriedade conforme configurado no Windsor
   */
  async getGA4Report(
    propertyId: string,
    since: string,
    until: string
  ): Promise<WindsorGA4Row[]> {
    return this.query<WindsorGA4Row>('googleanalytics4', GA4_FIELDS, propertyId, since, until)
  }

  /**
   * Valida se uma conta Meta está acessível via Windsor.
   * Faz uma query mínima (1 dia, só spend) como teste.
   */
  async validateMetaAccount(accountId: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const dateStr = yesterday.toISOString().split('T')[0]
      await this.query('facebook', 'date,account_id,spend', accountId, dateStr, dateStr)
      return { valid: true }
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
}
