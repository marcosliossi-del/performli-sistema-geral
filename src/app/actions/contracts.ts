'use server'

import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { ContractStatus, ContractType } from '@prisma/client'
import { revalidatePath } from 'next/cache'

export type ContractFormState = { error?: string; ok?: boolean }

function parseDate(raw: string | null): Date | null {
  if (!raw) return null
  const d = new Date(raw + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

export async function createContract(
  prevState: ContractFormState,
  formData: FormData,
): Promise<ContractFormState> {
  const session = await requireSession()
  if (session.role !== 'ADMIN') return { error: 'Apenas o admin pode gerenciar contratos.' }

  const clientId      = (formData.get('clientId')      as string)?.trim()
  const responsibleId = (formData.get('responsibleId') as string)?.trim() || null
  const type          = (formData.get('type')          as ContractType) || 'FEE_MENSAL'
  const status        = (formData.get('status')        as ContractStatus) || 'RASCUNHO'
  const feeValueRaw   = (formData.get('feeValue')      as string)?.trim()
  const setupFeeRaw   = (formData.get('setupFee')      as string)?.trim()
  const startDateRaw  = (formData.get('startDate')     as string)?.trim()
  const endDateRaw    = (formData.get('endDate')       as string)?.trim()
  const noticeDays    = parseInt((formData.get('noticeDays') as string) || '30', 10)
  const autoRenew     = formData.get('autoRenew') === 'true'
  const documentUrl   = (formData.get('documentUrl')   as string)?.trim() || null
  const notes         = (formData.get('notes')         as string)?.trim() || null
  const signedAtRaw   = (formData.get('signedAt')      as string)?.trim()

  if (!clientId)        return { error: 'Cliente é obrigatório.' }
  if (!feeValueRaw)     return { error: 'Valor do contrato é obrigatório.' }
  if (!startDateRaw)    return { error: 'Data de início é obrigatória.' }
  if (!endDateRaw)      return { error: 'Data de vencimento é obrigatória.' }

  const feeValue  = parseFloat(feeValueRaw)
  const setupFee  = setupFeeRaw ? parseFloat(setupFeeRaw) : null
  const startDate = parseDate(startDateRaw)
  const endDate   = parseDate(endDateRaw)
  const signedAt  = signedAtRaw ? parseDate(signedAtRaw) : null

  if (!startDate || !endDate) return { error: 'Datas inválidas.' }
  if (endDate <= startDate)   return { error: 'Data de vencimento deve ser após a data de início.' }

  await prisma.contract.create({
    data: {
      clientId,
      responsibleId,
      type,
      status,
      feeValue,
      setupFee,
      startDate,
      endDate,
      noticeDays,
      autoRenew,
      documentUrl,
      notes,
      signedAt,
    },
  })

  if (feeValue > 0) {
    await prisma.client.update({
      where: { id: clientId },
      data:  { contractValue: feeValue },
    })
  }

  revalidatePath('/juridico')
  revalidatePath('/clients')
  return { ok: true }
}

export async function updateContract(
  prevState: ContractFormState,
  formData: FormData,
): Promise<ContractFormState> {
  const session = await requireSession()
  if (session.role !== 'ADMIN') return { error: 'Apenas o admin pode gerenciar contratos.' }

  const id            = (formData.get('id')            as string)?.trim()
  const responsibleId = (formData.get('responsibleId') as string)?.trim() || null
  const type          = (formData.get('type')          as ContractType)
  const status        = (formData.get('status')        as ContractStatus)
  const feeValueRaw   = (formData.get('feeValue')      as string)?.trim()
  const setupFeeRaw   = (formData.get('setupFee')      as string)?.trim()
  const startDateRaw  = (formData.get('startDate')     as string)?.trim()
  const endDateRaw    = (formData.get('endDate')       as string)?.trim()
  const noticeDays    = parseInt((formData.get('noticeDays') as string) || '30', 10)
  const autoRenew     = formData.get('autoRenew') === 'true'
  const documentUrl   = (formData.get('documentUrl')   as string)?.trim() || null
  const notes         = (formData.get('notes')         as string)?.trim() || null
  const signedAtRaw   = (formData.get('signedAt')      as string)?.trim()
  const cancelReason  = (formData.get('cancelReason')  as string)?.trim() || null

  if (!id) return { error: 'ID do contrato inválido.' }

  const startDate = startDateRaw ? parseDate(startDateRaw) : undefined
  const endDate   = endDateRaw   ? parseDate(endDateRaw)   : undefined
  const signedAt  = signedAtRaw  ? parseDate(signedAtRaw)  : undefined

  if (startDateRaw && !startDate) return { error: 'Data de início inválida.' }
  if (endDateRaw && !endDate)     return { error: 'Data de vencimento inválida.' }

  // Validação de datas (espelha a criação): a vigência não pode terminar antes
  // de começar. Como o update é parcial, comparamos os valores EFETIVOS (o que
  // veio no formulário prevalece; o que não veio usa o valor atual do contrato).
  if (startDate || endDate) {
    const current = await prisma.contract.findUnique({
      where: { id },
      select: { startDate: true, endDate: true },
    })
    if (!current) return { error: 'Contrato não encontrado.' }
    const effectiveStart = startDate ?? current.startDate
    const effectiveEnd   = endDate   ?? current.endDate
    if (effectiveEnd <= effectiveStart) {
      return { error: 'Data de vencimento deve ser após a data de início.' }
    }
  }

  const cancelledAt = status === 'CANCELADO' ? new Date() : undefined

  const updated = await prisma.contract.update({
    where:  { id },
    data: {
      responsibleId,
      ...(type        && { type }),
      ...(status      && { status }),
      ...(feeValueRaw && { feeValue: parseFloat(feeValueRaw) }),
      ...(setupFeeRaw !== undefined && { setupFee: setupFeeRaw ? parseFloat(setupFeeRaw) : null }),
      ...(startDate   && { startDate }),
      ...(endDate     && { endDate }),
      noticeDays,
      autoRenew,
      documentUrl,
      notes,
      ...(signedAt !== undefined  && { signedAt }),
      ...(cancelledAt             && { cancelledAt }),
      ...(cancelReason            && { cancelReason }),
    },
    select: { clientId: true },
  })

  if (feeValueRaw) {
    await prisma.client.update({
      where: { id: updated.clientId },
      data:  { contractValue: parseFloat(feeValueRaw) },
    })
  }

  revalidatePath('/juridico')
  revalidatePath('/clients')
  return { ok: true }
}

export async function renewContract(contractId: string): Promise<{ ok: boolean; newId?: string; error?: string }> {
  const session = await requireSession()
  if (session.role !== 'ADMIN') return { ok: false, error: 'Apenas o admin pode renovar contratos.' }

  const original = await prisma.contract.findUnique({ where: { id: contractId } })
  if (!original) return { ok: false, error: 'Contrato não encontrado.' }

  const duration = original.endDate.getTime() - original.startDate.getTime()
  const newStart = new Date(original.endDate.getTime() + 86_400_000) // day after expiry
  const newEnd   = new Date(newStart.getTime() + duration)

  const newContract = await prisma.contract.create({
    data: {
      clientId:          original.clientId,
      responsibleId:     original.responsibleId,
      type:              original.type,
      status:            'RASCUNHO',
      feeValue:          original.feeValue,
      setupFee:          null,
      startDate:         newStart,
      endDate:           newEnd,
      noticeDays:        original.noticeDays,
      autoRenew:         original.autoRenew,
      notes:             original.notes,
      previousContractId: original.id,
    },
  })

  await prisma.contract.update({
    where: { id: contractId },
    data:  { status: 'RENOVACAO' },
  })

  revalidatePath('/juridico')
  revalidatePath('/clients')
  return { ok: true, newId: newContract.id }
}

export async function cancelContract(contractId: string, reason?: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession()
  if (session.role !== 'ADMIN') return { ok: false, error: 'Apenas o admin pode cancelar contratos.' }

  await prisma.contract.update({
    where: { id: contractId },
    data:  {
      status:       'CANCELADO',
      cancelledAt:  new Date(),
      cancelReason: reason || null,
    },
  })

  revalidatePath('/juridico')
  revalidatePath('/clients')
  return { ok: true }
}

export async function fetchAllContracts() {
  const session = await requireSession()
  // Contratos = jurídico/financeiro (fee/valor da agência): SÓ ADMIN (matriz).
  if (session.role !== 'ADMIN') return []

  const contracts = await prisma.contract.findMany({
    include: {
      client:      { select: { id: true, name: true, slug: true, razaoSocial: true } },
      responsible: { select: { id: true, name: true } },
    },
    orderBy: { endDate: 'asc' },
  })
  return contracts.map(c => ({
    ...c,
    feeValue:  Number(c.feeValue),
    setupFee:  c.setupFee ? Number(c.setupFee) : null,
    startDate: c.startDate.toISOString(),
    endDate:   c.endDate.toISOString(),
    signedAt:  c.signedAt   ? c.signedAt.toISOString()   : null,
    cancelledAt: c.cancelledAt ? c.cancelledAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }))
}

export type ContractRow = Awaited<ReturnType<typeof fetchAllContracts>>[number]
