import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { getStores, getTimeline, getKpis, Ga4SyncError } from '@/services/ga4sync/client'
import { Ga4SyncConfigError } from '@/services/ga4sync/config'
import { z } from 'zod'

/**
 * Configuração da integração GA4Sync (API read-only de KPIs Nuvemshop).
 * Espelha o padrão do Asaas (src/app/api/settings/asaas/route.ts): a chave é
 * gravada em `IntegrationSetting` (nunca em git/log/URL) e o POST testa a
 * conexão chamando /stores. Só ADMIN.
 *
 * Chaves: GA4SYNC_API_KEY (obrigatória) e GA4SYNC_API_BASE (opcional; default no
 * config.ts). A leitura é DB-first + fallback env, então salvar aqui já ativa a
 * integração sem redeploy.
 */

const KEYS = ['GA4SYNC_API_KEY', 'GA4SYNC_API_BASE'] as const

const saveSchema = z.object({
  apiKey: z.string().min(1),
  // Base é opcional: em branco, usa o default do config.ts.
  baseUrl: z.string().url().optional().or(z.literal('')),
})

/** GET — status atual (chave MASCARADA, nunca em claro). */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // DEBUG ADMIN (caso My Muse 2026-07-23: timeline gravando 0 registros):
  // ?debugStore=<storeId> devolve as respostas CRUAS de /timeline e /kpis
  // do período this_month, para conferir o formato real da API contra os
  // nossos types. Read-only, sem chave no output, só ADMIN.
  const debugStore = request.nextUrl.searchParams.get('debugStore')
  if (debugStore) {
    const out: Record<string, unknown> = {}
    try {
      out.timeline = await getTimeline(debugStore, 'this_month')
    } catch (err) {
      out.timelineError = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    }
    try {
      out.kpis = await getKpis(debugStore, 'this_month')
    } catch (err) {
      out.kpisError = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    }
    return NextResponse.json(out)
  }

  const rows = await prisma.integrationSetting.findMany({
    where: { key: { in: [...KEYS] } },
  })
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))

  const dbKey = map.GA4SYNC_API_KEY
  const hasKey = !!(dbKey || process.env.GA4SYNC_API_KEY)
  const masked = dbKey
    ? `${'•'.repeat(16)}${dbKey.slice(-4)}`
    : process.env.GA4SYNC_API_KEY
      ? '(configurada via env)'
      : ''
  const baseUrl = map.GA4SYNC_API_BASE || process.env.GA4SYNC_API_BASE || ''

  return NextResponse.json({ hasKey, masked, baseUrl })
}

/** POST — salva chave (+ base opcional) e TESTA a conexão via /stores. */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = saveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const apiKey = parsed.data.apiKey.trim()
  const baseUrl = (parsed.data.baseUrl ?? '').trim()

  await prisma.integrationSetting.upsert({
    where: { key: 'GA4SYNC_API_KEY' },
    create: { key: 'GA4SYNC_API_KEY', value: apiKey },
    update: { value: apiKey },
  })
  if (baseUrl) {
    await prisma.integrationSetting.upsert({
      where: { key: 'GA4SYNC_API_BASE' },
      create: { key: 'GA4SYNC_API_BASE', value: baseUrl },
      update: { value: baseUrl },
    })
  }

  // Teste de conexão: lista as lojas visíveis para a chave (config é DB-first,
  // então já pega o que acabamos de gravar).
  try {
    const res = await getStores()
    return NextResponse.json({ ok: true, storeCount: res.data.length })
  } catch (err) {
    // Mensagem operacional, sem stack nem a chave. Distingue chave inválida
    // (401/403) de indisponibilidade.
    let msg = 'A chave foi salva, mas o teste de conexão falhou.'
    if (err instanceof Ga4SyncError) {
      if (err.code === 'unauthorized' || err.code === 'forbidden') {
        msg = 'A chave foi salva, mas o GA4Sync recusou a autenticação. Verifique se a chave está correta e ativa.'
      } else {
        msg = `A chave foi salva, mas o GA4Sync respondeu com erro (${err.code}). Tente novamente em instantes.`
      }
    } else if (err instanceof Ga4SyncConfigError) {
      msg = 'Configuração incompleta do GA4Sync. Verifique a URL base.'
    }
    console.error('[settings/ga4sync] falha ao testar chave:', err instanceof Error ? err.message : 'erro')
    return NextResponse.json({ ok: false, error: msg }, { status: 422 })
  }
}

/** DELETE — remove a configuração salva. */
export async function DELETE() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await prisma.integrationSetting.deleteMany({ where: { key: { in: [...KEYS] } } })
  return NextResponse.json({ ok: true })
}
