/**
 * Google Ads API client (v17)
 *
 * Auth: Service Account JWT (mesmo do GA4, scope adwords)
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_SERVICE_ACCOUNT_KEY
 *   GOOGLE_ADS_DEVELOPER_TOKEN   — obtido em Google Ads > Ferramentas > API Center
 *
 * Por conta: externalId = Customer ID sem hífens (ex: "1234567890")
 * Opcional:  GOOGLE_ADS_LOGIN_CUSTOMER_ID — se usar MCC (conta gerente)
 */

import { createSign } from 'crypto'

const ADS_BASE = 'https://googleads.googleapis.com/v17'
const TOKEN_URI = 'https://oauth2.googleapis.com/token'

export interface GoogleAdsRow {
  date: string           // "YYYY-MM-DD"
  campaignId: string
  campaignName: string
  impressions: number
  clicks: number
  costMicros: number     // custo em micro-unidades (dividir por 1_000_000)
  conversions: number
  conversionValue: number
}

// ── Service Account JWT (reúsa a lógica do GA4) ───────────────────────────────

function b64url(s: string) {
  return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key   = process.env.GOOGLE_SERVICE_ACCOUNT_KEY

  if (!email || !key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL e GOOGLE_SERVICE_ACCOUNT_KEY são necessários para Google Ads.')
  }

  const now     = Math.floor(Date.now() / 1000)
  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({
    iss:   email,
    scope: 'https://www.googleapis.com/auth/adwords',
    aud:   TOKEN_URI,
    iat:   now,
    exp:   now + 3600,
  }))

  const sigInput = `${header}.${payload}`
  const pem      = key.replace(/\\n/g, '\n')
  const sign     = createSign('RSA-SHA256')
  sign.update(sigInput)
  const sig = sign.sign(pem, 'base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const res = await fetch(TOKEN_URI, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  `${sigInput}.${sig}`,
    }),
  })

  if (!res.ok) throw new Error(`Falha ao obter token Google Ads: ${await res.text()}`)
  return ((await res.json()) as { access_token: string }).access_token
}

// ── Google Ads Client ─────────────────────────────────────────────────────────

export class GoogleAdsClient {
  private readonly developerToken: string
  private readonly loginCustomerId: string | undefined

  constructor() {
    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
    if (!devToken) {
      throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN não configurado.')
    }
    this.developerToken  = devToken
    this.loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
  }

  private headers(token: string): Record<string, string> {
    const h: Record<string, string> = {
      Authorization:    `Bearer ${token}`,
      'developer-token': this.developerToken,
      'Content-Type':   'application/json',
    }
    if (this.loginCustomerId) h['login-customer-id'] = this.loginCustomerId
    return h
  }

  /**
   * Valida acesso a um Customer ID chamando a API de campaigns (limit 1).
   */
  async validateCustomer(customerId: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const token = await getAccessToken()
      const clean = customerId.replace(/-/g, '')
      const res   = await fetch(`${ADS_BASE}/customers/${clean}/googleAds:search`, {
        method:  'POST',
        headers: this.headers(token),
        body:    JSON.stringify({
          query: 'SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1',
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = (err as { error?: { message?: string } })?.error?.message
          ?? `HTTP ${res.status}`
        return { valid: false, error: msg }
      }
      return { valid: true }
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  /**
   * Retorna métricas diárias por campanha para o período informado.
   */
  async getCampaignReport(
    customerId: string,
    since: string,
    until: string,
  ): Promise<GoogleAdsRow[]> {
    const token = await getAccessToken()
    const clean = customerId.replace(/-/g, '')

    const query = `
      SELECT
        segments.date,
        campaign.id,
        campaign.name,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM campaign
      WHERE segments.date BETWEEN '${since}' AND '${until}'
        AND campaign.status != 'REMOVED'
      ORDER BY segments.date ASC
      LIMIT 10000
    `

    const res = await fetch(`${ADS_BASE}/customers/${clean}/googleAds:search`, {
      method:  'POST',
      headers: this.headers(token),
      body:    JSON.stringify({ query }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(
        `Google Ads API error ${res.status}: ${(err as { error?: { message?: string } })?.error?.message ?? res.statusText}`
      )
    }

    const json = await res.json() as {
      results?: Array<{
        segments:  { date: string }
        campaign:  { id: string; name: string }
        metrics:   {
          impressions:      string
          clicks:           string
          costMicros:       string
          conversions:      string
          conversionsValue: string
        }
      }>
    }

    return (json.results ?? []).map((r) => ({
      date:            r.segments.date,
      campaignId:      r.campaign.id,
      campaignName:    r.campaign.name,
      impressions:     Number(r.metrics.impressions    ?? 0),
      clicks:          Number(r.metrics.clicks         ?? 0),
      costMicros:      Number(r.metrics.costMicros     ?? 0),
      conversions:     Number(r.metrics.conversions    ?? 0),
      conversionValue: Number(r.metrics.conversionsValue ?? 0),
    }))
  }
}
