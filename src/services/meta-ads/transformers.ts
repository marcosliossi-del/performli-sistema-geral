/**
 * Transforma registros de insights da Meta Ads Graph API
 * em objetos compatíveis com o modelo MetricSnapshot.
 */

// ── Tipos de entrada (Meta API) ───────────────────────────────────────────────

export interface MetaInsightRecord {
  date_start: string         // "2026-03-18"
  spend: string              // "450.23"
  impressions: string
  clicks: string
  reach: string
  frequency: string
  ctr: string                // ex: "2.5" (percentual)
  cpc: string
  actions?: { action_type: string; value: string }[]
  cost_per_action_type?: { action_type: string; value: string }[]
  purchase_roas?: { action_type: string; value: string }[]
  action_values?: { action_type: string; value: string }[]
}

export interface MetaCampaignInsightRecord {
  date_start: string
  spend: string
  impressions: string
  clicks: string
  reach: string
  ctr: string
  cpc: string
  actions?: { action_type: string; value: string }[]
  action_values?: { action_type: string; value: string }[]
  campaign_id?: string
  campaign_name?: string
  adset_id?: string
  adset_name?: string
}

// ── Tipos de saída ────────────────────────────────────────────────────────────

export interface TransformedSnapshot {
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
  rawData: MetaInsightRecord
}

export interface TransformedCampaignSnapshot {
  date: Date
  campaignId: string
  campaignName: string
  adSetId: string | null
  adSetName: string | null
  spend: number
  impressions: number
  clicks: number
  reach: number
  ctr: number
  cpc: number
  conversions: number | null
  conversionValue: number | null
  roas: number | null
  cpl: number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Tipos de compra que o Meta pode retornar dependendo do pixel configurado
const PURCHASE_ACTIONS = [
  'purchase',
  'offsite_conversion.fb_pixel_purchase',
  'omni_purchase',
]

// Tipos de conversão genérica (fallback para clientes sem pixel de compra)
const CONVERSION_ACTIONS = [
  'purchase',
  'lead',
  'complete_registration',
  'submit_application',
  'subscribe',
  'offsite_conversion.fb_pixel_purchase',
  'omni_purchase',
]

function findAction(
  actions: { action_type: string; value: string }[] | undefined,
  types: string[]
): number {
  if (!actions) return 0
  return actions
    .filter((a) => types.includes(a.action_type))
    .reduce((sum, a) => sum + parseFloat(a.value || '0'), 0)
}

// ── Transformadores ───────────────────────────────────────────────────────────

export function transformMetaInsight(record: MetaInsightRecord): TransformedSnapshot {
  const spend = parseFloat(record.spend || '0')

  // Compras específicas com fallback para conversões genéricas (lead-gen)
  const purchases = findAction(record.actions, PURCHASE_ACTIONS)
  const conversions = purchases > 0
    ? purchases
    : findAction(record.actions, CONVERSION_ACTIONS) || null

  // Receita de compras
  const conversionValue = findAction(record.action_values, PURCHASE_ACTIONS) || null

  // ROAS: usa campo nativo purchase_roas se disponível, senão calcula
  let roas: number | null = null
  if (record.purchase_roas && record.purchase_roas.length > 0) {
    roas = parseFloat(record.purchase_roas[0].value || '0') || null
  } else if (conversionValue && spend > 0) {
    roas = conversionValue / spend
  }

  // CPL: custo por lead (para clientes de lead-gen)
  const leads = findAction(record.actions, ['lead', 'complete_registration'])
  const cpl = leads > 0 ? spend / leads : null

  return {
    date: new Date(record.date_start + 'T00:00:00Z'),
    spend,
    impressions: parseInt(record.impressions || '0'),
    clicks:      parseInt(record.clicks || '0'),
    reach:       parseInt(record.reach || '0'),
    frequency:   parseFloat(record.frequency || '0'),
    ctr:         parseFloat(record.ctr || '0'),
    cpc:         parseFloat(record.cpc || '0'),
    conversions: conversions ? Math.round(conversions) : null,
    conversionValue,
    roas: roas ? Math.round(roas * 10000) / 10000 : null,
    cpl:  cpl  ? Math.round(cpl  * 100)   / 100   : null,
    rawData: record,
  }
}

export function transformMetaCampaignInsight(record: MetaCampaignInsightRecord): TransformedCampaignSnapshot {
  const spend = parseFloat(record.spend || '0')
  const purchases = findAction(record.actions, PURCHASE_ACTIONS) || null
  const revenue = findAction(record.action_values, PURCHASE_ACTIONS) || null
  const roas = revenue && spend > 0 ? Math.round((revenue / spend) * 10000) / 10000 : null
  const cpl = purchases && spend > 0 ? Math.round((spend / purchases) * 100) / 100 : null

  return {
    date:         new Date(record.date_start + 'T00:00:00Z'),
    campaignId:   record.campaign_id   ?? 'unknown',
    campaignName: record.campaign_name ?? 'Campanha sem nome',
    adSetId:      record.adset_id   ?? null,
    adSetName:    record.adset_name ?? null,
    spend,
    impressions:     parseInt(record.impressions || '0'),
    clicks:          parseInt(record.clicks || '0'),
    reach:           parseInt(record.reach || '0'),
    ctr:             parseFloat(record.ctr || '0'),
    cpc:             parseFloat(record.cpc || '0'),
    conversions:     purchases ? Math.round(purchases) : null,
    conversionValue: revenue,
    roas,
    cpl,
  }
}
