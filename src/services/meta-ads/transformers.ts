/**
 * Transforma um registro de insights da Meta Ads Graph API
 * em um objeto compatível com o modelo MetricSnapshot.
 */

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

const CONVERSION_ACTIONS = [
  'purchase',
  'lead',
  'complete_registration',
  'submit_application',
  'subscribe',
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

function findActionValue(
  actionValues: { action_type: string; value: string }[] | undefined,
  types: string[]
): number {
  return findAction(actionValues, types)
}

export function transformMetaInsight(record: MetaInsightRecord): TransformedSnapshot {
  const conversions = findAction(record.actions, CONVERSION_ACTIONS) || null
  const conversionValue = findActionValue(record.action_values, CONVERSION_ACTIONS) || null

  const spend = parseFloat(record.spend || '0')

  // ROAS: purchase_roas field OR conversionValue / spend
  let roas: number | null = null
  if (record.purchase_roas && record.purchase_roas.length > 0) {
    roas = parseFloat(record.purchase_roas[0].value || '0')
  } else if (conversionValue && spend > 0) {
    roas = conversionValue / spend
  }

  // CPL: cost per lead action
  const leads = findAction(record.actions, ['lead', 'complete_registration'])
  const cpl = leads > 0 ? spend / leads : null

  return {
    date: new Date(record.date_start + 'T00:00:00'),
    spend,
    impressions: parseInt(record.impressions || '0'),
    clicks: parseInt(record.clicks || '0'),
    reach: parseInt(record.reach || '0'),
    frequency: parseFloat(record.frequency || '0'),
    ctr: parseFloat(record.ctr || '0'),
    cpc: parseFloat(record.cpc || '0'),
    conversions: conversions ? Math.round(conversions) : null,
    conversionValue: conversionValue || null,
    roas: roas ? Math.round(roas * 10000) / 10000 : null,
    cpl: cpl ? Math.round(cpl * 100) / 100 : null,
    rawData: record,
  }
}
