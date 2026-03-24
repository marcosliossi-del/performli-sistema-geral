/**
 * Cliente para a Google Analytics Data API v1beta.
 * Autenticação via Service Account (JWT → OAuth2 token).
 * Sem SDK externo — usa fetch nativo.
 */

export interface GA4Row {
  date: string           // "YYYYMMDD"
  sessions: string
  screenPageViews: string
  activeUsers: string
  engagementRate: string // decimal, ex: "0.6523"
  conversions: string
  totalRevenue: string
  newUsers: string
}

export interface GA4ItemRow {
  itemName: string
  itemCategory: string
  itemRevenue: string
  itemsPurchased: string
}

interface ServiceAccountKey {
  client_email: string
  private_key: string
  token_uri?: string
}

const GA4_BASE = 'https://analyticsdata.googleapis.com/v1beta'
const TOKEN_URI = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'

const METRIC_NAMES = [
  'sessions',
  'screenPageViews',
  'activeUsers',
  'engagementRate',
  'conversions',
  'totalRevenue',
  'newUsers',
]

function base64urlEncode(data: string | ArrayBuffer): string {
  let bytes: Uint8Array
  if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data)
  } else {
    bytes = new Uint8Array(data)
  }
  let str = ''
  bytes.forEach((b) => (str += String.fromCharCode(b)))
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const binary = Buffer.from(b64, 'base64')
  return crypto.subtle.importKey(
    'pkcs8',
    binary,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

async function createJWT(serviceAccount: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: serviceAccount.client_email,
    scope: SCOPE,
    aud: serviceAccount.token_uri ?? TOKEN_URI,
    exp: now + 3600,
    iat: now,
  }

  const headerB64 = base64urlEncode(JSON.stringify(header))
  const payloadB64 = base64urlEncode(JSON.stringify(payload))
  const signingInput = `${headerB64}.${payloadB64}`

  const key = await importPrivateKey(serviceAccount.private_key)
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  )

  return `${signingInput}.${base64urlEncode(signature)}`
}

async function getAccessToken(serviceAccount: ServiceAccountKey): Promise<string> {
  const jwt = await createJWT(serviceAccount)
  const res = await fetch(TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Falha ao obter token GA4: ${err}`)
  }

  const json = await res.json()
  return json.access_token as string
}

function normalizePropertyId(propertyId: string): string {
  return propertyId.startsWith('properties/') ? propertyId : `properties/${propertyId}`
}

export class GA4Client {
  private serviceAccount: ServiceAccountKey

  constructor() {
    const key = process.env.GA4_SERVICE_ACCOUNT_KEY
    if (!key) throw new Error('GA4_SERVICE_ACCOUNT_KEY não configurada')

    try {
      this.serviceAccount = JSON.parse(key) as ServiceAccountKey
    } catch {
      throw new Error('GA4_SERVICE_ACCOUNT_KEY não é um JSON válido')
    }
  }

  /**
   * Valida acesso a uma propriedade GA4 chamando o endpoint de metadata.
   */
  async validateProperty(
    propertyId: string
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      const token = await getAccessToken(this.serviceAccount)
      const normalized = normalizePropertyId(propertyId)

      const res = await fetch(`${GA4_BASE}/${normalized}/metadata`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg =
          (err as { error?: { message?: string } })?.error?.message ??
          `Propriedade não encontrada ou sem acesso (HTTP ${res.status})`
        return { valid: false, error: msg }
      }

      return { valid: true }
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * Busca o relatório de itens (produtos) de e-commerce para um período.
   * Retorna os top produtos por receita, com nome, categoria, receita e unidades vendidas.
   */
  async getItemReport(
    propertyId: string,
    since: string, // "YYYY-MM-DD"
    until: string, // "YYYY-MM-DD"
    limit = 10
  ): Promise<GA4ItemRow[]> {
    const token = await getAccessToken(this.serviceAccount)
    const normalized = normalizePropertyId(propertyId)

    const body = {
      dateRanges: [{ startDate: since, endDate: until }],
      dimensions: [
        { name: 'itemName' },
        { name: 'itemCategory' },
      ],
      metrics: [
        { name: 'itemRevenue' },
        { name: 'itemsPurchased' },
      ],
      orderBys: [{ metric: { metricName: 'itemRevenue' }, desc: true }],
      limit,
    }

    const res = await fetch(`${GA4_BASE}/${normalized}:runReport`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
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
    const rows = (
      json.rows ?? []
    ) as Array<{
      dimensionValues: { value: string }[]
      metricValues: { value: string }[]
    }>

    return rows.map((row) => ({
      itemName: row.dimensionValues[0].value,
      itemCategory: row.dimensionValues[1].value,
      itemRevenue: row.metricValues[0].value,
      itemsPurchased: row.metricValues[1].value,
    }))
  }

  /**
   * Busca relatório diário da propriedade GA4 para um intervalo de datas.
   */
  async getReport(
    propertyId: string,
    since: string, // "YYYY-MM-DD"
    until: string  // "YYYY-MM-DD"
  ): Promise<GA4Row[]> {
    const token = await getAccessToken(this.serviceAccount)
    const normalized = normalizePropertyId(propertyId)

    const body = {
      dateRanges: [{ startDate: since, endDate: until }],
      dimensions: [{ name: 'date' }],
      metrics: METRIC_NAMES.map((name) => ({ name })),
      orderBys: [{ dimension: { dimensionName: 'date' } }],
      limit: 100,
    }

    const res = await fetch(`${GA4_BASE}/${normalized}:runReport`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
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
    const rows = (
      json.rows ?? []
    ) as Array<{
      dimensionValues: { value: string }[]
      metricValues: { value: string }[]
    }>

    return rows.map((row) => ({
      date: row.dimensionValues[0].value,
      sessions: row.metricValues[0].value,
      screenPageViews: row.metricValues[1].value,
      activeUsers: row.metricValues[2].value,
      engagementRate: row.metricValues[3].value,
      conversions: row.metricValues[4].value,
      totalRevenue: row.metricValues[5].value,
      newUsers: row.metricValues[6].value,
    }))
  }
}
