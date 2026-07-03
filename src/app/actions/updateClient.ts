'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { assertClientMutationAccess, writeAuditLog } from '@/lib/audit'
import { slugify } from '@/lib/utils'
import { uniqueClientSlug } from '@/lib/clients/slug'
import { BusinessType, ProductChangeAction } from '@prisma/client'
import { investimentoTotal, roasEsperado } from '@/lib/metas/projection'
import { onProductsDowngraded } from '@/services/product-downgrade-automation'

export type UpdateClientState = { error?: string; success?: boolean; slug?: string }

/** Converte um Decimal? do Prisma em number|null preservando o "não informado". */
function num(v: { toString(): string } | null | undefined): number | null {
  if (v == null) return null
  const n = Number(v.toString())
  return Number.isFinite(n) ? n : null
}

export async function updateClient(
  clientId: string,
  data: {
    name?: string
    razaoSocial?: string | null
    industry?: string | null
    website?: string | null
    notes?: string | null
    email?: string | null
    phone?: string | null
    document?: string | null
    contractValue?: number | null
    contractStart?: Date | null
    source?: string | null
    businessType?: BusinessType | null
    // Budget de mídia por canal (R$). O investimento total NÃO é aceito aqui:
    // é derivado da soma dos três canais.
    investimentoMeta?: number | null
    investimentoGoogle?: number | null
    investimentoTiktok?: number | null
  }
): Promise<UpdateClientState> {
  const session = await requireSession()

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      slug: true,
      name: true,
      // Valores atuais de budget/faturamento para recalcular o ROAS esperado
      // usando fallback nos canais que não vieram no `data` desta edição.
      investimentoMeta: true,
      investimentoGoogle: true,
      investimentoTiktok: true,
      faturamentoEsperado: true,
    },
  })
  if (!client) return { error: 'Cliente não encontrado.' }

  try {
    await assertClientMutationAccess(session, clientId)
  } catch (e) {
    return { error: (e as Error).message }
  }

  const updateData: Record<string, unknown> = {}

  if (data.razaoSocial !== undefined) {
    // Razão social EXATAMENTE como está no Asaas (chave de conciliação).
    updateData.razaoSocial = data.razaoSocial?.trim() || null
  }

  if (data.name !== undefined && data.name.trim()) {
    const newName = data.name.trim()
    updateData.name = newName
    // Only reslug if name changed
    if (newName !== client.name) {
      // Bloqueia APENAS nome idêntico (case-insensitive) de OUTRO cliente.
      const sameName = await prisma.client.findFirst({
        where: { name: { equals: newName, mode: 'insensitive' }, NOT: { id: clientId } },
        select: { name: true },
      })
      if (sameName) return { error: `Já existe um cliente com o nome exato "${sameName.name}". Ajuste o nome para diferenciá-lo.` }
      // Slug repetido é desambiguado com sufixo (slug-2...), sem bloquear o nome.
      updateData.slug = await uniqueClientSlug(slugify(newName), clientId)
    }
  }
  if ('industry' in data) updateData.industry = data.industry ?? null
  if ('website' in data) updateData.website = data.website ?? null
  if ('notes' in data) updateData.notes = data.notes ?? null
  if ('email' in data) updateData.email = data.email ?? null
  if ('phone' in data) updateData.phone = data.phone ?? null
  if ('document' in data) updateData.document = data.document ?? null
  if ('contractValue' in data) updateData.contractValue = data.contractValue ?? null
  if ('contractStart' in data) updateData.contractStart = data.contractStart ?? null
  if ('source' in data) updateData.source = data.source ?? null
  if ('businessType' in data && data.businessType != null) updateData.businessType = data.businessType

  if ('investimentoMeta' in data) updateData.investimentoMeta = data.investimentoMeta ?? null
  if ('investimentoGoogle' in data) updateData.investimentoGoogle = data.investimentoGoogle ?? null
  if ('investimentoTiktok' in data) updateData.investimentoTiktok = data.investimentoTiktok ?? null

  // ROAS esperado é DERIVADO (faturamento-alvo ÷ investimento total) — nunca é
  // digitado à mão. Sempre que qualquer budget de canal muda, recalculamos.
  const budgetTocado =
    'investimentoMeta' in data ||
    'investimentoGoogle' in data ||
    'investimentoTiktok' in data
  if (budgetTocado) {
    // Valores FINAIS: o que veio no `data` prevalece; o que não veio usa o
    // valor atual do banco (fallback), para não zerar canais fora desta edição.
    const metaFinal =
      'investimentoMeta' in data ? data.investimentoMeta ?? null : num(client.investimentoMeta)
    const googleFinal =
      'investimentoGoogle' in data ? data.investimentoGoogle ?? null : num(client.investimentoGoogle)
    const tiktokFinal =
      'investimentoTiktok' in data ? data.investimentoTiktok ?? null : num(client.investimentoTiktok)

    const total = investimentoTotal(metaFinal, googleFinal, tiktokFinal)
    const faturamentoAtual = num(client.faturamentoEsperado)
    // Sem faturamento-alvo (null) ou sem budget → roasEsperado retorna null;
    // nesse caso NÃO mexemos no roasMinimo atual (não zeramos).
    if (faturamentoAtual != null) {
      const roas = roasEsperado(faturamentoAtual, total)
      if (roas != null) updateData.roasMinimo = roas
    }
  }

  const updated = await prisma.client.update({ where: { id: clientId }, data: updateData })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'client.update',
    entityType: 'Client',
    entityId: clientId,
    clientId,
    metadata: { fields: Object.keys(updateData) },
  })

  revalidatePath(`/clients/${updated.slug}`)
  revalidatePath('/clients')
  return { success: true, slug: updated.slug }
}

