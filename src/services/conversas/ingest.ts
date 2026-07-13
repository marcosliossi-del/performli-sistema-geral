import 'server-only'

/**
 * Processor idempotente do outbox de Conversas (decisão R1 do discovery).
 *
 * Cada `ChannelEvent` guarda UM item cru do webhook Meta (uma mensagem inbound
 * OU um status update), já deduplicado por `externalId` (wa message/status id).
 * Este módulo resolve o item para o domínio (Contact/Conversation/Message/Lead)
 * de forma IDEMPOTENTE e transiciona o evento PENDING → PROCESSED | FAILED | DEAD.
 *
 * Chamado em dois pontos (R1): inline best-effort no webhook e pelo cron de 1min.
 * NUNCA lança para o caller — todo erro vira FAILED/DEAD registrado no evento.
 *
 * clientId JAMAIS vem de input externo: é sempre derivado do canal resolvido
 * pelo `phone_number_id` do payload (metadata.phone_number_id).
 */

import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import type {
  ConversationMessageType,
  MessageDeliveryStatus,
} from '@prisma/client'

const MAX_ATTEMPTS = 5

// ── Tipos do payload (subconjunto da Cloud API que tratamos) ─────────────────
// ⚠️ TODO conferir doc oficial: entry[].changes[].value.{messages,statuses,contacts,metadata}
interface WaContact {
  wa_id?: string
  profile?: { name?: string }
}
interface WaReferral {
  source_url?: string
  source_id?: string
  source_type?: string
  headline?: string
  body?: string
  media_type?: string
  ctwa_clid?: string
}
interface WaMessage {
  id?: string
  from?: string
  type?: string
  timestamp?: string
  text?: { body?: string }
  image?: { caption?: string }
  video?: { caption?: string }
  document?: { caption?: string; filename?: string }
  referral?: WaReferral
}
interface WaStatus {
  id?: string
  status?: string
  recipient_id?: string
  timestamp?: string
  errors?: Array<{ code?: number; title?: string; message?: string }>
}
interface WaValue {
  metadata?: { phone_number_id?: string; display_phone_number?: string }
  contacts?: WaContact[]
  messages?: WaMessage[]
  statuses?: WaStatus[]
}
/** Shape gravado em ChannelEvent.payload pelo webhook. */
interface StoredEventPayload {
  kind: 'message' | 'status'
  value: WaValue
  item: WaMessage | WaStatus
}

interface EventRecord {
  id: string
  channelId: string | null
  payload: unknown
  attempts: number
}

export interface ProcessResult {
  ok: boolean
  dead?: boolean
  skipped?: boolean
  error?: string
}

/** Mapeia o `type` da Cloud API para o enum ConversationMessageType. */
function mapMessageType(type: string | undefined): ConversationMessageType {
  switch (type) {
    case 'text':
      return 'TEXT'
    case 'image':
      return 'IMAGE'
    case 'audio':
      return 'AUDIO'
    case 'video':
      return 'VIDEO'
    case 'document':
      return 'DOCUMENT'
    case 'interactive':
      return 'INTERACTIVE'
    case 'template':
      return 'TEMPLATE'
    default:
      return 'UNSUPPORTED'
  }
}

/** Mapeia o `status` da Cloud API para MessageDeliveryStatus. */
function mapDeliveryStatus(status: string | undefined): MessageDeliveryStatus | null {
  switch (status) {
    case 'sent':
      return 'SENT'
    case 'delivered':
      return 'DELIVERED'
    case 'read':
      return 'READ'
    case 'failed':
      return 'FAILED'
    default:
      return null
  }
}

/** Extrai o corpo textual/caption de uma mensagem inbound. */
function extractBody(msg: WaMessage): string | null {
  return (
    msg.text?.body ??
    msg.image?.caption ??
    msg.video?.caption ??
    msg.document?.caption ??
    null
  )
}

/**
 * Garante um pipeline default para o cliente (seed lazy) e devolve o pipeline +
 * o primeiro estágio (menor `order`). Cria "Atendimento" com estágios básicos
 * se o cliente ainda não tem pipeline.
 */
