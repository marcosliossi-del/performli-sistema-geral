/**
 * Auto-vínculo GA4Sync → Cliente (decisão Marcos 2026-07-23).
 *
 * PROBLEMA que resolve: o mapeamento cliente↔loja do GA4Sync dependia de uma
 * PlatformAccount NUVEMSHOP (resolveGa4SyncStoreId via NuvemshopStore). O dono
 * decidiu ESQUECER o vínculo manual Nuvemshop. Este módulo cria o vínculo DIRETO:
 * lista as lojas do GA4Sync (GET /stores) e casa com os clientes por NOME
 * (normalizado, case/acento-insensível). Match único e novo vira uma
 * PlatformAccount(platform=GA4SYNC, externalId=storeId) — a MESMA conta que o
 * sync já usa; assim resolveGa4SyncStoreId passa a resolver pelo vínculo direto.
 *
 * "Padrão para todos": roda no início do sync (cron e manual). Cliente novo de
 * e-commerce entra no padrão sozinho assim que o nome casar com uma loja.
 *
 * SEGURANÇA / CLAUDE.md:
 *  #5 chave nunca tocada aqui (getStores usa o client, que lê IntegrationSetting).
 *  #6 timeout — herdado do client GA4Sync.
 *  #8 toda vinculação automática gera AuditLog (action 'ga4sync.autolink').
 *  Ambíguos (mesmo nome em >1 cliente, ou loja↔cliente disputados) NÃO são
 *  vinculados — ficam no relatório para decisão humana. Nunca adivinha.
 */

import { prisma } from '@/lib/prisma'
import { getStores } from './client'
import { getGa4SyncConfig, Ga4SyncConfigError } from './config'

export interface Ga4SyncLinkReport {
  linked: Array<{ clientId: string; clientName: string; storeId: string; storeName: string }>
  alreadyLinked: Array<{ clientId: string; clientName: string; storeId: string }>
  ambiguous: Array<{ storeId: string; storeName: string; reason: string }>
  unmatchedStores: Array<{ storeId: string; storeName: string }>
  configured: boolean
}

