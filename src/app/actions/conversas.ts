'use server'

import { requireSession } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import { can, normalizeRole } from '@/lib/rbac'
import { assertClientMutationAccess, writeAuditLog } from '@/lib/audit'
import { sendTextMessage, getWindowState, ConversasApiError } from '@/services/conversas/cloud-api'

/**
 * Envio outbound mínimo de mensagem numa conversa (gate da Fase 1).
 *
 * Camadas de segurança (regra #2 — autenticação + papel + posse):
 *   1. requireSession()                          — autenticação
 *   2. can(role, 'update', 'conversas')          — papel
 *   3. assertClientMutationAccess(clientId)      — posse (clientId DERIVADO da
 *      conversa, NUNCA de input)
 *   4. guard da janela de 24h                    — regra de negócio da Cloud API
 *
 * Erros retornam { ok:false, error } em pt-BR (throw de server action é redigido
 * pelo Next e perde o motivo operacional).
 */
export async function sendConversationMessage(
  conversationId: string,
  body: string,
): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const session = await requireSession()
  const role = normalizeRole(session.role)

  if (!can(role, 'update', 'conversas')) {
    return { ok: false, error: 'Você não tem permissão para responder conversas.' }
  }

  const text = body?.trim()
  if (!text) {
    return { ok: false, error: 'A mensagem não pode estar vazia.' }
  }
  if (text.length > 4096) {
    return { ok: false, error: 'A mensagem excede o limite de 4096 caracteres do WhatsApp.' }
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      clientId: true,
      lastInboundAt: true,
      contact: { select: { phone: true } },
      channel: { select: { id: true, phoneNumberId: true, credentials: true, status: true } },
    },
  })
  if (!conversation) {
    return { ok: false, error: 'Conversa não encontrada.' }
  }

  // Posse: clientId vem SEMPRE da conversa (nunca do caller).
  try {
    await assertClientMutationAccess(session, conversation.clientId, { allowCS: true })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Sem permissão para esta conversa.' }
  }

  if (conversation.channel.status !== 'ACTIVE') {
    return { ok: false, error: 'O canal desta conversa não está ativo.' }
  }
  if (!conversation.contact.phone) {
    return { ok: false, error: 'O contato não tem um telefone válido para envio.' }
  }

  // Guard da janela de 24h: texto livre só com janela aberta.
  const window = getWindowState({ lastInboundAt: conversation.lastInboundAt })
  if (!window.open) {
    return {
      ok: false,
      error: 'Fora da janela de 24h — use um template aprovado para reabrir a conversa.',
    }
  }

  let waMessageId: string
  try {
    waMessageId = await sendTextMessage(
      {
        id: conversation.channel.id,
        phoneNumberId: conversation.channel.phoneNumberId,
        credentials: conversation.channel.credentials,
      },
      conversation.contact.phone,
      text,
    )
  } catch (err) {
    if (err instanceof ConversasApiError) return { ok: false, error: err.message }
    return { ok: false, error: 'Não foi possível enviar a mensagem agora. Tente novamente.' }
  }

  const now = new Date()
  await prisma.conversationMessage.create({
    data: {
      conversationId: conversation.id,
      direction: 'OUT',
      type: 'TEXT',
      body: text,
      waMessageId,
      status: 'SENT',
      sentByUserId: session.userId,
    },
  })
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: now },
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'conversas.message.sent',
    entityType: 'Conversation',
    entityId: conversation.id,
    clientId: conversation.clientId,
    metadata: { waMessageId },
  })

  return { ok: true, messageId: waMessageId }
}