async function ensureDefaultPipeline(
  clientId: string,
): Promise<{ pipelineId: string; firstStageId: string }> {
  const existing = await prisma.conversationPipeline.findFirst({
    where: { clientId },
    orderBy: [{ isDefault: 'desc' }],
    include: { stages: { orderBy: { order: 'asc' }, take: 1 } },
  })
  if (existing && existing.stages.length > 0) {
    return { pipelineId: existing.id, firstStageId: existing.stages[0].id }
  }

  const created = await prisma.conversationPipeline.create({
    data: {
      clientId,
      name: 'Atendimento',
      isDefault: true,
      stages: {
        create: [
          { name: 'Novo', order: 0 },
          { name: 'Em atendimento', order: 1 },
          { name: 'Qualificado', order: 2 },
          { name: 'Ganhou', order: 3, isWon: true },
          { name: 'Perdeu', order: 4, isLost: true },
        ],
      },
    },
    include: { stages: { orderBy: { order: 'asc' }, take: 1 } },
  })
  return { pipelineId: created.id, firstStageId: created.stages[0].id }
}

/** Resolve o canal ATIVO pelo phone_number_id do payload. Lança se ausente/inativo. */
async function resolveChannel(value: WaValue): Promise<{ id: string; clientId: string }> {
  const phoneNumberId = value.metadata?.phone_number_id
  if (!phoneNumberId) {
    throw new Error('Payload sem phone_number_id — não é possível identificar o canal.')
  }
  const channel = await prisma.conversationChannel.findFirst({
    where: { phoneNumberId, type: 'WHATSAPP_CLOUD' },
    select: { id: true, clientId: true, status: true },
  })
  if (!channel) {
    throw new Error(`Nenhum canal cadastrado para o phone_number_id ${phoneNumberId}.`)
  }
  if (channel.status !== 'ACTIVE') {
    throw new Error(`Canal ${channel.id} não está ativo (status atual bloqueia ingestão).`)
  }
  return { id: channel.id, clientId: channel.clientId }
}

/** Processa uma mensagem inbound (idempotente por waMessageId). */
async function handleInbound(
  channel: { id: string; clientId: string },
  value: WaValue,
  msg: WaMessage,
): Promise<void> {
  const waMessageId = msg.id
  if (!waMessageId) throw new Error('Mensagem sem id (wamid) — não processável.')

  // Dedup natural: se a mensagem já existe, nada a fazer.
  const already = await prisma.conversationMessage.findUnique({
    where: { waMessageId },
    select: { id: true },
  })
  if (already) return

  const phone = msg.from ?? value.contacts?.[0]?.wa_id ?? null
  if (!phone) throw new Error('Mensagem sem telefone de origem.')
  const profileName = value.contacts?.[0]?.profile?.name ?? null

  // Contato: upsert manual (precisamos saber se é NOVO para o CTWA).
  const existingContact = await prisma.conversationContact.findUnique({
    where: { clientId_phone: { clientId: channel.clientId, phone } },
    select: { id: true },
  })
  const isNewContact = !existingContact
  const contact = existingContact
    ? await prisma.conversationContact.update({
        where: { id: existingContact.id },
        data: profileName ? { name: profileName } : {},
        select: { id: true },
      })
    : await prisma.conversationContact.create({
        data: { clientId: channel.clientId, phone, name: profileName },
        select: { id: true },
      })

  // Conversa: reusa uma aberta (status != CLOSED) ou cria.
  let conversation = await prisma.conversation.findFirst({
    where: {
      clientId: channel.clientId,
      contactId: contact.id,
      channelId: channel.id,
      status: { not: 'CLOSED' },
    },
    select: { id: true, leadId: true },
  })
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        clientId: channel.clientId,
        contactId: contact.id,
        channelId: channel.id,
        status: 'OPEN',
      },
      select: { id: true, leadId: true },
    })
  }

  const now = msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date()

  // ATÔMICO (QA Fase 1, médio 2): mensagem + carimbo da conversa na MESMA
  // transação. Sem isto, um crash entre os dois deixava a mensagem gravada e o
  // lastInboundAt nunca atualizado — e o retry via dedup (`already`) retornava
  // cedo, fechando a janela de 24h para sempre naquela conversa.
  await prisma.$transaction([
    prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        direction: 'IN',
        type: mapMessageType(msg.type),
        body: extractBody(msg),
        waMessageId,
        status: 'DELIVERED', // recebida = já chegou até nós
        createdAt: now,
      },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: now,
        lastInboundAt: now,
        unreadCount: { increment: 1 },
      },
    }),
  ])

  // CTWA (Click-to-WhatsApp): cria lead SÓ para contato novo com referral.
  const referral = msg.referral
  if (isNewContact && referral && (referral.ctwa_clid || referral.source_url || referral.headline)) {
    const { pipelineId, firstStageId } = await ensureDefaultPipeline(channel.clientId)
    const lead = await prisma.conversationLead.create({
      data: {
        clientId: channel.clientId,
        contactId: contact.id,
        pipelineId,
        stageId: firstStageId,
        source: 'ctwa',
        utm: referral.source_url ? { source_url: referral.source_url } : undefined,
        ctwaClid: referral.ctwa_clid ?? null,
        referral: {
          source_url: referral.source_url ?? null,
          source_id: referral.source_id ?? null,
          source_type: referral.source_type ?? null,
          headline: referral.headline ?? null,
          body: referral.body ?? null,
          media_type: referral.media_type ?? null,
          ctwa_clid: referral.ctwa_clid ?? null,
        },
        status: 'OPEN',
      },
      select: { id: true },
    })
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { leadId: lead.id },
    })
  }
}

