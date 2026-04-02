'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { MetaAdsClient } from '@/services/meta-ads/client'

export interface LinkAccountState {
  error?: string
  success?: boolean
  accountName?: string
}

// ── Meta Ads ──────────────────────────────────────────────────────────────────

/**
 * Valida se uma conta Meta está acessível via Meta Marketing API.
 */
export async function validateMetaAccount(
  adAccountId: string
): Promise<{ valid: boolean; error?: string }> {
  await requireSession()

  try {
    const normalizedId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
    const client = new MetaAdsClient()
    return await client.validateAccount(normalizedId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { valid: false, error: msg }
  }
}

/**
 * Vincula uma conta Meta Ads a um cliente.
 * Auth via Windsor (sem token individual — usa WINDSOR_API_KEY compartilhado).
 */
export async function linkMetaAccount(
  clientId: string,
  adAccountId: string,
  accountName?: string
): Promise<LinkAccountState> {
  const session = await requireSession()

  if (session.role !== 'ADMIN') {
    const assignment = await prisma.clientAssignment.findFirst({
      where: { clientId, userId: session.userId },
    })
    if (!assignment) {
      return { error: 'Você não tem permissão para vincular contas a este cliente.' }
    }
  }

  const externalId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`

  const existing = await prisma.platformAccount.findUnique({
    where: { clientId_platform_externalId: { clientId, platform: 'META_ADS', externalId } },
  })

  if (existing) {
    if (existing.active) {
      return { error: 'Esta conta já está vinculada a este cliente.' }
    }
    await prisma.platformAccount.update({
      where: { id: existing.id },
      data: { active: true, name: accountName ?? existing.name },
    })
    revalidatePath('/clients')
    return { success: true, accountName: accountName ?? existing.name ?? externalId }
  }

  await prisma.platformAccount.create({
    data: { clientId, platform: 'META_ADS', externalId, name: accountName },
  })

  revalidatePath('/clients')
  return { success: true, accountName: accountName ?? externalId }
}

// ── GA4 ───────────────────────────────────────────────────────────────────────

/**
 * Vincula uma propriedade GA4 a um cliente.
 * O externalId é o identificador da propriedade no Windsor
 * (nome da propriedade conforme configurado na conta Windsor).
 */
export async function linkGA4Account(
  clientId: string,
  propertyId: string,
  name?: string
): Promise<LinkAccountState> {
  const session = await requireSession()

  if (session.role !== 'ADMIN') {
    const assignment = await prisma.clientAssignment.findFirst({
      where: { clientId, userId: session.userId },
    })
    if (!assignment) {
      return { error: 'Você não tem permissão para vincular contas a este cliente.' }
    }
  }

  const externalId = propertyId.trim()

  const existing = await prisma.platformAccount.findUnique({
    where: { clientId_platform_externalId: { clientId, platform: 'GA4', externalId } },
  })

  if (existing) {
    if (existing.active) {
      return { error: 'Esta propriedade GA4 já está vinculada a este cliente.' }
    }
    await prisma.platformAccount.update({
      where: { id: existing.id },
      data: { active: true, name: name ?? existing.name },
    })
    revalidatePath('/clients')
    return { success: true, accountName: name ?? existing.name ?? externalId }
  }

  await prisma.platformAccount.create({
    data: {
      clientId,
      platform: 'GA4',
      externalId,
      name: name ?? `GA4 — ${externalId}`,
    },
  })

  revalidatePath('/clients')
  return { success: true, accountName: name ?? `GA4 — ${externalId}` }
}

// ── Google Ads ────────────────────────────────────────────────────────────────

export async function validateGoogleAdsAccount(customerId: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const { GoogleAdsClient } = await import('@/services/google-ads/client')
    const client = new GoogleAdsClient()
    return client.validateCustomer(customerId)
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function linkGoogleAdsAccount(
  clientId: string,
  customerId: string,
  name?: string
): Promise<LinkAccountState> {
  const session = await requireSession()

  if (session.role !== 'ADMIN') {
    const assignment = await prisma.clientAssignment.findFirst({ where: { clientId, userId: session.userId } })
    if (!assignment) return { error: 'Você não tem permissão para vincular contas a este cliente.' }
  }

  const externalId = customerId.replace(/-/g, '').trim()

  const existing = await prisma.platformAccount.findUnique({
    where: { clientId_platform_externalId: { clientId, platform: 'GOOGLE_ADS', externalId } },
  })

  if (existing) {
    if (existing.active) return { error: 'Esta conta Google Ads já está vinculada a este cliente.' }
    await prisma.platformAccount.update({ where: { id: existing.id }, data: { active: true, name: name ?? existing.name } })
    revalidatePath('/clients')
    return { success: true, accountName: name ?? existing.name ?? externalId }
  }

  await prisma.platformAccount.create({
    data: { clientId, platform: 'GOOGLE_ADS', externalId, name: name ?? `Google Ads — ${externalId}` },
  })

  revalidatePath('/clients')
  return { success: true, accountName: name ?? `Google Ads — ${externalId}` }
}

// ── Desvincular ───────────────────────────────────────────────────────────────

export async function unlinkPlatformAccount(platformAccountId: string): Promise<{ error?: string }> {
  const session = await requireSession()

  const account = await prisma.platformAccount.findUnique({
    where: { id: platformAccountId },
    select: { clientId: true },
  })
  if (!account) return { error: 'Conta não encontrada.' }

  if (session.role !== 'ADMIN') {
    const assignment = await prisma.clientAssignment.findFirst({
      where: { clientId: account.clientId, userId: session.userId },
    })
    if (!assignment) return { error: 'Sem permissão.' }
  }

  await prisma.platformAccount.update({
    where: { id: platformAccountId },
    data: { active: false },
  })

  revalidatePath('/clients')
  return {}
}
