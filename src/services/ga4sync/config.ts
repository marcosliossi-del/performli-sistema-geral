import { prisma } from '@/lib/prisma'

/**
 * Configuração da integração read-only com a API do GA4Sync.
 *
 * Padrão DB-first + fallback env (mesmo do Asaas — src/services/asaas/client.ts:112-123):
 * lê `IntegrationSetting` (chave @id) e, se ausente, cai para `process.env`.
 *
 * REGRA CLAUDE.md #5: segredo NUNCA hardcoded e NUNCA logado. Este módulo lê a
 * chave mas jamais a imprime; quem consome deve tratá-la como sensível.
 */

export interface Ga4SyncConfig {
  /** Base URL da API v1 (sem barra final). */
  baseUrl: string
  /** API key usada como `Authorization: Bearer <apiKey>`. Sensível — não logar. */
  apiKey: string
}

const KEY_BASE = 'GA4SYNC_API_BASE'
const KEY_APIKEY = 'GA4SYNC_API_KEY'

const DEFAULT_BASE = 'https://project-g09fp.vercel.app/api/v1'

/** Erro de configuração ausente/incorreta (distinto de erro HTTP da API). */
export class Ga4SyncConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'Ga4SyncConfigError'
  }
}

/**
 * Resolve base URL + API key.
 * DB (IntegrationSetting) tem precedência sobre env. Lança `Ga4SyncConfigError`
 * se a API key não estiver configurada em nenhum dos dois lugares.
 */
export async function getGa4SyncConfig(): Promise<Ga4SyncConfig> {
  const rows = await prisma.integrationSetting.findMany({
    where: { key: { in: [KEY_BASE, KEY_APIKEY] } },
  })
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]))

  const rawBase = map[KEY_BASE] ?? process.env.GA4SYNC_API_BASE ?? DEFAULT_BASE
  const apiKey = map[KEY_APIKEY] ?? process.env.GA4SYNC_API_KEY

  if (!apiKey || apiKey.trim() === '') {
    // Mensagem sem vazar valores — só diz o que falta e onde configurar.
    throw new Ga4SyncConfigError(
      'GA4Sync API key não configurada. Defina IntegrationSetting "GA4SYNC_API_KEY" ' +
        'ou a env GA4SYNC_API_KEY.',
    )
  }

  // Normaliza: remove barra(s) final(is) para concatenação previsível de paths.
  const baseUrl = rawBase.replace(/\/+$/, '')

  return { baseUrl, apiKey }
}
