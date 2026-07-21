'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { assertClientMutationAccess, writeAuditLog } from '@/lib/audit'
import { slugify } from '@/lib/utils'
import { uniqueClientSlug } from '@/lib/clients/slug'
import { BusinessType, ClientStatus, ProductChangeAction, MetricType } from '@prisma/client'
import { computeMetasFromBudget } from '@/lib/metas/budget'
import { parseDateInput } from '@/lib/tasks/dateInput'
import { onProductsDowngraded } from '@/services/product-downgrade-automation'
import { runClientOffboarding } from '@/services/client-offboarding'
import { computeRenewalDates } from '@/services/contract-renewal'
import { normalizeRole } from '@/lib/rbac'
import { z } from 'zod'

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
    // ROAS mínimo = DECISÃO HUMANA editável no início do mês (regra Marcos
    // 2026-07-21). A partir dele + budget, derivamos as metas do mês (item abaixo).
    roasMinimo?: number | null
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
      roasMinimo: true,
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
  if ('roasMinimo' in data) updateData.roasMinimo = data.roasMinimo ?? null

  // ── DERIVAÇÃO DE METAS A PARTIR DO BUDGET (regra Marcos 2026-07-21) ─────────
  // Direção: budget + ROAS mínimo (ambos decisão humana) → metas do mês.
  //   spend = soma dos canais · faturamento = spend × roasMinimo · roas = roasMinimo
  // Isto INVERTE a lógica antiga (roasMinimo derivado do faturamento) — agora o
  // ROAS mínimo é INPUT e o faturamento é DERIVADO. Ver DOSSIE §15.
  const budgetTocado =
    'investimentoMeta' in data ||
    'investimentoGoogle' in data ||
    'investimentoTiktok' in data ||
    'roasMinimo' in data

  // Valores FINAIS: o que veio no `data` prevalece; o que não veio usa o valor
  // atual do banco (fallback), para não zerar canais fora desta edição.
  const metaFinal =
    'investimentoMeta' in data ? data.investimentoMeta ?? null : num(client.investimentoMeta)
  const googleFinal =
    'investimentoGoogle' in data ? data.investimentoGoogle ?? null : num(client.investimentoGoogle)
  const tiktokFinal =
    'investimentoTiktok' in data ? data.investimentoTiktok ?? null : num(client.investimentoTiktok)
  const roasFinal =
    'roasMinimo' in data ? data.roasMinimo ?? null : num(client.roasMinimo)

  const metas = computeMetasFromBudget({
    investimentoMeta: metaFinal,
    investimentoGoogle: googleFinal,
    investimentoTiktok: tiktokFinal,
    roasMinimo: roasFinal,
  })

  // Cache do faturamento esperado na ficha (dado amarrado): reflete a derivação.
  if (budgetTocado && metas.faturamentoGoal != null) {
    updateData.faturamentoEsperado = metas.faturamentoGoal
  }

  const updated = await prisma.client.update({ where: { id: clientId }, data: updateData })

  // ── UPSERT das Goals MONTHLY do MÊS CORRENTE (SPEND/FATURAMENTO/ROAS) ───────
  // Só as metas com valor derivado (não-null) são gravadas. Mesma convenção de
  // data da projeção (parseDateInput → meio-dia UTC) para colidir na chave única
  // e SOBRESCREVER a projeção automática do mês — budget é decisão humana e vence.
  if (budgetTocado) {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const gy = now.getUTCFullYear()
    const gm = now.getUTCMonth() // 0-based
    const lastDay = new Date(Date.UTC(gy, gm + 1, 0)).getUTCDate()
    const goalStart = parseDateInput(`${gy}-${pad(gm + 1)}-01`)
    const goalEnd = parseDateInput(`${gy}-${pad(gm + 1)}-${pad(lastDay)}`)

    const derivadas: Array<{ metric: MetricType; value: number | null }> = [
      { metric: 'SPEND', value: metas.spendGoal },
      { metric: 'FATURAMENTO', value: metas.faturamentoGoal },
      { metric: 'ROAS', value: metas.roasGoal },
    ]

    for (const d of derivadas) {
      if (d.value == null || !(d.value > 0)) continue
      await prisma.goal.upsert({
        where: {
          clientId_metric_period_startDate: {
            clientId,
            metric: d.metric,
            period: 'MONTHLY',
            startDate: goalStart,
          },
        },
        update: { targetValue: d.value, endDate: goalEnd },
        create: {
          clientId,
          metric: d.metric,
          period: 'MONTHLY',
          targetValue: d.value,
          startDate: goalStart,
          endDate: goalEnd,
        },
      })
    }

    await writeAuditLog({
      actorId: session.userId,
      actorRole: session.role,
      action: 'goals.auto_from_budget',
      entityType: 'Goal',
      entityId: clientId,
      clientId,
      metadata: {
        spendGoal: metas.spendGoal,
        faturamentoGoal: metas.faturamentoGoal,
        roasGoal: metas.roasGoal,
        mes: `${gy}-${pad(gm + 1)}`,
      },
    })
  }

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