/** Processa um status update (sent/delivered/read/failed) por waMessageId. */
async function handleStatus(status: WaStatus): Promise<void> {
  const waMessageId = status.id
  if (!waMessageId) throw new Error('Status sem id de mensagem.')
  const mapped = mapDeliveryStatus(status.status)
  if (!mapped) return // status desconhecido: ignora silenciosamente

  const existing = await prisma.conversationMessage.findUnique({
    where: { waMessageId },
    select: { id: true },
  })
  if (!existing) return // mensagem não rastreada localmente — no-op idempotente

  const errorDetail =
    mapped === 'FAILED'
      ? (status.errors?.[0]?.message ?? status.errors?.[0]?.title ?? 'Falha reportada pela Meta.')
      : null

  await prisma.conversationMessage.update({
    where: { id: existing.id },
    data: { status: mapped, errorDetail },
  })
}

/** Executa o trabalho de um evento; devolve o canal resolvido (p/ auditoria). */
async function handleEvent(
  payload: StoredEventPayload,
): Promise<{ channelId: string; clientId: string }> {
  const channel = await resolveChannel(payload.value)
  if (payload.kind === 'message') {
    await handleInbound(channel, payload.value, payload.item as WaMessage)
  } else {
    await handleStatus(payload.item as WaStatus)
  }
  return { channelId: channel.id, clientId: channel.clientId }
}

/**
 * Processa UM ChannelEvent. Idempotente e à prova de falhas: transiciona o
 * evento e NUNCA lança para o caller.
 *   sucesso        → PROCESSED
 *   falha          → FAILED (attempts+1)
 *   attempts >= 5  → DEAD (+ AuditLog, regra #8)
 */
export async function processChannelEvent(event: EventRecord): Promise<ProcessResult> {
  const attempts = event.attempts + 1
  let payload: StoredEventPayload
  try {
    payload = event.payload as StoredEventPayload
    if (!payload || (payload.kind !== 'message' && payload.kind !== 'status')) {
      throw new Error('Payload do evento em formato inesperado.')
    }
  } catch {
    // Payload irrecuperável: marca DEAD direto (retry não ajuda).
    await prisma.channelEvent.update({
      where: { id: event.id },
      data: { status: 'DEAD', attempts, lastError: 'Payload inválido.', processedAt: new Date() },
    })
    await writeAuditLog({
      action: 'conversas.event.dead',
      entityType: 'ChannelEvent',
      entityId: event.id,
      metadata: { reason: 'payload_invalido' },
    })
    return { ok: false, dead: true, error: 'Payload inválido.' }
  }

  try {
    const resolved = await handleEvent(payload)
    await prisma.channelEvent.update({
      where: { id: event.id },
      data: {
        status: 'PROCESSED',
        attempts,
        lastError: null,
        channelId: resolved.channelId,
        processedAt: new Date(),
      },
    })
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const dead = attempts >= MAX_ATTEMPTS
    await prisma.channelEvent.update({
      where: { id: event.id },
      data: {
        status: dead ? 'DEAD' : 'FAILED',
        attempts,
        lastError: msg.slice(0, 1000),
        ...(dead ? { processedAt: new Date() } : {}),
      },
    })
    if (dead) {
      await writeAuditLog({
        action: 'conversas.event.dead',
        entityType: 'ChannelEvent',
        entityId: event.id,
        metadata: { lastError: msg.slice(0, 500), attempts },
      })
    }
    return { ok: false, dead, error: msg }
  }
}
