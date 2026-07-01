import { NextRequest, NextResponse } from 'next/server'
import { handlePaymentWebhook } from '@/services/asaas/sync'
import type { AsaasPaymentDTO } from '@/services/asaas/types'

/**
 * POST /api/asaas/webhook
 * Receives real-time events from Asaas (payment status changes).
 * Configure this URL in Asaas: Configurações → Notificações → URL de notificação
 *
 * Auth: ASAAS_WEBHOOK_TOKEN obrigatório (fail-closed) — o Asaas envia o mesmo
 * token no header `asaas-access-token` (configurado no painel do Asaas).
 * Events handled: PAYMENT_RECEIVED, PAYMENT_CONFIRMED, PAYMENT_OVERDUE, PAYMENT_REFUNDED
 */
export async function POST(request: NextRequest) {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN

  // Fail-closed: sem token configurado, não aceita nada (evita webhook forjado
  // de "pagamento recebido" caso a env não esteja setada).
  if (!expectedToken) {
    console.error('[Asaas Webhook] ASAAS_WEBHOOK_TOKEN não configurado — rejeitando (fail-closed)')
    return NextResponse.json({ error: 'Webhook não configurado' }, { status: 503 })
  }

  const token = request.headers.get('asaas-access-token')
  if (token !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  // Evento não tratado (ou sem payload): ignoramos de propósito → 200 para o
  // Asaas parar de reenviar. Isso é "ignorado com sucesso", não uma falha.
  if (!paymentEvents.includes(body.event) || !body.payment) {
    return NextResponse.json({ received: true, ignored: true })
  }

  try {
    await handlePaymentWebhook({ event: body.event, payment: body.payment })
  } catch (err) {
    // Falha REAL de processamento/persistência: 500 para o Asaas reentregar.
    // Nunca engolir com 200 — isso mascararia perda de dado financeiro.
    console.error('[Asaas Webhook] Error processing payment:', err)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
