import { prisma } from '@/lib/prisma'
import { getAsaasClient } from './client'
import type { AsaasPaymentDTO, AsaasCustomerDTO } from './types'
import type { ExpenseCategory } from '@prisma/client'

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
  // 6 months back: enough for DRE and avoids timeout on large accounts
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const dueDateGte = sixMonthsAgo.toISOString().split('T')[0]

  const payments = await client.getPayments({ dueDateGte })

  // Build customerId map from asaasId
  const customerMap = new Map<string, string>()
  const allCustomers = await prisma.asaasCustomer.findMany({ select: { id: true, asaasId: true } })
  allCustomers.forEach(c => customerMap.set(c.asaasId, c.id))

  const active = payments.filter(p => !p.deleted)
  await Promise.all(active.map(p => {
    const customerId = customerMap.get(p.customer) ?? null
    const data = {
      status:      mapPaymentStatus(p.status),
      billingType: mapBillingType(p.billingType),
      value:       p.value,
      netValue:    p.netValue ?? null,
      dueDate:     new Date(p.dueDate),
      paymentDate: p.paymentDate ? new Date(p.paymentDate) : null,
      description: p.description ?? null,
      invoiceUrl:  p.invoiceUrl ?? null,
      customerId,
    }
    return prisma.asaasPayment.upsert({
      where:  { asaasId: p.id },
      update: { ...data, syncedAt: new Date(), updatedAt: new Date() },
      create: { asaasId: p.id, ...data },
    })
  }))

  return active.length
}

// ─── Sync Subscriptions ───────────────────────────────────────────────────────

async function syncSubscriptions() {
  const client = await getAsaasClient()
  const subs = await client.getSubscriptions()

  const customerMap = new Map<string, string>()
  const allCustomers = await prisma.asaasCustomer.findMany({ select: { id: true, asaasId: true } })
  allCustomers.forEach(c => customerMap.set(c.asaasId, c.id))

  const active = subs.filter(s => !s.deleted)
  await Promise.all(active.map(s => {
    const customerId = customerMap.get(s.customer) ?? null
    const data = {
      status:      s.status,
      cycle:       s.cycle,
      value:       s.value,
      nextDueDate: s.nextDueDate ? new Date(s.nextDueDate) : null,
      description: s.description ?? null,
      customerId,
    }
    return prisma.asaasSubscription.upsert({
      where:  { asaasId: s.id },
      update: { ...data, syncedAt: new Date(), updatedAt: new Date() },
      create: { asaasId: s.id, ...data },
    })
  }))

  return active.length
}

// ─── Sync Transfers ───────────────────────────────────────────────────────────

async function syncTransfers() {
  const client = await getAsaasClient()
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const dateGte = sixMonthsAgo.toISOString().split('T')[0]

  const transfers = await client.getTransfers({ dateGte })

  await Promise.all(transfers.map(t => {
    const data = {
      status:        t.status,
      value:         t.value,
      netValue:      t.netValue ?? null,
      transferDate:  new Date(t.transferDate),
      scheduleDate:  t.scheduleDate ? new Date(t.scheduleDate) : null,
      description:   t.description ?? null,
      operationType: t.operationType ?? null,
    }
    return prisma.asaasTransfer.upsert({
      where:  { asaasId: t.id },
      update: { ...data, syncedAt: new Date(), updatedAt: new Date() },
      create: { asaasId: t.id, ...data },
    })
  }))

  return transfers.length
}

// ─── Sync Financial Transactions (extrato de débitos) ─────────────────────────

function detectCategory(description: string | null): ExpenseCategory {
  const d = (description ?? '').toLowerCase()
  if (/salario|funcionario|colaborador|pessoal|folha|trabalhista|rescisao|pro.?labore/.test(d)) return 'SALARIOS'
  if (/imposto|inss|fgts|iss|cofins|pis|csll|irpj|irpf|tributo|dasn|simples|darf/.test(d))    return 'IMPOSTOS'
  if (/asaas|taxa|tarifa|mensalidade|plano|saas|licenca|subscricao|software/.test(d))           return 'FERRAMENTAS'
  if (/google|meta|facebook|instagram|tiktok|anuncio|ads|midia|campanha|marketing/.test(d))     return 'MARKETING'
  if (/contador|contabilidade|juridico|advogado|compliance|auditoria/.test(d))                  return 'CONTABILIDADE'
  if (/aluguel|escritorio|condominio|energia|luz|agua|internet|telefone|coworking/.test(d))     return 'ESCRITORIO'
  return 'OUTROS'
}

async function syncFinancialTransactions() {
  const client = await getAsaasClient()
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const startDate = sixMonthsAgo.toISOString().split('T')[0]

  const transactions = await client.getFinancialTransactions({ startDate, type: 'DEBIT' })
  const completed = transactions.filter(t =>
    t.status === 'COMPLETED' || t.status === 'DONE',
  )

  await Promise.all(completed.map(t => {
    const data = {
      description: t.description?.trim() || 'Débito Asaas',
      category:    detectCategory(t.description),
      value:       Math.abs(t.value),
      date:        new Date(t.date),
      recurring:   false,
      source:      'ASAAS',
    }
    return prisma.expense.upsert({
      where:  { externalId: t.id },
      update: { ...data, updatedAt: new Date() },
      create: { ...data, externalId: t.id },
    })
  }))

  return completed.length
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function syncAsaasData(): Promise<{
  customers: number
  payments: number
  subscriptions: number
  transfers: number
  financialTransactions: number
  errors: string[]
}> {
  const errors: string[] = []

  // Customers first so payments/subs can reference them
  let customers = 0
  try { customers = await syncCustomers() }
  catch (e) { errors.push(`customers: ${e instanceof Error ? e.message : String(e)}`) }

  const [paymentsResult, subscriptionsResult, transfersResult, financialResult] = await Promise.allSettled([
    syncPayments(),
    syncSubscriptions(),
    syncTransfers(),
    syncFinancialTransactions(),
  ])

  const payments              = paymentsResult.status     === 'fulfilled' ? paymentsResult.value     : (errors.push(`payments: ${(paymentsResult.reason as Error)?.message ?? paymentsResult.reason}`), 0)
  const subscriptions         = subscriptionsResult.status === 'fulfilled' ? subscriptionsResult.value : (errors.push(`subscriptions: ${(subscriptionsResult.reason as Error)?.message ?? subscriptionsResult.reason}`), 0)
  const transfers             = transfersResult.status    === 'fulfilled' ? transfersResult.value    : (errors.push(`transfers: ${(transfersResult.reason as Error)?.message ?? transfersResult.reason}`), 0)
  const financialTransactions = financialResult.status    === 'fulfilled' ? financialResult.value    : (errors.push(`extrato: ${(financialResult.reason as Error)?.message ?? financialResult.reason}`), 0)

  if (errors.length > 0 && customers === 0 && payments === 0) {
    throw new Error(errors.join(' | '))
  }

  return { customers, payments, subscriptions, transfers, financialTransactions, errors }
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
