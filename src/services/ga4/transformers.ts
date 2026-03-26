/**
 * Transforma um registro diário da GA4 Data API
 * em campos compatíveis com o modelo MetricSnapshot.
 *
 * Mapeamento:
 *   impressions     → screenPageViews (visualizações de página)
 *   clicks          → sessions
 *   reach           → activeUsers (usuários únicos ativos)
 *   frequency       → páginas por sessão (screenPageViews / sessions)
 *   ctr             → engagementRate em % (taxa de engajamento)
 *   cpc             → 0 (GA4 não tem custo por clique)
 *   spend           → 0 (GA4 não tem gasto em mídia)
 *   conversions     → conversions
 *   conversionValue → totalRevenue
 *   roas            → null (sem spend)
 *   cpl             → null (sem spend)
 */

import type { GA4Row } from './client'

export interface GA4TransformedSnapshot {
  date: Date
  spend: number
  impressions: number
  clicks: number
  reach: number
  newUsers: number | null
  frequency: number
  ctr: number
  cpc: number
  conversions: number | null
  conversionValue: number | null
  roas: null
  cpl: null
  rawData: GA4Row
}

/**
 * Converte data no formato "YYYYMMDD" para Date.
 */
function parseGA4Date(yyyymmdd: string): Date {
  const iso = `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
  return new Date(iso + 'T00:00:00Z')
}

export function transformGA4Row(row: GA4Row): GA4TransformedSnapshot {
  const sessions = parseInt(row.sessions || '0')
  const pageViews = parseInt(row.screenPageViews || '0')
  const activeUsers = parseInt(row.activeUsers || '0')
  const newUsersRaw = parseInt(row.newUsers || '0')
  // engagementRate vem como decimal (ex: 0.6523 = 65.23%)
  const engagementRate = parseFloat(row.engagementRate || '0') * 100
  const purchasesRaw = parseInt(row.ecommercePurchases || '0')
  // purchaseRevenue é mais preciso para e-commerce; totalRevenue como fallback
  const purchaseRevenue = parseFloat(row.purchaseRevenue || '0')
  const totalRevenue = parseFloat(row.totalRevenue || '0')
  const revenue = purchaseRevenue > 0 ? purchaseRevenue : totalRevenue

  const frequency = sessions > 0 ? pageViews / sessions : 0

  return {
    date: parseGA4Date(row.date),
    spend: 0,
    impressions: pageViews,
    clicks: sessions,
    reach: activeUsers,
    newUsers: newUsersRaw > 0 ? newUsersRaw : null,
    frequency: Math.round(frequency * 10000) / 10000,
    ctr: Math.round(engagementRate * 100) / 100,
    cpc: 0,
    conversions: purchasesRaw > 0 ? purchasesRaw : null,
    conversionValue: revenue > 0 ? Math.round(revenue * 100) / 100 : null,
    roas: null,
    cpl: null,
    rawData: row,
  }
}
