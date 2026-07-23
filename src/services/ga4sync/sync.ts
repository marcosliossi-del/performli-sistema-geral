/**
 * GA4Sync Sync — persiste a receita diária autoritativa do GA4Sync no
 * MetricSnapshot, para que as telas internas (que leem MetricSnapshot) passem a
 * usar a receita real de e-commerce Nuvemshop nos clientes que têm loja.
 *
 * Fluxo por cliente:
 *   1. Resolve storeId (resolveGa4SyncStoreId). Sem loja → skip SEM erro.
 *   2. Garante PlatformAccount(platform=GA4SYNC, externalId=storeId).
 *   3. Cria SyncLog (RUNNING).
 *   4. Busca a timeline diária (getTimeline) e faz upsert de MetricSnapshot por dia.
 *   5. Atualiza lastSyncAt na PlatformAccount.
 *   6. Finaliza SyncLog (SUCCESS ou FAILED). Falha NÃO relança (degrade por cliente).
 *
 * CLAUDE.md aplicável:
 *  #5 API key NUNCA em log/URL — o client já garante; aqui nunca a tocamos.
 *  #6 timeout — o client já usa AbortSignal.timeout.
 *  #7 try/catch por cliente — uma loja não derruba as demais.
 *  #9 SyncLog + lastRunAt em toda rotina.
 *
 * IMPORTANTE (bug AL-3): MetricSnapshot.date é @db.Date e a agregação compara
 * contra meia-noite UTC do dia. Gravamos `new Date(`${dateStr}T00:00:00.000Z`)`,
 * nunca fuso local.
 *
 * Persiste, por dia: receita BRUTA (conversionValue) + pedidos (conversions) do
 * /timeline, e a receita LÍQUIDA (netRevenue) derivada da razão real líquido/bruto
 * do /kpis do período (decisão Marcos 2026-07-22: clientes COM GA4Sync medem
 * líquido). O consumo do netRevenue pela agregação canônica está em
 * aggregateSnapshots (precedência NUVEMSHOP/GA4SYNC líquido > GA4 bruto).
 *
 * ⚠️ Shape do timeline (points[].date/revenue/orders) foi modelado a partir da
 * SPEC textual, não do /openapi.json (egress bloqueado em dev). Conferir contra
 * o schema oficial quando houver acesso — ver src/services/ga4sync/types.ts.
 */

import { prisma } from '@/lib/prisma'
import { getTimeline, getKpis } from './client'
import { getGa4SyncConfig, Ga4SyncConfigError } from './config'
import { resolveGa4SyncStoreId } from './store-resolver'
import { autoLinkGa4SyncStores, type Ga4SyncLinkReport } from './auto-link'

/**
 * Razão RECEITA LÍQUIDA ÷ BRUTA + novos clientes do período (decisão Marcos
 * 2026-07-22: clientes COM GA4Sync medem LÍQUIDO). O /timeline entrega só o BRUTO
 * por dia (revenue); o líquido real está no bloco /kpis (netRevenue, agregado do
 * período). Buscamos os agregados e derivamos o líquido diário aplicando a razão
 * real do período a cada dia (netRatio = netRevenue/revenue) — o somatório MTD
 * bate com o líquido do GA4Sync; NUNCA inventamos desconto. Falha aqui NÃO derruba
 * o sync: sem razão, netRevenue fica null e o consumo cai no bruto (degrade honesto).
 */
async function loadGa4SyncNetContext(storeId: string): Promise<{
  netRatio: number | null
  newCustomers: number | null
  totalOrders: number | null
}> {
  try {
    const kpis = (await getKpis(storeId, SYNC_PRESET)).data?.kpis
    if (!kpis) return { netRatio: null, newCustomers: null, totalOrders: null }
    const gross = Number(kpis.revenue)
    const net = Number(kpis.netRevenue)
    const netRatio =
      Number.isFinite(gross) && gross > 0 && Number.isFinite(net) && net > 0 ? net / gross : null
    const newCustomers = Number.isFinite(kpis.newCustomers) ? kpis.newCustomers : null
    const totalOrders = Number.isFinite(kpis.orders) && kpis.orders > 0 ? kpis.orders : null
    return { netRatio, newCustomers, totalOrders }
  } catch {
    return { netRatio: null, newCustomers: null, totalOrders: null }
  }
}