// ─── Status editável inline + em massa (fatia FUNDACAO — tela Clientes) ─────────
// DADO AMARRADO (CLAUDE.md #0): o seletor de status escreve na FONTE ÚNICA
// `Client.status` (ACTIVE/PAUSED/CHURNED). "Em renovação" NÃO é opção do seletor
// — é derivado do Contract vigente (status RENOVACAO, Jurídico) e só aparece como
// badge de leitura. Aqui NÃO se toca em contrato.
const bulkStatusSchema = z.object({
  clientIds: z.array(z.string().min(1)).min(1, 'Selecione ao menos um cliente.').max(100, 'Máximo de 100 clientes por vez.'),
  status: z.nativeEnum(ClientStatus),
})

/**
 * Altera o status de 1..100 clientes de uma vez (usado pela edição inline por
 * linha E pela barra de ação em massa da tela de Clientes).
 *
 * Autorização (CLAUDE.md #2/#3):
 *  - autenticação: requireSession.
 *  - papel: SOMENTE ADMIN e SUPERVISOR_TRAFEGO. Mudar status de cliente —
 *    sobretudo CANCELAR (CHURNED) — é ação ESTRUTURAL: tira o cliente das rotinas
 *    operacionais (check-in, saúde, churn, War Room, relatório) e das metas
 *    ativas, e dispara offboarding. Por isso NÃO liberamos para GESTOR_TRAFEGO
 *    (conflito de interesse: poderia "sumir" com um cliente da própria carteira
 *    para escapar de cobrança/meta), ANALISTA_TRAFEGO (acesso limitado) nem CS
 *    (leitura ampla, sem mutação indevida — CLAUDE.md). Como o gate é por PAPEL
 *    global (não por carteira), não há posse por-cliente a validar: ADMIN e
 *    SUPERVISOR já enxergam/mutam toda a base (scopeClients vazio p/ esses papéis).
 *  - log: AuditLog 'client.status.bulk' com status-alvo e contagem.
 *
 * Efeitos de estado (espelham as mutações unitárias existentes):
 *  - ACTIVE:  limpa pausedAt/pauseReason e sincroniza pipelineStage=ATIVO.
 *  - PAUSED:  marca pausedAt/pauseReason (só nos que ainda NÃO estavam pausados,
 *             p/ não reescrever "desde quando").
 *  - CHURNED: sincroniza pipelineStage=CHURNED e dispara runClientOffboarding por
 *             cliente que REALMENTE transitou p/ CHURNED (try/catch por cliente —
 *             CLAUDE.md #7: falha em um não derruba os demais nem a rotina).
 */
