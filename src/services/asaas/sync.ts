import { prisma } from '@/lib/prisma'
import { getAsaasClient } from './client'
import type { AsaasPaymentDTO, AsaasCustomerDTO } from './types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize CPF/CNPJ to digits only for comparison */
function normalizeDoc(doc: string | null | undefined): string {
  return (doc ?? '').replace(/\D/g, '')
}

/**
 * Try to match an Asaas customer to an existing Client by:
 * 1. CNPJ/CPF (document field, digits only)
 * 2. Normalized name (lowercase, trim)
 */
async function findClientMatch(customer: AsaasCustomerDTO): Promise<string | null> {
  const doc = normalizeDoc(customer.cpfCnpj)

  if (doc.length >= 11) {
    const byDoc = await prisma.client.findFirst({
      where: {
        document: { not: null },
      },
      select: { id: true, document: true },
    })
    // Manual filter because document may be formatted in DB
    const allClients = await prisma.client.findMany({
      select: { id: true, document: true, name: true },
    })
    const byDocMatch = allClients.find(c => normalizeDoc(c.document) === doc)
    if (byDocMatch) return byDocMatch.id
  }

  // Fall back to name match
  const byName = await prisma.client.findFirst({
    where: {
      name: { equals: customer.name.trim(), mode: 'insensitive' },
    },
    select: { id: true },
  })
  return byName?.id ?? null
}

// ─── Sync Customers ───────────────────────────────────────────────────────────

async function syncCustomers() {
  const client = await getAsaasClient()
  const customers = await client.getCustomers()

  for (const c of customers) {
    if (c.deleted) continue

    const clientId = await findClientMatch(c)

    await prisma.asaasCustomer.upsert({
      where: { asaasId: c.id },
      update: {
        name: c.name,
        email: c.email ?? null,
        cpfCnpj: normalizeDoc(c.cpfCnpj) || null,
        phone: c.mobilePhone ?? c.phone ?? null,
        clientId: clientId,
        syncedAt: new Date(),
        updatedAt: new Date(),
      },
      create: {
        asaasId: c.id,
        name: c.name,
        email: c.email ?? null,
        cpfCnpj: normalizeDoc(c.cpfCnpj) || null,
        phone: c.mobilePhone ?? c.phone ?? null,
        clientId: clientId,
      },
    })
  }

  return customers.length
}

// ─── Sync Payments ────────────────────────────────────────────────────────────

function mapPaymentStatus(status: string) {
  const map: Record<string, string> = {
    PENDING: 'PENDING',
    RECEIVED: 'RECEIVED',
    CONFIRMED: 'CONFIRMED',
    OVERDUE: 'OVERDUE',
    REFUNDED: 'REFUNDED',
    REFUND_REQUESTED: 'REFUND_REQUESTED',
    CHARGEBACK_REQUESTED: 'CHARGEBACK_REQUESTED',
    AWAITING_RISK_ANALYSIS: 'AWAITING_RISK_ANALYSIS',
  }
  return (map[status] ?? 'PENDING') as 'PENDING' | 'RECEIVED' | 'CONFIRMED' | 'OVERDUE' | 'REFUNDED' | 'REFUND_REQUESTED' | 'CHARGEBACK_REQUESTED' | 'AWAITING_RISK_ANALYSIS'
}

function mapBillingType(bt: string) {
  const valid = ['BOLETO', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'TRANSFER', 'DEPOSIT']
  return (valid.includes(bt) ? bt : 'UNDEFINED') as 'BOLETO' | 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'TRANSFER' | 'DEPOSIT' | 'UNDEFINED'
}

async function syncPayments() {
  const client = await getAsaasClient()
  // Fetch last 365 days of payments (full history on first run; subsequent runs are fast due to upsert)
  const yearAgo = new Date()
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  const dueDateGte = yearAgo.toISOString().split('T')[0]

  const payments = await client.getPayments({ dueDateGte })

  // Build customerId map from asaasId
  const customerMap = new Map<string, string>()
  const allCustomers = await prisma.asaasCustomer.findMany({ select: { id: true, asaasId: true } })
  allCustomers.forEach(c => customerMap.set(c.asaasId, c.id))

  for (const p of payments) {
    if (p.deleted) continue
    const customerId = customerMap.get(p.customer) ?? null

    await prisma.asaasPayment.upsert({
      where: { asaasId: p.id },
      update: {
        status: mapPaymentStatus(p.status),
        billingType: mapBillingType(p.billingType),
        value: p.value,
        netValue: p.netValue ?? null,
        dueDate: new Date(p.dueDate),
        paymentDate: p.paymentDate ? new Date(p.paymentDate) : null,
        description: p.description ?? null,
        invoiceUrl: p.invoiceUrl ?? null,
        customerId,
        syncedAt: new Date(),
        updatedAt: new Date(),
      },
      create: {
        asaasId: p.id,
        status: mapPaymentStatus(p.status),
        billingType: mapBillingType(p.billingType),
        value: p.value,
        netValue: p.netValue ?? null,
        dueDate: new Date(p.dueDate),
        paymentDate: p.paymentDate ? new Date(p.paymentDate) : null,
        description: p.description ?? null,
        invoiceUrl: p.invoiceUrl ?? null,
        customerId,
      },
    })
  }

  return payments.length
}

