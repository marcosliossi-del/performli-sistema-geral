/**
 * Cliente HTTP para a Meta Ads Graph API.
 * Usa fetch nativo (sem SDK) para manter o bundle leve.
 */

import type { MetaInsightRecord } from './transformers'

const GRAPH_API_VERSION = 'v22.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

const INSIGHT_FIELDS = [
  'spend',
  'impressions',
  'clicks',
  'reach',
  'frequency',
  'ctr',
  'cpc',
  'actions',
  'action_values',
  'cost_per_action_type',
  'purchase_roas',
].join(',')

export class MetaAdsClient {
  constructor(private readonly accessToken: string) {}

  /**
   * Busca insights diários de uma conta de anúncios para um intervalo de datas.
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
      fields: INSIGHT_FIELDS,
      limit: '31',
    })

    const url = `${GRAPH_BASE}/${adAccountId}/insights?${params}`
    const res = await fetch(url, { next: { revalidate: 0 } })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(
        `Meta API error ${res.status}: ${err?.error?.message ?? res.statusText}`
      )
    }

    const json = await res.json()
    return (json.data ?? []) as MetaInsightRecord[]
  }

  /**
   * Valida se o token de acesso ainda é válido e retorna info da conta.
   */
  async validateToken(): Promise<{ valid: boolean; expiresAt?: Date; appId?: string }> {
    const appId = process.env.META_APP_ID
    const appSecret = process.env.META_APP_SECRET

    if (!appId || !appSecret) {
      // Sem credenciais de app configuradas — assume válido
      return { valid: true }
    }

    const params = new URLSearchParams({
      input_token: this.accessToken,
      access_token: `${appId}|${appSecret}`,
    })

    const res = await fetch(`${GRAPH_BASE}/debug_token?${params}`)
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

    const res = await fetch(`${GRAPH_BASE}/me/adaccounts?${params}`)
    if (!res.ok) throw new Error(`Meta API error ${res.status}`)

    const json = await res.json()
    return (json.data ?? []).map((a: { id: string; name: string; currency: string }) => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
    }))
  }
}
