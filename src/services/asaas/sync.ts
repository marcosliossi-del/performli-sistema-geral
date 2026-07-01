import { prisma } from '@/lib/prisma'
import { getAsaasClient } from './client'
import type { AsaasPaymentDTO } from './types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeDoc(doc: string | null | undefined): string {
  return (doc ?? '').replace(/\D/g, '')
}

// ─── Sync Customers ───────────────────────────────────────────────────────────

async function syncCustomers() {
  const asaas = await getAsaasClient()
  const customers = await asaas.getCustomers()
  const active = customers.filter(c => !c.deleted)

  // Load all agency clients ONCE and match in memory — avoids 2-3 DB queries per customer
  const allClients = await prisma.client.findMany({
    select: { id: true, document: true, name: true },
  })

  function matchClient(asaasId: string | null, name: string): string | null {
    const doc = normalizeDoc(asaasId)
    if (doc.length >= 11) {
      const byDoc = allClients.find(c => normalizeDoc(c.document) === doc)
      if (byDoc) return byDoc.id
    }
    const lower = name.toLowerCase().trim()
    return allClients.find(c => c.name.toLowerCase().trim() === lower)?.id ?? null
  }

  await Promise.all(active.map(c => {
    const clientId = matchClient(c.cpfCnpj, c.name)
    const data = {
      name:     c.name,
      email:    c.email ?? null,
      cpfCnpj:  normalizeDoc(c.cpfCnpj) || null,
      phone:    c.mobilePhone ?? c.phone ?? null,
      clientId,
    }
    return prisma.asaasCustomer.upsert({
      where:  { asaasId: c.id },
      update: { ...data, syncedAt: new Date(), updatedAt: new Date() },
      create: { asaasId: c.id, ...data },
    })
  }))

  return active.length
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

// ─── Sync Expenses (saídas) a partir do extrato do Asaas ───────────────────────
// Assim como as entradas vêm de /payments, as saídas vêm dos DÉBITOS do extrato
// financeiro (pagamentos/PIX que saem da conta). Cada débito vira um Expense com
// source=ASAAS, idempotente por externalId. Categoria default OUTROS — o usuário
// pode recategorizar (não sobrescrevemos a categoria em re-syncs).

async function syncExpensesFromAsaas() {
  const client = await getAsaasClient()
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const startDate = sixMonthsAgo.toISOString().split('T')[0]

  const debits = await client.getFinancialTransactions({ startDate, type: 'DEBIT' })

  let count = 0
  await Promise.all(debits.map(async (t) => {
    const value = Math.abs(Number(t.value))
    if (!(value > 0)) return
    await prisma.expense.upsert({
      where:  { externalId: t.id },
      update: {
        // Não sobrescreve a categoria (usuário pode ter recategorizado)
        value,
        date:        new Date(t.date),
        description: t.description ?? 'Saída Asaas',
        updatedAt:   new Date(),
      },
      create: {
        description: t.description ?? 'Saída Asaas',
        category:    'OUTROS',
        value,
        date:        new Date(t.date),
        source:      'ASAAS',
        externalId:  t.id,
      },
    })
    count++
  }))

  return count
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function syncAsaasData(): Promise<{
  customers: number
  payments: number
  subscriptions: number
  transfers: number
  expenses: number
  errors: string[]
}> {
  const errors: string[] = []

  // Customers first so payments/subs can reference them
  let customers = 0
  try { customers = await syncCustomers() }
  catch (e) { errors.push(`customers: ${e instanceof Error ? e.message : String(e)}`) }

  const [paymentsResult, subscriptionsResult, transfersResult, expensesResult] = await Promise.allSettled([
    syncPayments(),
    syncSubscriptions(),
    syncTransfers(),
    syncExpensesFromAsaas(),
  ])

  const payments      = paymentsResult.status      === 'fulfilled' ? paymentsResult.value      : (errors.push(`payments: ${(paymentsResult.reason as Error)?.message ?? paymentsResult.reason}`), 0)
  const subscriptions = subscriptionsResult.status === 'fulfilled' ? subscriptionsResult.value : (errors.push(`subscriptions: ${(subscriptionsResult.reason as Error)?.message ?? subscriptionsResult.reason}`), 0)
  const transfers     = transfersResult.status     === 'fulfilled' ? transfersResult.value     : (errors.push(`transfers: ${(transfersResult.reason as Error)?.message ?? transfersResult.reason}`), 0)
  const expenses      = expensesResult.status      === 'fulfilled' ? expensesResult.value      : (errors.push(`expenses: ${(expensesResult.reason as Error)?.message ?? expensesResult.reason}`), 0)

  if (errors.length > 0 && customers === 0 && payments === 0) {
    throw new Error(errors.join(' | '))
  }

  return { customers, payments, subscriptions, transfers, expenses, errors }
}

/**
 * Rank de progressão do status de pagamento. Usado como guarda de ordenação:
 * um evento atrasado/fora de ordem NÃO pode regredir o status para um rank menor.
 * Ex.: um PAYMENT_OVERDUE reentregue não pode reverter um pagamento já RECEIVED.
 * Estados de estorno/chargeback têm rank alto por serem transições legítimas a
 * partir de estados pagos.
 */
const PAYMENT_STATUS_RANK: Record<string, number> = {
  OVERDUE: 0,
  PENDING: 1,
  AWAITING_RISK_ANALYSIS: 2,
  RECEIVED: 3,
  CONFIRMED: 3,
  REFUND_REQUESTED: 4,
  CHARGEBACK_REQUESTED: 4,
  REFUNDED: 5,
}

function statusRank(status: string): number {
  return PAYMENT_STATUS_RANK[status] ?? 1
}

/** Called by Asaas webhook: update a single payment status in real-time */
export async function handlePaymentWebhook(payload: {
  event: string
  payment: AsaasPaymentDTO
}) {
  const { payment } = payload
  const newStatus = mapPaymentStatus(payment.status)

  const customerRow = payment.customer
    ? await prisma.asaasCustomer.findUnique({ where: { asaasId: payment.customer }, select: { id: true } })
    : null

  // Guarda de ordenação/idempotência: se a fatura já existe e o novo status
  // representa um estado ANTERIOR ao atual (evento fora de ordem/reentregue),
  // não regredimos o status — apenas atualizamos campos não-regressivos.
  const existing = await prisma.asaasPayment.findUnique({
    where: { asaasId: payment.id },
    select: { status: true },
  })

  const wouldRegress = !!existing && statusRank(newStatus) < statusRank(existing.status)
  if (wouldRegress) {
    console.warn(
      `[Asaas Webhook] Evento fora de ordem ignorado p/ pagamento ${payment.id}: ` +
      `${newStatus} não pode regredir ${existing!.status}`,
    )
  }

  await prisma.asaasPayment.upsert({
    where: { asaasId: payment.id },
    update: {
      // Só atualiza status se NÃO for regressão de estado terminal/mais novo.
      ...(wouldRegress ? {} : { status: newStatus }),
      paymentDate: payment.paymentDate ? new Date(payment.paymentDate) : null,
      netValue: payment.netValue ?? null,
      customerId: customerRow?.id ?? null,
      syncedAt: new Date(),
      updatedAt: new Date(),
    },
    create: {
      asaasId: payment.id,
      status: newStatus,
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