/** Normaliza um nome para casamento: minúsculo, sem acento, só alfanumérico. */
export function normalizeName(name: string): string {
  // NFD decompõe acentos (é → e + marca); a limpeza [^a-z0-9] remove as marcas
  // combinantes junto com pontuação, então o resultado é acento-insensível.
  return name
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Lista lojas do GA4Sync e vincula (PlatformAccount GA4SYNC) aos clientes
 * ECOMMERCE ativos por nome. Idempotente: quem já está vinculado é ignorado.
 * Não relança em erro de config (retorna configured:false) — não derruba o cron.
 */
export async function autoLinkGa4SyncStores(): Promise<Ga4SyncLinkReport> {
  const report: Ga4SyncLinkReport = {
    linked: [],
    alreadyLinked: [],
    ambiguous: [],
    unmatchedStores: [],
    configured: true,
  }

  // Sem chave configurada → não é erro operacional: apenas não roda.
  try {
    await getGa4SyncConfig()
  } catch (err) {
    if (err instanceof Ga4SyncConfigError) {
      report.configured = false
      return report
    }
    throw err
  }

  const storesResp = await getStores()
  const stores = storesResp.data ?? []

  // Clientes ECOMMERCE ativos (o padrão de líquido é só de e-commerce).
  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE', businessType: 'ECOMMERCE' },
    select: { id: true, name: true },
  })

  // Índice nome-normalizado → clientes (para detectar ambiguidade por homônimo).
  const clientsByNorm = new Map<string, Array<{ id: string; name: string }>>()
  for (const c of clients) {
    const key = normalizeName(c.name)
    if (!key) continue
    const arr = clientsByNorm.get(key) ?? []
    arr.push(c)
    clientsByNorm.set(key, arr)
  }

  // Vínculos GA4SYNC já existentes (por cliente e por storeId) — idempotência.
  const existing = await prisma.platformAccount.findMany({
    where: { platform: 'GA4SYNC' },
    select: { id: true, clientId: true, externalId: true, active: true },
  })
  const linkedClientIds = new Set(existing.filter((e) => e.active).map((e) => e.clientId))
  const linkedStoreIds = new Set(existing.filter((e) => e.active).map((e) => e.externalId))

  // Detecta 2+ lojas casando o MESMO cliente (ambiguidade loja→cliente).
  const clientMatchCount = new Map<string, number>()
  for (const store of stores) {
    const matches = clientsByNorm.get(normalizeName(store.storeName ?? ''))
    if (matches && matches.length === 1) {
      clientMatchCount.set(matches[0].id, (clientMatchCount.get(matches[0].id) ?? 0) + 1)
    }
  }

  for (const store of stores) {
    const storeId = store.storeId
    const storeName = store.storeName ?? ''

    if (linkedStoreIds.has(storeId)) {
      const owner = existing.find((e) => e.externalId === storeId && e.active)
      if (owner) {
        const c = clients.find((x) => x.id === owner.clientId)
        report.alreadyLinked.push({
          clientId: owner.clientId,
          clientName: c?.name ?? '(cliente)',
          storeId,
        })
      }
      continue
    }

    const key = normalizeName(storeName)
    const matches = key ? clientsByNorm.get(key) : undefined

    if (!matches || matches.length === 0) {
      report.unmatchedStores.push({ storeId, storeName })
      continue
    }
    if (matches.length > 1) {
      report.ambiguous.push({
        storeId,
        storeName,
        reason: `Nome casa com ${matches.length} clientes (${matches.map((m) => m.name).join(', ')})`,
      })
      continue
    }

    const client = matches[0]

    if (linkedClientIds.has(client.id)) {
      report.alreadyLinked.push({ clientId: client.id, clientName: client.name, storeId })
      continue
    }
    if ((clientMatchCount.get(client.id) ?? 0) > 1) {
      report.ambiguous.push({
        storeId,
        storeName,
        reason: `Cliente "${client.name}" casa com mais de uma loja GA4Sync`,
      })
      continue
    }

    // Match ÚNICO e novo → cria o vínculo direto (idempotente por unique).
    const account = await prisma.platformAccount.upsert({
      where: {
        clientId_platform_externalId: {
          clientId: client.id,
          platform: 'GA4SYNC',
          externalId: storeId,
        },
      },
      update: { active: true },
      create: {
        clientId: client.id,
        platform: 'GA4SYNC',
        externalId: storeId,
        name: storeName ? `GA4Sync — ${storeName}` : `GA4Sync store ${storeId}`,
        active: true,
      },
      select: { id: true },
    })

    await prisma.auditLog.create({
      data: {
        actorId: null,
        actorRole: 'SYSTEM',
        action: 'ga4sync.autolink',
        entityType: 'PlatformAccount',
        entityId: account.id,
        clientId: client.id,
        metadata: { storeId, storeName, clientName: client.name, matchedBy: 'name' },
      },
    })

    linkedClientIds.add(client.id)
    linkedStoreIds.add(storeId)
    report.linked.push({ clientId: client.id, clientName: client.name, storeId, storeName })
  }

  // Persiste o último relatório para o painel do /diagnostico-fontes (caso
  // My Muse 2026-07-23: sem visibilidade dos nomes das lojas do conector, era
  // impossível saber POR QUE um cliente não casou). Nunca derruba o fluxo.
  try {
    await prisma.integrationSetting.upsert({
      where: { key: 'GA4SYNC_AUTOLINK_REPORT' },
      create: { key: 'GA4SYNC_AUTOLINK_REPORT', value: JSON.stringify({ at: new Date().toISOString(), ...report }) },
      update: { value: JSON.stringify({ at: new Date().toISOString(), ...report }) },
    })
  } catch (err) {
    console.warn('[ga4sync/auto-link] falha ao persistir relatório:', err)
  }

  return report
}
