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
// Windsor facebook connector usa os nomes exatos da Meta Graph API Insights.
// Campos confirmados como válidos. ROAS e conversion_value são calculados
// a partir de outros campos no transformer quando não disponíveis.
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
  'conversions',
  // 'conversion_value' e 'roas' rejeitados pela API Windsor/Meta
  // ROAS é calculado no transformer via conversionValue / spend
].join(',')

// ── GA4 (googleanalytics4) ────────────────────────────────────────────────────
// Campo 'pageviews' e 'engagementRate' rejeitados pelo Windsor GA4 connector.
// Usando apenas campos confirmados como válidos.
const GA4_FIELDS = [
  'date',
  'account_id',
  'sessions',
  'users',
  'conversions',
  'totalRevenue',       // confirmado válido pelo Windsor GA4
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
}

export interface WindsorGA4Row {
  date: string
  account_id?: string
  sessions?: number | string
  users?: number | string
  conversions?: number | string
  totalRevenue?: number | string
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