/**
 * Sanitiza a lista de produtos vinda do form: trim, remove vazios, dedupe
 * (case-insensitive, preservando o 1º rótulo), teto de 60 chars por item e 20
 * itens no total. Retorna a lista normalizada (ordem de chegada preservada).
 */
function sanitizeProdutos(input: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    const p = raw.trim().slice(0, 60)
    if (!p) continue
    const key = p.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
    if (out.length >= 20) break
  }
  return out
}

/**
 * Edita os PRODUTOS contratados do cliente (`Client.produtos`) — único caminho
 * de mutação desse campo. Faz o diff contra o estado atual, VERSIONA cada
 * transição em ClientProductChange (fonte canônica do histórico), grava a nova
 * lista, registra AuditLog e dispara o gatilho de DOWNGRADE (best-effort) para
 * cada produto removido. Adição não dispara automação (só histórico).
 *
 * Autorização (CLAUDE.md #2): requireSession + assertClientMutationAccess
 * (ADMIN todos; MANAGER só clientes atribuídos; CS/ANALYST bloqueados pela posse).
 */
export async function updateClientProdutos(
  clientId: string,
  produtos: string[],
): Promise<UpdateClientState> {
  const session = await requireSession()

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { slug: true, produtos: true },
  })
  if (!client) return { error: 'Cliente não encontrado.' }

  try {
    await assertClientMutationAccess(session, clientId)
  } catch (e) {
    return { error: (e as Error).message }
  }

  const next = sanitizeProdutos(produtos)
  // Diff CASE-INSENSITIVE, alinhado ao sanitize/UI: re-digitar 'crm zoppy' no
  // lugar de 'CRM Zoppy' é o MESMO produto — não pode virar REMOVED+ADDED
  // simultâneo nem disparar alerta de downgrade espúrio.
  const currentSet = new Set(client.produtos.map((p) => p.toLowerCase()))
  const nextSet = new Set(next.map((p) => p.toLowerCase()))

  const added = next.filter((p) => !currentSet.has(p.toLowerCase()))
  const removed = client.produtos.filter((p) => !nextSet.has(p.toLowerCase()))

  // Nada mudou → não escreve histórico nem dispara automação (sem ruído).
  if (added.length === 0 && removed.length === 0) {
    return { success: true, slug: client.slug }
  }

  const changes = [
    ...added.map((product) => ({ product, action: ProductChangeAction.ADDED })),
    ...removed.map((product) => ({ product, action: ProductChangeAction.REMOVED })),
  ]

  const updated = await prisma.$transaction(async (tx) => {
    await tx.clientProductChange.createMany({
      data: changes.map((c) => ({
        clientId,
        product: c.product,
        action: c.action,
        changedBy: session.userId,
      })),
    })
    return tx.client.update({
      where: { id: clientId },
      data: { produtos: next },
      select: { slug: true },
    })
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'client.produtos.update',
    entityType: 'Client',
    entityId: clientId,
    clientId,
    metadata: { added, removed },
  })

  // Gatilho de downgrade — best-effort: falha aqui NÃO reverte o save acima.
  if (removed.length > 0) {
    try {
      await onProductsDowngraded(clientId, removed)
    } catch {
      // silêncio proposital: o gatilho já loga a própria falha em AutomationLog.
    }
  }

  revalidatePath(`/clients/${updated.slug}`)
  revalidatePath('/clients')
  return { success: true, slug: updated.slug }
}

