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
// Campos solicitados à Windsor. Se Windsor renomear algum campo,
// ajuste aqui — os transformers fazem o mapeamento.
const META_FIELDS = [
  'date',
  'account_id',
  'account_name',
  'spend',
  'impressions',
  'clicks',             // link clicks
  'reach',
  'frequency',
  'ctr',                // percentual, ex: 2.5
  'cpc',
  'conversions',        // total conversions
  'revenue',            // conversion value / receita
  'purchase_roas',      // ROAS
  'cost_per_conversion', // CPL / CPA
].join(',')

// ── GA4 (googleanalytics4) ────────────────────────────────────────────────────
const GA4_FIELDS = [
  'date',
  'account_id',
  'sessions',
  'page_views',
  'users',              // active users
  'engagement_rate',    // decimal, ex: 0.65
  'conversions',
  'revenue',            // total revenue
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
  revenue?: number | string
  purchase_roas?: number | string
  cost_per_conversion?: number | string
}

export interface WindsorGA4Row {
  date: string
  account_id?: string
  sessions?: number | string
  page_views?: number | string
  users?: number | string
  engagement_rate?: number | string
  conversions?: number | string
  revenue?: number | string
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

    const res = await fetch(`${WINDSOR_BASE}/${connector}?${params}`, {
      next: { revalidate: 0 },
    })

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