/** Janela sincronizada a cada rodada (preset da API). */
// 'this_month' é o preset CONFIRMADO em produção (debugStore 2026-07-23) e o
// que a régua consome (MTD). 'last_90d' nunca foi validado contra a API real.
const SYNC_PRESET = 'this_month' as const

export interface Ga4SyncAccountResult {
  clientId: string
  skipped: boolean
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED'
  storeId?: string
  snapshotsUpserted?: number
  errorMessage?: string
}

export interface Ga4SyncAllResult {
  synced: number
  skipped: number
  failed: number
  results: Ga4SyncAccountResult[]
  /** Resultado do auto-vínculo loja↔cliente executado antes do sync. */
  autoLink?: Ga4SyncLinkReport
}

/** Converte 'YYYY-MM-DD' em meia-noite UTC do dia (compatível com @db.Date). */
function toUtcDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`)
}

/**
 * Sincroniza a receita diária do GA4Sync de UM cliente para o MetricSnapshot.
 * clientId SEMPRE vem do chamador.
 */
export async function syncGa4SyncAccount(
  clientId: string,
  options: { skipAutoLink?: boolean } = {},
): Promise<Ga4SyncAccountResult> {
  let storeId = await resolveGa4SyncStoreId(clientId)

  // Sync manual de UM cliente ainda não vinculado: tenta o auto-vínculo por nome
  // uma vez e re-resolve. No batch (skipAutoLink) o auto-vínculo já rodou antes.
  if (!storeId && !options.skipAutoLink) {
    try {
      await autoLinkGa4SyncStores()
      storeId = await resolveGa4SyncStoreId(clientId)
    } catch {
      // degrade honesto: sem vínculo, cai no skip abaixo.
    }
  }

  // Cliente sem loja GA4Sync resolvível (sem match de nome nem loja Nuvemshop) →
  // não usa GA4Sync. Skip sem erro.
  if (!storeId) {
    return { clientId, skipped: true, status: 'SKIPPED' }
  }

  // Garante a PlatformAccount GA4SYNC (upsert por @@unique[clientId,platform,externalId]).
  // Sem accessToken: a chave do GA4Sync é global (IntegrationSetting/env).
  const account = await prisma.platformAccount.upsert({
    where: {
      clientId_platform_externalId: {
        clientId,
        platform: 'GA4SYNC',
        externalId: storeId,
      },
    },
    update: { active: true },
    create: {
      clientId,
      platform: 'GA4SYNC',
      externalId: storeId,
      name: `GA4Sync store ${storeId}`,
      active: true,
    },
    select: { id: true },
  })

  const syncLog = await prisma.syncLog.create({
    data: { platformAccountId: account.id, platform: 'GA4SYNC', status: 'RUNNING' },
  })

  try {
    const envelope = await getTimeline(storeId, SYNC_PRESET)
    // Contrato real (debugStore 2026-07-23): data É o array de pontos.
    const points = envelope.data ?? []

    // Contexto de receita LÍQUIDA do período (razão líquido/bruto + novos clientes).
    const netCtx = await loadGa4SyncNetContext(storeId)

    let snapshotsUpserted = 0
    for (const point of points) {
      if (!point?.date) continue
      const date = toUtcDate(point.date)
      const revenue = Number.isFinite(point.revenue) ? point.revenue : 0
      // conversions é Int no schema — arredonda para não estourar o upsert se a
      // API devolver fracionário.
      const orders = Number.isFinite(point.orders) ? Math.round(point.orders) : 0
      // Receita LÍQUIDA por dia (decisão Marcos: GA4Sync = líquido). Precedência:
      //  1. netRevenue explícito do ponto, se a API do timeline vier a expor;
      //  2. derivação pela razão real do período (bruto do dia × netRatio /kpis);
      //  3. null → o consumo cai no bruto (degrade honesto, sem inventar desconto).
      const netRevenue =
        typeof point.netRevenue === 'number' && Number.isFinite(point.netRevenue)
          ? point.netRevenue
          : netCtx.netRatio != null
            ? Math.round(revenue * netCtx.netRatio * 100) / 100
            : null
      // Novos clientes do dia: explícito do ponto, senão rateio do total do período
      // pela participação do dia nos pedidos (soma ≈ novos clientes do período).
      const newCustomers =
        typeof point.newCustomers === 'number' && Number.isFinite(point.newCustomers)
          ? Math.round(point.newCustomers)
          : netCtx.newCustomers != null && netCtx.totalOrders != null && netCtx.totalOrders > 0
            ? Math.round(netCtx.newCustomers * (orders / netCtx.totalOrders))
            : null

      await prisma.metricSnapshot.upsert({
        where: { platformAccountId_date: { platformAccountId: account.id, date } },
        update: {
          conversions: orders,
          conversionValue: revenue,
          netRevenue,
          newCustomers,
          rawData: { source: 'ga4sync', date: point.date, revenue, orders, netRevenue, newCustomers },
          syncedAt: new Date(),
        },
        create: {
          clientId,
          platformAccountId: account.id,
          date,
          conversions: orders,
          conversionValue: revenue,
          netRevenue,
          newCustomers,
          rawData: { source: 'ga4sync', date: point.date, revenue, orders, netRevenue, newCustomers },
        },
      })
      snapshotsUpserted++
    }

    await prisma.platformAccount.update({
      where: { id: account.id },
      data: { lastSyncAt: new Date() },
    })

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'SUCCESS', completedAt: new Date(), recordsUpserted: snapshotsUpserted },
    })

    return { clientId, skipped: false, status: 'SUCCESS', storeId, snapshotsUpserted }
  } catch (error) {
    // Degrade por cliente: fecha o SyncLog como FAILED e NÃO relança.
    // A mensagem do Ga4SyncError/Ga4SyncConfigError já é livre de segredos.
    const errorMessage = error instanceof Error ? error.message : String(error)

    await prisma.syncLog
      .update({
        where: { id: syncLog.id },
        data: { status: 'FAILED', completedAt: new Date(), errorMessage },
      })
      .catch(() => {})

    return { clientId, skipped: false, status: 'FAILED', storeId, errorMessage }
  }
}

/**
 * Sincroniza a receita do GA4Sync de TODOS os clientes ATIVOS, sequencialmente,
 * com try/catch por cliente (uma falha não derruba as demais).
 * Retorna resumo {synced, skipped, failed}.
 */
export async function syncAllGa4SyncAccounts(): Promise<Ga4SyncAllResult> {
  // Se a integração não está configurada (sem chave), não quebra o cron:
  // registra um log claro e retorna resumo vazio.
  try {
    await getGa4SyncConfig()
  } catch (err) {
    if (err instanceof Ga4SyncConfigError) {
      console.warn('[ga4sync] sync ignorado: integração não configurada (sem GA4SYNC_API_KEY)')
      return { synced: 0, skipped: 0, failed: 0, results: [] }
    }
    throw err
  }

  // AUTO-VÍNCULO (decisão Marcos 2026-07-23): antes de sincronizar, casar as lojas
  // do GA4Sync com os clientes ECOMMERCE por nome e criar os vínculos diretos
  // faltantes. Assim cliente novo de e-commerce entra no padrão sozinho. Falha
  // aqui NÃO derruba o sync (degrade honesto: quem já estava vinculado segue).
  let autoLink: Ga4SyncLinkReport | undefined
  try {
    autoLink = await autoLinkGa4SyncStores()
  } catch (err) {
    console.warn(
      `[ga4sync] auto-vínculo falhou (sync segue): ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  })

  const results: Ga4SyncAccountResult[] = []
  let synced = 0
  let skipped = 0
  let failed = 0

  for (const client of clients) {
    try {
      const result = await syncGa4SyncAccount(client.id, { skipAutoLink: true })
      results.push(result)
      if (result.status === 'SUCCESS') synced++
      else if (result.status === 'SKIPPED') skipped++
      else failed++
    } catch (err) {
      // Defesa extra: syncGa4SyncAccount já não relança, mas garantimos que
      // um erro inesperado (ex.: DB) em um cliente não derrube o loop.
      const errorMessage = err instanceof Error ? err.message : String(err)
      results.push({ clientId: client.id, skipped: false, status: 'FAILED', errorMessage })
      failed++
    }
  }

  return { synced, skipped, failed, results, autoLink }
}
