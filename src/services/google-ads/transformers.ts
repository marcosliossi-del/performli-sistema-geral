import type { GoogleAdsRow } from './client'

export type GoogleAdsSnapshotInput = {
  date: Date
  spend: number
  impressions: number
  clicks: number
  conversions: number
  conversionValue: number
  ctr: number | null
  cpc: number | null
}

/**
 * Agrega linhas diárias (multi-campanha) em um único snapshot por data.
 */
export function aggregateByDate(rows: GoogleAdsRow[]): GoogleAdsSnapshotInput[] {
  const byDate = new Map<string, GoogleAdsSnapshotInput>()

  for (const row of rows) {
    const spend = row.costMicros / 1_000_000

    if (!byDate.has(row.date)) {
      byDate.set(row.date, {
        date:            new Date(row.date + 'T00:00:00Z'),
        spend:           0,
        impressions:     0,
        clicks:          0,
        conversions:     0,
        conversionValue: 0,
        ctr:             null,
        cpc:             null,
      })
    }

    const day = byDate.get(row.date)!
    day.spend           += spend
    day.impressions     += row.impressions
    day.clicks          += row.clicks
    day.conversions     += row.conversions
    day.conversionValue += row.conversionValue
  }

  // Compute CTR and CPC after aggregation
  for (const day of byDate.values()) {
    day.ctr = day.impressions > 0 ? (day.clicks / day.impressions) * 100 : null
    day.cpc = day.clicks > 0 ? day.spend / day.clicks : null
  }

  return [...byDate.values()].sort((a, b) => a.date.getTime() - b.date.getTime())
}

/**
 * Transforms rows into per-campaign snapshots for the campaign breakdown table.
 */
export interface GoogleAdsCampaignRow {
  campaignId:      string
  campaignName:    string
  spend:           number
  impressions:     number
  clicks:          number
  conversions:     number
  conversionValue: number
  ctr:             number | null
  cpc:             number | null
  roas:            number | null
}

export function aggregateByCampaign(rows: GoogleAdsRow[]): GoogleAdsCampaignRow[] {
  const byCampaign = new Map<string, GoogleAdsCampaignRow>()

  for (const row of rows) {
    const spend = row.costMicros / 1_000_000
    if (!byCampaign.has(row.campaignId)) {
      byCampaign.set(row.campaignId, {
        campaignId:      row.campaignId,
        campaignName:    row.campaignName,
        spend:           0, impressions: 0, clicks: 0,
        conversions:     0, conversionValue: 0,
        ctr: null, cpc: null, roas: null,
      })
    }
    const c = byCampaign.get(row.campaignId)!
    c.spend           += spend
    c.impressions     += row.impressions
    c.clicks          += row.clicks
    c.conversions     += row.conversions
    c.conversionValue += row.conversionValue
  }

  for (const c of byCampaign.values()) {
    c.ctr  = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : null
    c.cpc  = c.clicks > 0 ? c.spend / c.clicks : null
    c.roas = c.spend > 0 && c.conversionValue > 0 ? c.conversionValue / c.spend : null
  }

  return [...byCampaign.values()].sort((a, b) => b.spend - a.spend)
}
