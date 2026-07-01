/**
 * Cliente HTTP para a Meta Ads Graph API.
 * Usa fetch nativo (sem SDK) para manter o bundle leve.
 *
 * Auth: token individual (PlatformAccount.accessToken)
 *       ou META_SYSTEM_TOKEN (variável de ambiente) como fallback.
 */

import type { MetaInsightRecord, MetaCampaignInsightRecord } from './transformers'

const GRAPH_API_VERSION = 'v22.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

const ACCOUNT_FIELDS = [
  'spend',
  'impressions',
  'clicks',
  'reach',
  'frequency',
  'ctr',
  'cpc',
  'actions',
  'action_values',
  'purchase_roas',
].join(',')

const CAMPAIGN_FIELDS = [
  'spend',
  'impressions',
  'clicks',
  'reach',
  'ctr',
  'cpc',
  'actions',
  'action_values',
  'campaign_id',
  'campaign_name',
  'adset_id',
  'adset_name',
].join(',')

export class MetaAdsClient {
  private readonly accessToken: string

  /**
   * @param accessToken Token da conta. Se omitido, usa META_SYSTEM_TOKEN do ambiente.
   */
  constructor(accessToken?: string | null) {
    const token = accessToken ?? process.env.META_SYSTEM_TOKEN
    if (!token) {
      throw new Error(
        'Token Meta Ads não configurado. Defina META_SYSTEM_TOKEN nas variáveis de ambiente do Vercel.'
      )
    }
    this.accessToken = token
  }

  /** Fetch com timeout de 25s e paginação automática por cursor. */
  private async fetchPages<T>(url: string): Promise<T[]> {
    const results: T[] = []
    let next: string | null = url

    while (next) {
      const controller = new AbortController()
      const tid = setTimeout(() => controller.abort(), 25_000)

      let res: Response
      try {
        res = await fetch(next, {
          signal: controller.signal,
          next: { revalidate: 0 },
        })
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          throw new Error('Meta API timeout — sem resposta em 25s')
        }
        throw err
      } finally {
        clearTimeout(tid)
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } }
        const msg = body.error?.message ?? JSON.stringify(body).slice(0, 200)
        throw new Error(`Meta API error ${res.status}: ${msg}`)
      }

      const json = await res.json() as { data: T[]; paging?: { next?: string } }
      results.push(...(json.data ?? []))
      next = json.paging?.next ?? null
    }

    return results
  }

  /**
   * Insights diários a nível de conta de anúncios.
   */
  async getInsights(
    adAccountId: string,
    since: string, // "YYYY-MM-DD"
    until: string  // "YYYY-MM-DD"
  ): Promise<MetaInsightRecord[]> {
    const params = new URLSearchParams({
      access_token: this.accessToken,
      level: 'account',
      time_increment: '1',
      time_range: JSON.stringify({ since, until }),
      fields: ACCOUNT_FIELDS,
      limit: '31',
    })
    return this.fetchPages<MetaInsightRecord>(`${GRAPH_BASE}/${adAccountId}/insights?${params}`)
  }

  /**
   * Insights diários a nível de campanha + conjunto de anúncios.
   */
  async getCampaignInsights(
    adAccountId: string,
    since: string,
    until: string
  ): Promise<MetaCampaignInsightRecord[]> {
    const params = new URLSearchParams({
      access_token: this.accessToken,
      level: 'adset',
      time_increment: '1',
      time_range: JSON.stringify({ since, until }),
      fields: CAMPAIGN_FIELDS,
      limit: '100',
    })
    return this.fetchPages<MetaCampaignInsightRecord>(`${GRAPH_BASE}/${adAccountId}/insights?${params}`)
  }

  /**
   * Valida se a conta está acessível com o token atual.
   */
  async validateAccount(adAccountId: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const d = new Date()
      d.setDate(d.getDate() - 1)
      const yesterday = d.toISOString().split('T')[0]
      const params = new URLSearchParams({
        access_token: this.accessToken,
        level: 'account',
        time_increment: '1',
        time_range: JSON.stringify({ since: yesterday, until: yesterday }),
        fields: 'spend',
        limit: '1',
      })
      await this.fetchPages(`${GRAPH_BASE}/${adAccountId}/insights?${params}`)
      return { valid: true }
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  /**
   * Valida se o token de acesso ainda é válido e retorna info da conta.
   */
  async validateToken(): Promise<{ valid: boolean; expiresAt?: Date; appId?: string }> {
    const appId = process.env.META_APP_ID
    const appSecret = process.env.META_APP_SECRET

    if (!appId || !appSecret) {
      return { valid: true }
    }

    const params = new URLSearchParams({
      input_token: this.accessToken,
      access_token: `${appId}|${appSecret}`,
    })

    const res = await fetch(`${GRAPH_BASE}/debug_token?${params}`, { signal: AbortSignal.timeout(25_000) })
    if (!res.ok) return { valid: false }

    const json = await res.json()
    const data = json.data

    if (!data?.is_valid) return { valid: false }

    return {
      valid: true,
      expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : undefined,
      appId: data.app_id,
    }
  }

  /**
   * Busca as contas de anúncios acessíveis com este token.
   */
  async getAdAccounts(): Promise<{ id: string; name: string; currency: string }[]> {
    const params = new URLSearchParams({
      access_token: this.accessToken,
      fields: 'id,name,currency,account_status',
    })

    const res = await fetch(`${GRAPH_BASE}/me/adaccounts?${params}`, { signal: AbortSignal.timeout(25_000) })
    if (!res.ok) throw new Error(`Meta API error ${res.status}`)

    const json = await res.json()
    return (json.data ?? []).map((a: { id: string; name: string; currency: string }) => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
    }))
  }
}
