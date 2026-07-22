/**
 * Transforma pedidos da Nuvemshop em dados compatíveis com o MetricSnapshot
 * e extrai informações de UTM para cruzamento com GA4.
 *
 * O cruzamento Nuvemshop ↔ GA4 elimina divergência de dados ao:
 *   1. Usar receita REAL da Nuvemshop (não a estimativa do GA4)
 *   2. Manter UTMs para atribuição correta de canais
 *   3. Comparar conversões reais vs reportadas
 */

import type { NuvemshopRawOrder } from './client'

export interface NuvemshopTransformedOrder {
  nuvemshopOrderId: string
  orderNumber: number | null
  status: 'OPEN' | 'CLOSED' | 'CANCELLED'
  paymentStatus: 'PENDING' | 'AUTHORIZED' | 'PAID' | 'VOIDED' | 'REFUNDED' | 'ABANDONED'
  fulfillmentStatus: 'UNPACKED' | 'FULFILLED' | 'UNFULFILLED' | 'PARTIALLY_FULFILLED'
  currency: string
  subtotal: number
  discount: number
  shippingCost: number
  total: number
  productsCount: number
  couponCodes: string[]
  customerEmail: string | null
  customerName: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  utmTerm: string | null
  landingUrl: string | null
  referralUrl: string | null
  storefront: string | null
  closedAt: Date | null
  cancelledAt: Date | null
  paidAt: Date | null
  orderCreatedAt: Date
  rawData: NuvemshopRawOrder
}

/**
 * Extrai parâmetros UTM de uma URL.
 */
function extractUtmParams(url: string | null): {
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  utmTerm: string | null
} {
  if (!url) return { utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null, utmTerm: null }

  try {
    const parsed = new URL(url)
    return {
      utmSource: parsed.searchParams.get('utm_source'),
      utmMedium: parsed.searchParams.get('utm_medium'),
      utmCampaign: parsed.searchParams.get('utm_campaign'),
      utmContent: parsed.searchParams.get('utm_content'),
      utmTerm: parsed.searchParams.get('utm_term'),
    }
  } catch {
    return { utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null, utmTerm: null }
  }
}

const STATUS_MAP: Record<string, NuvemshopTransformedOrder['status']> = {
  open: 'OPEN',
  closed: 'CLOSED',
  cancelled: 'CANCELLED',
}

const PAYMENT_STATUS_MAP: Record<string, NuvemshopTransformedOrder['paymentStatus']> = {
  pending: 'PENDING',
  authorized: 'AUTHORIZED',
  paid: 'PAID',
  voided: 'VOIDED',
  refunded: 'REFUNDED',
  abandoned: 'ABANDONED',
}

const FULFILLMENT_STATUS_MAP: Record<string, NuvemshopTransformedOrder['fulfillmentStatus']> = {
  unpacked: 'UNPACKED',
  fulfilled: 'FULFILLED',
  unfulfilled: 'UNFULFILLED',
  partially_fulfilled: 'PARTIALLY_FULFILLED',
}

export function transformNuvemshopOrder(raw: NuvemshopRawOrder): NuvemshopTransformedOrder {
  const utms = extractUtmParams(raw.landing_url)

  const productsCount = raw.products?.reduce((sum, p) => sum + p.quantity, 0) ?? 0
  const couponCodes = raw.coupon?.map(c => c.code).filter(Boolean) ?? []

  return {
    nuvemshopOrderId: String(raw.id),
    orderNumber: raw.number ?? null,
    status: STATUS_MAP[raw.status] ?? 'OPEN',
    paymentStatus: PAYMENT_STATUS_MAP[raw.payment_status] ?? 'PENDING',
    fulfillmentStatus: FULFILLMENT_STATUS_MAP[raw.shipping_status] ?? 'UNPACKED',
    currency: raw.currency || 'BRL',
    subtotal: parseFloat(raw.subtotal || '0'),
    discount: parseFloat(raw.discount || '0'),
    shippingCost: parseFloat(raw.shipping_cost_customer || '0'),
    total: parseFloat(raw.total || '0'),
    productsCount,
    couponCodes,
    customerEmail: raw.customer?.email ?? null,
    customerName: raw.customer?.name ?? null,
    ...utms,
    landingUrl: raw.landing_url ?? null,
    referralUrl: raw.referral_url ?? null,
    storefront: raw.storefront ?? null,
    closedAt: raw.closed_at ? new Date(raw.closed_at) : null,
    cancelledAt: raw.cancelled_at ? new Date(raw.cancelled_at) : null,
    paidAt: raw.paid_at ? new Date(raw.paid_at) : null,
    orderCreatedAt: new Date(raw.created_at),
    rawData: raw,
  }
}

// ── Agregação diária para MetricSnapshot ─────────────────────────────────────

export interface NuvemshopDailyMetrics {
  date: Date
  revenue: number        // RECEITA BRUTA: soma do total dos pedidos pagos (INCLUI frete)
  netRevenue: number     // RECEITA LÍQUIDA: soma de (total - frete) dos pedidos pagos.
                         // O frete é repasse à transportadora, não receita da loja; o
                         // desconto já está embutido no `total`; cancelados/estornados
                         // ficam de fora (só PAID). Fonte canônica do faturamento líquido.
  orders: number         // quantidade de pedidos pagos
  avgTicket: number      // ticket médio LÍQUIDO (netRevenue ÷ orders)
  productsCount: number  // total de itens vendidos
  discount: number       // total de descontos
  shipping: number       // total de frete
}

/**
 * Agrega pedidos transformados por dia.
 * Considera apenas pedidos PAGOS para métricas de receita.
 */
export function aggregateOrdersByDay(
  orders: NuvemshopTransformedOrder[]
): NuvemshopDailyMetrics[] {
  const dailyMap = new Map<string, NuvemshopDailyMetrics>()

  for (const order of orders) {
    // Só considera pedidos pagos para métricas de receita
    if (order.paymentStatus !== 'PAID') continue

    const dateKey = order.orderCreatedAt.toISOString().split('T')[0]
    // Receita líquida do pedido: valor cobrado menos o frete (repasse).
    const orderNet = order.total - order.shippingCost
    const existing = dailyMap.get(dateKey)

    if (existing) {
      existing.revenue += order.total
      existing.netRevenue += orderNet
      existing.orders += 1
      existing.productsCount += order.productsCount
      existing.discount += order.discount
      existing.shipping += order.shippingCost
      existing.avgTicket = existing.orders > 0 ? existing.netRevenue / existing.orders : 0
    } else {
      dailyMap.set(dateKey, {
        date: new Date(dateKey + 'T00:00:00Z'),
        revenue: order.total,
        netRevenue: orderNet,
        orders: 1,
        avgTicket: orderNet,
        productsCount: order.productsCount,
        discount: order.discount,
        shipping: order.shippingCost,
      })
    }
  }

  return Array.from(dailyMap.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  )
}