/**
 * PAUSA um cliente (T-23): status PAUSED + pausedAt=now + pauseReason.
 *
 * Semântica de produto: PAUSED = cliente temporariamente SEM operação ativa
 * (pausou mídia, negociação, sazonalidade). Enquanto pausado, os crons
 * operacionais (check-in, saúde, churn, War Room, relatório semanal) deixam de
 * cobrá-lo INTENCIONALMENTE — mas contrato/financeiro seguem intactos e ele
 * continua visível nas listas com selo + motivo + desde quando.
 *
 * Autorização (CLAUDE.md #2): requireSession + assertClientMutationAccess
 * (ADMIN todos; staff amplo; GESTOR_TRAFEGO só clientes atribuídos).
 * Não é possível pausar cliente CHURNED (já saiu — não faz sentido).
 */
export async function pauseClient(
  clientId: string,
  reason: string,
): Promise<UpdateClientState> {
  const session = await requireSession()

  const motivo = (reason ?? '').trim().slice(0, 300)
  if (!motivo) return { error: 'Informe o motivo da pausa (ex.: cliente pausou a mídia por sazonalidade).' }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { slug: true, status: true },
  })
  if (!client) return { error: 'Cliente não encontrado.' }

  // Posse ANTES de revelar o estado do cliente (não vaza status a quem não tem acesso).
  try {
    await assertClientMutationAccess(session, clientId)
  } catch (e) {
    return { error: (e as Error).message }
  }

  if (client.status === 'CHURNED') {
    return { error: 'Este cliente já foi cancelado — não é possível pausá-lo. Reative-o antes de pausar.' }
  }
  if (client.status === 'PAUSED') {
    return { error: 'Este cliente já está pausado.' }
  }

  const updated = await prisma.client.update({
    where: { id: clientId },
    data: { status: 'PAUSED', pausedAt: new Date(), pauseReason: motivo },
    select: { slug: true },
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'client.paused',
    entityType: 'Client',
    entityId: clientId,
    clientId,
    metadata: { reason: motivo },
  })

  revalidatePath(`/clients/${updated.slug}`)
  revalidatePath('/clients')
  return { success: true, slug: updated.slug }
}

/**
 * RETOMA um cliente pausado (T-23): status ACTIVE + pausedAt=null + pauseReason=null.
 * Volta a ser cobrado normalmente pelos crons operacionais.
 * Autorização idêntica a pauseClient.
 */
export async function resumeClient(clientId: string): Promise<UpdateClientState> {
  const session = await requireSession()

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { slug: true, status: true, pauseReason: true },
  })
  if (!client) return { error: 'Cliente não encontrado.' }
  if (client.status !== 'PAUSED') {
    return { error: 'Este cliente não está pausado.' }
  }

  try {
    await assertClientMutationAccess(session, clientId)
  } catch (e) {
    return { error: (e as Error).message }
  }

  const updated = await prisma.client.update({
    where: { id: clientId },
    data: { status: 'ACTIVE', pausedAt: null, pauseReason: null },
    select: { slug: true },
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'client.resumed',
    entityType: 'Client',
    entityId: clientId,
    clientId,
    metadata: { previousReason: client.pauseReason },
  })

  revalidatePath(`/clients/${updated.slug}`)
  revalidatePath('/clients')
  return { success: true, slug: updated.slug }
}

export async function bulkSetBusinessType(
  clientIds: string[],
  businessType: BusinessType
): Promise<{ updated: number; error?: string }> {
  const session = await requireSession()
  if (clientIds.length === 0) return { updated: 0 }

  // Posse: só altera clientes que o papel permite mutar (ADMIN todos; MANAGER só atribuídos).
  try {
    for (const id of clientIds) {
      await assertClientMutationAccess(session, id)
    }
  } catch (e) {
    return { updated: 0, error: (e as Error).message }
  }

  await prisma.client.updateMany({
    where: { id: { in: clientIds } },
    data:  { businessType },
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'client.bulk_business_type',
    entityType: 'Client',
    entityId: clientIds.join(','),
    metadata: { businessType, count: clientIds.length },
  })

  revalidatePath('/clients')
  return { updated: clientIds.length }
}

export async function deleteClient(clientId: string): Promise<UpdateClientState> {
  const session = await requireSession()
  if (session.role !== 'ADMIN') return { error: 'Sem permissão.' }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true, slug: true },
  })
  if (!client) return { error: 'Cliente não encontrado.' }

  // Registra a exclusão ANTES do delete — depois o cliente não existe mais para
  // consultar nome/slug (regra CLAUDE.md #8: automação crítica gera AuditLog).
  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'client.deleted',
    entityType: 'Client',
    entityId: clientId,
    clientId,
    metadata: { name: client.name, slug: client.slug },
  })

  await prisma.client.delete({ where: { id: clientId } })
  revalidatePath('/clients')
  redirect('/clients')
}
