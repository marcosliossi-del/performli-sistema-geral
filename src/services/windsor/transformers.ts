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
  const conversionValue = toNum(row.revenue) || null

  let roas: number | null = toNum(row.purchase_roas) || null
  if (!roas && conversionValue && spend > 0) {
    roas = conversionValue / spend
  }

  let cpl: number | null = toNum(row.cost_per_conversion) || null
  if (!cpl && conversions && spend > 0) {
    cpl = spend / conversions
  }

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
    conversionValue: conversionValue || null,
    roas: roas ? Math.round(roas * 10000) / 10000 : null,
    cpl: cpl ? Math.round(cpl * 100) / 100 : null,
    rawData: row,
  }
}

// ── GA4 ───────────────────────────────────────────────────────────────────────
// Mapeamento:
//   impressions     → page_views
//   clicks          → sessions
//   reach           → users (active users)
//   frequency       → pages per session (page_views / sessions)
//   ctr             → engagement_rate em % (0.65 → 65.00)
//   spend / cpc     → 0 (GA4 não tem custo de mídia)
//   conversions     → conversions
//   conversionValue → revenue
//   roas / cpl      → null

export function transformWindsorGA4(row: WindsorGA4Row): WindsorTransformedSnapshot {
  const sessions = Math.round(toNum(row.sessions))
  const pageViews = Math.round(toNum(row.page_views))
  const users = Math.round(toNum(row.users))
  const engagementRate = toNum(row.engagement_rate) * 100 // decimal → %
  const conversions = Math.round(toNum(row.conversions)) || null
  const revenue = toNum(row.revenue) || null
  const frequency = sessions > 0 ? pageViews / sessions : 0

  return {
    date: new Date(row.date + 'T00:00:00'),
    spend: 0,
    impressions: pageViews,
    clicks: sessions,
    reach: users,
    frequency: Math.round(frequency * 10000) / 10000,
    ctr: Math.round(engagementRate * 100) / 100,
    cpc: 0,
    conversions,
    conversionValue: revenue,
    roas: null,
    cpl: null,
    rawData: row,
  }
}
