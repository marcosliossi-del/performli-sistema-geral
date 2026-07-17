import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createHmac, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'
import { processChannelEvent } from '@/services/conversas/ingest'

/**
 * Webhook oficial da Meta (WhatsApp Cloud API) — módulo Conversas.
 *
 * Rota INDEPENDENTE do webhook Z-API existente (nada é compartilhado). Guard
 * próprio (o middleware não cobre /api/*). Fail-closed em toda a autenticação.
 *
 * GET  — handshake de verificação (hub.mode/hub.verify_token/hub.challenge).
 * POST — recebe eventos assinados (X-Hub-Signature-256 = 'sha256='+HMAC do RAW
 *        body com o App Secret). Grava cada item cru em ChannelEvent (outbox,
 *        decisão R1) deduplicado por externalId, responde 200 IMEDIATAMENTE e
 *        tenta processar inline best-effort. SEMPRE 200 para a Meta, exceto os
 *        erros de autenticação (401/403/503).
 *
 * Segredos DB-first (IntegrationSetting) com fallback em env:
 *   - META_WA_VERIFY_TOKEN (handshake GET)
 *   - META_WA_APP_SECRET   (assinatura POST)
 *
 * ⚠️ TODO conferir doc oficial atual da Meta (WebSearch indisponível no ambiente,
 * 2026-07-13): formato do handshake, header X-Hub-Signature-256 e a estrutura
 * entry[].changes[].value.{messages,statuses,metadata}. Ver Graph API v23.0.
 */

/** Lê um segredo DB-first (IntegrationSetting) com fallback em env var. */
async function getSecret(key: string): Promise<string | null> {
  try {
    const row = await prisma.integrationSetting.findUnique({ where: { key }, select: { value: true } })
    if (row?.value) return row.value
  } catch (err) {
    console.error(`[meta-whatsapp] falha ao ler IntegrationSetting ${key}:`, err)
  }
  return process.env[key] ?? null
}

// ── GET: verificação do webhook ──────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')

  const expected = await getSecret('META_WA_VERIFY_TOKEN')
  if (!expected) {
    // Sem token configurado: não há como verificar → fail-closed.
    return new NextResponse('Webhook não configurado', { status: 503 })
  }

  if (mode === 'subscribe' && token === expected && challenge != null) {
    // A Meta espera o desafio como TEXTO PURO no corpo, HTTP 200.
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
  return new NextResponse('Verificação falhou', { status: 403 })
}

/** Comparação timing-safe de duas assinaturas hex (tamanhos podem diferir). */
function signaturesMatch(expectedHex: string, providedHeader: string | null): boolean {
  if (!providedHeader) return false
  const provided = providedHeader.startsWith('sha256=') ? providedHeader.slice(7) : providedHeader
  const a = Buffer.from(expectedHex, 'hex')
  const b = Buffer.from(provided, 'hex')
  if (a.length === 0 || a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ── POST: eventos assinados ──────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // RAW body é obrigatório: a assinatura é sobre os bytes exatos recebidos.
  const rawBody = await request.text()

  const appSecret = await getSecret('META_WA_APP_SECRET')
  if (!appSecret) {
    return NextResponse.json({ error: 'Webhook não configurado' }, { status: 503 })
  }

  const computed = createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const signature = request.headers.get('x-hub-signature-256')
  if (!signaturesMatch(computed, signature)) {
    return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
  }

  // A partir daqui: SEMPRE 200 para a Meta (evita re-tentativas em massa).
  let body: {
    entry?: Array<{ changes?: Array<{ value?: Record<string, unknown> }> }>
  }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: true, ignored: 'json_invalido' })
  }

  const createdEventIds: string[] = []

  try {
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value as
          | { messages?: Array<{ id?: string }>; statuses?: Array<{ id?: string }> }
          | undefined
        if (!value) continue

        // Uma entrada de outbox por mensagem inbound (dedup por wamid).
        for (const message of value.messages ?? []) {
          if (!message.id) continue
          const id = await upsertEvent(message.id, { kind: 'message', value, item: message })
          if (id) createdEventIds.push(id)
        }

        // Uma entrada de outbox por status update (dedup por status id).
        for (const status of value.statuses ?? []) {
          if (!status.id) continue
          // status.id repete o wamid da mensagem: chave composta evita colidir
          // com o evento da própria mensagem inbound.
          const externalId = `status:${status.id}:${(status as { status?: string }).status ?? ''}`
          const id = await upsertEvent(externalId, { kind: 'status', value, item: status })
          if (id) createdEventIds.push(id)
        }
      }
    }
  } catch (err) {
    console.error('[meta-whatsapp] falha ao gravar eventos:', err)
    // Mesmo com falha parcial, respondemos 200 e o cron drena o que sobrou.
  }

  // Processamento inline best-effort — NUNCA derruba a resposta 200.
  for (const eventId of createdEventIds) {
    try {
      const event = await prisma.channelEvent.findUnique({
        where: { id: eventId },
        select: { id: true, channelId: true, payload: true, attempts: true, status: true },
      })
      if (!event || (event.status !== 'PENDING' && event.status !== 'FAILED')) continue
      await processChannelEvent(event)
    } catch (err) {
      console.error('[meta-whatsapp] processamento inline falhou (evento fica p/ o cron):', err)
    }
  }

  // A-111: revalida /conversas UMA vez por batch (após o processamento inline),
  // não por evento. Só quando houve item novo neste POST. Best-effort — jamais
  // derruba a resposta 200 para a Meta.
  if (createdEventIds.length > 0) {
    try {
      revalidatePath('/conversas')
    } catch (err) {
      console.error('[meta-whatsapp] revalidatePath /conversas falhou (ignorado):', err)
    }
  }

  return NextResponse.json({ ok: true, received: createdEventIds.length })
}

/**
 * Grava (ou ignora, se duplicado) um item do webhook no outbox.
 * Retorna o id do evento, ou null se já existia (dedup por externalId unique).
 */
async function upsertEvent(
  externalId: string,
  payload: { kind: 'message' | 'status'; value: unknown; item: unknown },
): Promise<string | null> {
  const existing = await prisma.channelEvent.findUnique({
    where: { externalId },
    select: { id: true },
  })
  if (existing) return null // duplicata: ignora (idempotência do webhook)
  try {
    const created = await prisma.channelEvent.create({
      data: {
        externalId,
        payload: payload as object,
        status: 'PENDING',
      },
      select: { id: true },
    })
    return created.id
  } catch (err) {
    // Entregas CONCORRENTES do mesmo payload (a Meta reentrega em paralelo):
    // ambas passam no findUnique e uma create viola o unique (P2002). Tratar
    // POR ITEM como dedup silencioso — sem isto, o throw abortava o batch e
    // itens legítimos do mesmo POST ficavam sem outbox (QA Fase 1, médio 1).
    if (
      typeof err === 'object' && err !== null &&
      (err as { code?: string }).code === 'P2002'
    ) {
      return null
    }
    throw err
  }
}
