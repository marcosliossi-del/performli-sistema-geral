/**
 * Cliente para a Google Analytics Data API v1beta.
 *
 * Autenticação preferencial: Service Account (não expira)
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL   — client_email do JSON da chave
 *   GOOGLE_SERVICE_ACCOUNT_KEY     — private_key do JSON da chave
 *
 * Fallback (legado): OAuth2 refresh token
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN
 */

import { createSign } from 'crypto'

export interface GA4Row {
  date: string           // "YYYYMMDD"
  sessions: string
  screenPageViews: string
  activeUsers: string
  engagementRate: string
  ecommercePurchases: string
  purchaseRevenue: string
  totalRevenue: string
  newUsers: string
}

export interface GA4ItemRow {
  itemName: string
  itemCategory: string
  itemRevenue: string
  itemsPurchased: string
}

const GA4_BASE = 'https://analyticsdata.googleapis.com/v1beta'
const TOKEN_URI = 'https://oauth2.googleapis.com/token'

const METRIC_NAMES = [
  'sessions',
  'screenPageViews',
  'activeUsers',
  'engagementRate',
  'ecommercePurchases',
  'purchaseRevenue',
  'totalRevenue',
  'newUsers',
]

// ── Service Account JWT auth ───────────────────────────────────────────────────

function b64url(input: string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function getServiceAccountToken(email: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({
    iss:   email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud:   TOKEN_URI,
    iat:   now,
    exp:   now + 3600,
  }))

  const signingInput = `${header}.${payload}`

  // Vercel stores newlines as literal \n — convert back
  const pem = privateKey.replace(/\\n/g, '\n')
  const sign = createSign('RSA-SHA256')
  sign.update(signingInput)
  const sig = sign.sign(pem, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const jwt = `${signingInput}.${sig}`

  const res = await fetch(TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Falha ao obter token GA4 (Service Account): ${err}`)
  }

  const json = await res.json()
  return json.access_token as string
}

// ── OAuth refresh token (fallback legado) ─────────────────────────────────────

async function getRefreshToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Falha ao obter token GA4: ${err}`)
  }

  const json = await res.json()
  return json.access_token as string
}

// ─────────────────────────────────────────────────────────────────────────────

function normalizePropertyId(propertyId: string): string {
  return propertyId.startsWith('properties/') ? propertyId : `properties/${propertyId}`
}

export class GA4Client {
  private authMode: 'service_account' | 'oauth'
  // service account
  private saEmail?: string
  private saKey?: string
  // oauth
  private clientId?: string
  private clientSecret?: string
  private refreshToken?: string

  constructor() {
    const saEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    const saKey   = process.env.GOOGLE_SERVICE_ACCOUNT_KEY

    if (saEmail && saKey) {
      this.authMode = 'service_account'
      this.saEmail  = saEmail
      this.saKey    = saKey
      return
    }

    // Fallback to OAuth
    const clientId     = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

    if (clientId && clientSecret && refreshToken) {
      this.authMode     = 'oauth'
      this.clientId     = clientId
      this.clientSecret = clientSecret
      this.refreshToken = refreshToken
      return
    }

    throw new Error(
      'Credenciais GA4 não configuradas. Defina GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_KEY (recomendado) ou GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN.'
    )
  }

  private async token(): Promise<string> {
    if (this.authMode === 'service_account') {
      return getServiceAccountToken(this.saEmail!, this.saKey!)
    }
    return getRefreshToken(this.clientId!, this.clientSecret!, this.refreshToken!)
  }

  async validateProperty(propertyId: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const token      = await this.token()
      const normalized = normalizePropertyId(propertyId)

      const res = await fetch(`${GA4_BASE}/${normalized}/metadata`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = (err as { error?: { message?: string } })?.error?.message
          ?? `Propriedade não encontrada ou sem acesso (HTTP ${res.status})`
        return { valid: false, error: msg }
      }

      return { valid: true }
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async getItemReport(
    propertyId: string,
    since: string,
    until: string,
    limit = 10
  ): Promise<GA4ItemRow[]> {
    const token      = await this.token()
    const normalized = normalizePropertyId(propertyId)

    const body = {
      dateRanges: [{ startDate: since, endDate: until }],
      dimensions: [{ name: 'itemName' }, { name: 'itemCategory' }],
      metrics:    [{ name: 'itemRevenue' }, { name: 'itemsPurchased' }],
      orderBys:   [{ metric: { metricName: 'itemRevenue' }, desc: true }],
      limit,
    }

    const res = await fetch(`${GA4_BASE}/${normalized}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(
        `GA4 item report error ${res.status}: ${(err as { error?: { message?: string } })?.error?.message ?? res.statusText}`
      )
    }

    const json = await res.json()
    const rows = (json.rows ?? []) as Array<{
      dimensionValues: { value: string }[]
      metricValues:    { value: string }[]
    }>

    return rows.map((row) => ({
      itemName:       row.dimensionValues[0].value,
      itemCategory:   row.dimensionValues[1].value,
      itemRevenue:    row.metricValues[0].value,
      itemsPurchased: row.metricValues[1].value,
    }))
  }

  async getReport(propertyId: string, since: string, until: string): Promise<GA4Row[]> {
    const token      = await this.token()
    const normalized = normalizePropertyId(propertyId)

    const body = {
      dateRanges: [{ startDate: since, endDate: until }],
      dimensions: [{ name: 'date' }],
      metrics:    METRIC_NAMES.map((name) => ({ name })),
      orderBys:   [{ dimension: { dimensionName: 'date' } }],
      limit: 100,
    }

    const res = await fetch(`${GA4_BASE}/${normalized}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(
        `GA4 API error ${res.status}: ${(err as { error?: { message?: string } })?.error?.message ?? res.statusText}`
      )
    }

    const json = await res.json()
    const rows = (json.rows ?? []) as Array<{
      dimensionValues: { value: string }[]
      metricValues:    { value: string }[]
    }>

    return rows.map((row) => ({
      date:                 row.dimensionValues[0].value,
      sessions:             row.metricValues[0].value,
      screenPageViews:      row.metricValues[1].value,
      activeUsers:          row.metricValues[2].value,
      engagementRate:       row.metricValues[3].value,
      ecommercePurchases:   row.metricValues[4].value,
      purchaseRevenue:      row.metricValues[5].value,
      totalRevenue:         row.metricValues[6].value,
      newUsers:             row.metricValues[7].value,
    }))
  }
}