// ─── Sync Subscriptions ───────────────────────────────────────────────────────

async function syncSubscriptions() {
  const client = await getAsaasClient()
  const subs = await client.getSubscriptions()

  const customerMap = new Map<string, string>()
  const allCustomers = await prisma.asaasCustomer.findMany({ select: { id: true, asaasId: true } })
  allCustomers.forEach(c => customerMap.set(c.asaasId, c.id))

  for (const s of subs) {
    if (s.deleted) continue
    const customerId = customerMap.get(s.customer) ?? null

    await prisma.asaasSubscription.upsert({
      where: { asaasId: s.id },
      update: {
        status: s.status,
        cycle: s.cycle,
        value: s.value,
        nextDueDate: s.nextDueDate ? new Date(s.nextDueDate) : null,
        description: s.description ?? null,
        customerId,
        syncedAt: new Date(),
        updatedAt: new Date(),
      },
      create: {
        asaasId: s.id,
        status: s.status,
        cycle: s.cycle,
        value: s.value,
        nextDueDate: s.nextDueDate ? new Date(s.nextDueDate) : null,
        description: s.description ?? null,
        customerId,
      },
    })
  }

  return subs.length
}

// ─── Sync Transfers ───────────────────────────────────────────────────────────

async function syncTransfers() {
  const client = await getAsaasClient()
  const yearAgo = new Date()
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  const dateGte = yearAgo.toISOString().split('T')[0]

  const transfers = await client.getTransfers({ dateGte })

  for (const t of transfers) {
    await prisma.asaasTransfer.upsert({
      where: { asaasId: t.id },
      update: {
        status: t.status,
        value: t.value,
        netValue: t.netValue ?? null,
        transferDate: new Date(t.transferDate),
        scheduleDate: t.scheduleDate ? new Date(t.scheduleDate) : null,
        description: t.description ?? null,
        operationType: t.operationType ?? null,
        syncedAt: new Date(),
        updatedAt: new Date(),
      },
      create: {
        asaasId: t.id,
        status: t.status,
        value: t.value,
        netValue: t.netValue ?? null,
        transferDate: new Date(t.transferDate),
        scheduleDate: t.scheduleDate ? new Date(t.scheduleDate) : null,
        description: t.description ?? null,
        operationType: t.operationType ?? null,
      },
    })
  }

  return transfers.length
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function syncAsaasData(): Promise<{
  customers: number
  payments: number
  subscriptions: number
  transfers: number
  errors: string[]
}> {
  const errors: string[] = []

  // Customers first so payments/subs can reference them
  let customers = 0
  try { customers = await syncCustomers() }
  catch (e) { errors.push(`customers: ${e instanceof Error ? e.message : String(e)}`) }

  const [paymentsResult, subscriptionsResult, transfersResult] = await Promise.allSettled([
    syncPayments(),
    syncSubscriptions(),
    syncTransfers(),
  ])

  const payments      = paymentsResult.status      === 'fulfilled' ? paymentsResult.value      : (errors.push(`payments: ${(paymentsResult.reason as Error)?.message ?? paymentsResult.reason}`), 0)
  const subscriptions = subscriptionsResult.status === 'fulfilled' ? subscriptionsResult.value : (errors.push(`subscriptions: ${(subscriptionsResult.reason as Error)?.message ?? subscriptionsResult.reason}`), 0)
  const transfers     = transfersResult.status     === 'fulfilled' ? transfersResult.value     : (errors.push(`transfers: ${(transfersResult.reason as Error)?.message ?? transfersResult.reason}`), 0)

  if (errors.length > 0 && customers === 0 && payments === 0) {
    throw new Error(errors.join(' | '))
  }

  return { customers, payments, subscriptions, transfers, errors }
}

/** Called by Asaas webhook: update a single payment status in real-time */
export async function handlePaymentWebhook(payload: {
  event: string
  payment: AsaasPaymentDTO
}) {
  const { payment } = payload

  const customerRow = payment.customer
    ? await prisma.asaasCustomer.findUnique({ where: { asaasId: payment.customer }, select: { id: true } })
    : null

  await prisma.asaasPayment.upsert({
    where: { asaasId: payment.id },
    update: {
      status: mapPaymentStatus(payment.status),
      paymentDate: payment.paymentDate ? new Date(payment.paymentDate) : null,
      netValue: payment.netValue ?? null,
      customerId: customerRow?.id ?? null,
      syncedAt: new Date(),
      updatedAt: new Date(),
    },
    create: {
      asaasId: payment.id,
      status: mapPaymentStatus(payment.status),
      billingType: mapBillingType(payment.billingType),
      value: payment.value,
      netValue: payment.netValue ?? null,
      dueDate: new Date(payment.dueDate),
      paymentDate: payment.paymentDate ? new Date(payment.paymentDate) : null,
      description: payment.description ?? null,
      invoiceUrl: payment.invoiceUrl ?? null,
      customerId: customerRow?.id ?? null,
    },
  })
}
