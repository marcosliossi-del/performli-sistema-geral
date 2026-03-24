/**
 * Transforma linhas da Windsor API em objetos compatíveis com MetricSnapshot.
 */

import { toNum, type WindsorMetaRow, type WindsorGA4Row } from './client'

export interface WindsorTransformedSnapshot {
  date: Date
  spend: number
  impressions: number
  clicks: number
  reach: number
  frequency: number
  ctr: number
  cpc: number
  conversions: number | null
  conversionValue: number | null
  roas: number | null
  cpl: number | null
  rawData: object
}

// ── Meta Ads ──────────────────────────────────────────────────────────────────

export function transformWindsorMeta(row: WindsorMetaRow): WindsorTransformedSnapshot {
  const spend = toNum(row.spend)
  const conversions = toNum(row.conversions) || null

  // conversion_value e roas não são retornados pelo Windsor facebook connector
  // CPL é calculado a partir de spend / conversions
  const cpl: number | null = conversions && spend > 0
    ? Math.round((spend / conversions) * 100) / 100
    : null

  return {
    date: new Date(row.date + 'T00:00:00'),
    spend,
    impressions: Math.round(toNum(row.impressions)),
    clicks: Math.round(toNum(row.clicks)),
    reach: Math.round(toNum(row.reach)),
    frequency: Math.round(toNum(row.frequency) * 10000) / 10000,
    ctr: Math.round(toNum(row.ctr) * 100) / 100,
    cpc: Math.round(toNum(row.cpc) * 10000) / 10000,
    conversions: conversions ? Math.round(conversions) : null,
    conversionValue: null,
    roas: null,
    cpl,
    rawData: row,
  }
}

// ── GA4 ───────────────────────────────────────────────────────────────────────
// Mapeamento:
//   impressions     → sessions (pageviews não disponível no Windsor GA4)
//   clicks          → sessions
//   reach           → users (active users)
//   frequency       → 0 (sem page_views para calcular)
//   ctr             → 0 (engagementRate não disponível no Windsor GA4)
//   spend / cpc     → 0 (GA4 não tem custo de mídia)
//   conversions     → conversions
//   conversionValue → totalRevenue
//   roas / cpl      → null

export function transformWindsorGA4(row: WindsorGA4Row): WindsorTransformedSnapshot {
  const sessions = Math.round(toNum(row.sessions))
  const users = Math.round(toNum(row.users))
  const conversions = Math.round(toNum(row.conversions)) || null
  const revenue = toNum(row.totalRevenue) || null

  return {
    date: new Date(row.date + 'T00:00:00'),
    spend: 0,
    impressions: sessions, // proxy: sem pageviews disponível
    clicks: sessions,
    reach: users,
    frequency: 0,
    ctr: 0,
    cpc: 0,
    conversions,
    conversionValue: revenue,
    roas: null,
    cpl: null,
    rawData: row,
  }
}
