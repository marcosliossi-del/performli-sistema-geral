export interface AsaasListResponse<T> {
  object: 'list'
  hasMore: boolean
  totalCount: number
  limit: number
  offset: number
  data: T[]
}

export interface AsaasCustomerDTO {
  id: string
  name: string
  email: string | null
  cpfCnpj: string | null
  phone: string | null
  mobilePhone: string | null
  address: string | null
  city: string | null
  state: string | null
  deleted: boolean
}

export interface AsaasPaymentDTO {
  id: string
  customer: string          // customer asaasId
  status: string
  billingType: string
  value: number
  netValue: number | null
  dueDate: string           // YYYY-MM-DD
  paymentDate: string | null
  description: string | null
  invoiceUrl: string | null
  deleted: boolean
}

export interface AsaasSubscriptionDTO {
  id: string
  customer: string
  status: string            // ACTIVE | INACTIVE | EXPIRED
  cycle: string             // MONTHLY | WEEKLY | QUARTERLY | YEARLY
  value: number
  nextDueDate: string | null
  description: string | null
  deleted: boolean
}

export interface AsaasTransferDTO {
  id: string
  status: string            // PENDING | BANK_PROCESSING | DONE | CANCELLED | FAILED
  value: number
  netValue: number | null
  transferDate: string      // YYYY-MM-DD
  scheduleDate: string | null
  description: string | null
  operationType: string | null // TEV | TED | PIX
}

export interface AsaasBalanceDTO {
  balance: number
}