export async function updateClientsStatus(
  clientIds: string[],
  status: ClientStatus,
): Promise<{ updated: number; error?: string; renewedCount?: number; renewedUntil?: string | null }> {
  const session = await requireSession()

  const parsed = bulkStatusSchema.safeParse({ clientIds, status })
  if (!parsed.success) {
    return { updated: 0, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const ids = [...new Set(parsed.data.clientIds)]

  // Papel: ADMIN ou SUPERVISOR_TRAFEGO (ver docstring). Deny-by-default.
  const role = normalizeRole(session.role)
  if (role !== 'ADMIN' && role !== 'SUPERVISOR_TRAFEGO') {
    return { updated: 0, error: 'Sem permissão para alterar o status de clientes.' }
  }

  // Estado ANTES — para detectar transição REAL p/ CHURNED e não repausar quem
  // já estava pausado.
  const before = await prisma.client.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true },
  })
  const foundIds = before.map((c) => c.id)
  if (foundIds.length === 0) return { updated: 0, error: 'Nenhum cliente encontrado.' }

  const now = new Date()
  let renewedCount = 0
  let renewedUntil: string | null = null
  if (status === 'PAUSED') {
    // Só os que NÃO estavam pausados recebem pausedAt/pauseReason novos.
    const toPause = before.filter((c) => c.status !== 'PAUSED').map((c) => c.id)
    if (toPause.length > 0) {
      await prisma.client.updateMany({
        where: { id: { in: toPause } },
        data:  { status: 'PAUSED', pausedAt: now, pauseReason: 'Pausado pela tela de Clientes (ação em massa).' },
      })
    }
  } else if (status === 'ACTIVE') {
    // Reativação renova o contrato em RENOVACAO pelo mesmo período (adendo
    // FUNDACAO). Contratos em renovação desses clientes (o mais recente por
    // cliente); a renovação e a reativação vão juntas em $transaction.
    const renovando = await prisma.contract.findMany({
      where:   { clientId: { in: foundIds }, status: 'RENOVACAO' },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      select:  { id: true, clientId: true, startDate: true, endDate: true },
    })
    const contratoPorCliente = new Map<string, (typeof renovando)[number]>()
    for (const c of renovando) if (!contratoPorCliente.has(c.clientId)) contratoPorCliente.set(c.clientId, c)

    // Clientes SEM contrato em renovação → reativação em massa simples.
    const semRenov = foundIds.filter((id) => !contratoPorCliente.has(id))
    if (semRenov.length > 0) {
      await prisma.client.updateMany({
        where: { id: { in: semRenov } },
        data:  { status: 'ACTIVE', pausedAt: null, pauseReason: null, pipelineStage: 'ATIVO' },
      })
    }

    // Clientes COM contrato em renovação → status + renovação na MESMA transação
    // (fonte única de datas: computeRenewalDates). try/catch por cliente (#7).
    for (const [clientId, contract] of contratoPorCliente) {
      const { newStart, newEnd } = computeRenewalDates(contract.startDate, contract.endDate)
      try {
        await prisma.$transaction([
          prisma.client.update({
            where: { id: clientId },
            data:  { status: 'ACTIVE', pausedAt: null, pauseReason: null, pipelineStage: 'ATIVO', contractStart: newStart, contractEndDate: newEnd },
          }),
          prisma.contract.update({
            where: { id: contract.id },
            data:  { startDate: newStart, endDate: newEnd, status: 'VIGENTE' },
          }),
        ])
        await writeAuditLog({
          actorId: session.userId,
          actorRole: session.role,
          action: 'contract.auto_renewed_on_reactivation',
          entityType: 'Contract',
          entityId: contract.id,
          clientId,
          metadata: { newStart: newStart.toISOString(), newEnd: newEnd.toISOString() },
        })
        renewedCount++
        renewedUntil = newEnd.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
      } catch (err) {
        console.error(`[contract-renewal] falha ao renovar na reativação de ${clientId}:`, err)
        // Fallback: ao menos reativa o cliente (não deixa em estado inconsistente).
        await prisma.client.update({
          where: { id: clientId },
          data:  { status: 'ACTIVE', pausedAt: null, pauseReason: null, pipelineStage: 'ATIVO' },
        }).catch(() => {})
      }
    }
  } else {
    // CHURNED
    await prisma.client.updateMany({
      where: { id: { in: foundIds } },
      data:  { status: 'CHURNED', pipelineStage: 'CHURNED' },
    })
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'client.status.bulk',
    entityType: 'Client',
    entityId: foundIds.join(','),
    metadata: { status, count: foundIds.length },
  })

  // Offboarding SÓ nos que realmente transitaram para CHURNED (best-effort,
  // try/catch por cliente — não quebra os demais).
  if (status === 'CHURNED') {
    for (const c of before) {
      if (c.status !== 'CHURNED') {
        try {
          await runClientOffboarding(c.id)
        } catch (err) {
          console.error(`[offboarding] falha ao rodar runClientOffboarding para ${c.id}:`, err)
        }
      }
    }
  }

  revalidatePath('/clients')
  revalidatePath('/cockpit')
  if (renewedCount > 0) revalidatePath('/juridico')
  return { updated: foundIds.length, renewedCount, renewedUntil }
}
