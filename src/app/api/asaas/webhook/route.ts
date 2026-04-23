import { NextRequest, NextResponse } from 'next/server'
import { handlePaymentWebhook } from '@/services/asaas/sync'
import type { AsaasPaymentDTO } from '@/services/asaas/types'

/**
 * POST /api/asaas/webhook
 * Receives real-time events from Asaas (payment status changes).
 * Configure this URL in Asaas: Configurações → Notificações → URL de notificação
 *
 * Auth: optional ASAAS_WEBHOOK_TOKEN header verification.
 * Events handled: PAYMENT_RECEIVED, PAYMENT_CONFIRMED, PAYMENT_OVERDUE, PAYMENT_REFUNDED
 */
export async function POST(request: NextRequest) {
  // Validate webhook token if configured
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN
  if (expectedToken) {
    const token = request.headers.get('asaas-access-token')
    if (token !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let body: { event: string; payment?: AsaasPaymentDTO }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const paymentEvents = [
    'PAYMENT_RECEIVED',
    'PAYMENT_CONFIRMED',
    'PAYMENT_OVERDUE',
    'PAYMENT_REFUNDED',
    'PAYMENT_REFUND_REQUESTED',
    'PAYMENT_CHARGEBACK_REQUESTED',
    'PAYMENT_UPDATED',
    'PAYMENT_CREATED',
  ]

  if (paymentEvents.includes(body.event) && body.payment) {
    try {
      await handlePaymentWebhook({ event: body.event, payment: body.payment })
    } catch (err) {
      console.error('[Asaas Webhook] Error processing payment:', err)
      // Return 200 to prevent Asaas from retrying on internal errors
    }
  }

  return NextResponse.json({ received: true })
}
