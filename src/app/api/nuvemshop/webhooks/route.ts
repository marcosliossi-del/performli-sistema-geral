import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { transformNuvemshopOrder } from '@/services/nuvemshop/transformers'
import type { NuvemshopRawOrder } from '@/services/nuvemshop/client'
import { createHmac } from 'crypto'

/**
 * POST /api/nuvemshop/webhooks
 *
 * Recebe webhooks da Nuvemshop para atualizações em tempo real.
 * Eventos suportados:
 *   - order/created  — novo pedido
 *   - order/updated  — pedido atualizado
 *   - order/paid     — pedido pago
 *   - order/cancelled — pedido cancelado
 *
 * A Nuvemshop envia um HMAC no header para verificação.
 */
export async function POST(request: NextRequest) {
  const body = await request.text()

  // Fail-closed: exige NUVEMSHOP_APP_SECRET + HMAC válido. Sem secret configurado,
  // não aceita nada (evita webhook forjado de pedido/pagamento).
  const appSecret = process.env.NUVEMSHOP_APP_SECRET
  if (!appSecret) {
    console.error('[Nuvemshop Webhook] NUVEMSHOP_APP_SECRET não configurado — rejeitando (fail-closed)')
    return NextResponse.json({ error: 'Webhook não configurado' }, { status: 503 })
  }
  const hmacHeader = request.headers.get('x-linkedstore-hmac-sha256')
  const computed = createHmac('sha256', appSecret).update(body).digest('base64')
  if (!hmacHeader || computed !== hmacHeader) {
    return NextResponse.json({ error: 'HMAC inválido' }, { status: 401 })
  }

  let payload: { store_id: number; event: string; body?: NuvemshopRawOrder }
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { store_id, event } = payload

  if (!store_id || !event) {
    return NextResponse.json({ error: 'store_id e event são obrigatórios' }, { status: 400 })
  }

  // Busca a loja correspondente
  const store = await prisma.nuvemshopStore.findUnique({
    where: { storeId: String(store_id) },
    include: {
      platformAccount: { select: { id: true, clientId: true, active: true } },
    },
  })

  if (!store || !store.platformAccount.active) {
    // Loja não encontrada ou desativada — aceita silenciosamente
    return NextResponse.json({ ok: true, ignored: true })
  }

  // Se o payload inclui os dados do pedido diretamente, processa
  // Caso contrário, a Nuvemshop pode enviar apenas o ID e precisamos buscar
  if (!payload.body) {
    // Webhook sem dados completos — será processado no próximo sync
    return NextResponse.json({ ok: true, queued: true })
  }

  try {
    const transformed = transformNuvemshopOrder(payload.body)

    await prisma.nuvemshopOrder.upsert({
      where: {
        storeId_nuvemshopOrderId: {
          storeId: store.id,
          nuvemshopOrderId: transformed.nuvemshopOrderId,
        },
      },
      update: {
        status: transformed.status,
        paymentStatus: transformed.paymentStatus,
        fulfillmentStatus: transformed.fulfillmentStatus,
        total: transformed.total,
        subtotal: transformed.subtotal,
        discount: transformed.discount,
        shippingCost: transformed.shippingCost,
        productsCount: transformed.productsCount,
        couponCodes: transformed.couponCodes,
        customerEmail: transformed.customerEmail,
        customerName: transformed.customerName,
        utmSource: transformed.utmSource,
        utmMedium: transformed.utmMedium,
        utmCampaign: transformed.utmCampaign,
        utmContent: transformed.utmContent,
        utmTerm: transformed.utmTerm,
        landingUrl: transformed.landingUrl,
        referralUrl: transformed.referralUrl,
        storefront: transformed.storefront,
        closedAt: transformed.closedAt,
        cancelledAt: transformed.cancelledAt,
        paidAt: transformed.paidAt,
        rawData: transformed.rawData as object,
        syncedAt: new Date(),
      },
      create: {
        storeId: store.id,
        nuvemshopOrderId: transformed.nuvemshopOrderId,
        orderNumber: transformed.orderNumber,
        status: transformed.status,
        paymentStatus: transformed.paymentStatus,
        fulfillmentStatus: transformed.fulfillmentStatus,
        currency: transformed.currency,
        total: transformed.total,
        subtotal: transformed.subtotal,
        discount: transformed.discount,
        shippingCost: transformed.shippingCost,
        productsCount: transformed.productsCount,
        couponCodes: transformed.couponCodes,
        customerEmail: transformed.customerEmail,
        customerName: transformed.customerName,
        utmSource: transformed.utmSource,
        utmMedium: transformed.utmMedium,
        utmCampaign: transformed.utmCampaign,
        utmContent: transformed.utmContent,
        utmTerm: transformed.utmTerm,
        landingUrl: transformed.landingUrl,
        referralUrl: transformed.referralUrl,
        storefront: transformed.storefront,
        closedAt: transformed.closedAt,
        cancelledAt: transformed.cancelledAt,
        paidAt: transformed.paidAt,
        orderCreatedAt: transformed.orderCreatedAt,
        rawData: transformed.rawData as object,
      },
    })

    // Atualiza MetricSnapshot para o dia do pedido (se pago)
    if (transformed.paymentStatus === 'PAID') {
      const dateKey = transformed.orderCreatedAt.toISOString().split('T')[0]
      const date = new Date(dateKey + 'T00:00:00Z')

      // Recalcula métricas do dia baseado em todos os pedidos pagos do dia
      const dayOrders = await prisma.nuvemshopOrder.findMany({
        where: {
          storeId: store.id,
          paymentStatus: 'PAID',
          orderCreatedAt: {
            gte: date,
            lt: new Date(date.getTime() + 86400000),
          },
        },
        select: { total: true, productsCount: true, discount: true, shippingCost: true },
      })

      const revenue = dayOrders.reduce((sum, o) => sum + Number(o.total), 0)
      const orders = dayOrders.length
      const avgTicket = orders > 0 ? revenue / orders : 0

      await prisma.metricSnapshot.upsert({
        where: {
          platformAccountId_date: {
            platformAccountId: store.platformAccount.id,
            date,
          },
        },
        update: {
          conversions: orders,
          conversionValue: revenue,
          rawData: {
            source: 'nuvemshop',
            orders,
            revenue,
            avgTicket,
            productsCount: dayOrders.reduce((s, o) => s + o.productsCount, 0),
            discount: dayOrders.reduce((s, o) => s + Number(o.discount), 0),
            shipping: dayOrders.reduce((s, o) => s + Number(o.shippingCost), 0),
          },
          syncedAt: new Date(),
        },
        create: {
          clientId: store.platformAccount.clientId,
          platformAccountId: store.platformAccount.id,
          date,
          conversions: orders,
          conversionValue: revenue,
          rawData: {
            source: 'nuvemshop',
            orders,
            revenue,
            avgTicket,
          },
        },
      })
    }

    return NextResponse.json({ ok: true, event, orderId: transformed.nuvemshopOrderId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`Nuvemshop webhook error (${event}):`, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
