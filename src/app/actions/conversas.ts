'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import { can, normalizeRole } from '@/lib/rbac'
import { assertClientMutationAccess, writeAuditLog } from '@/lib/audit'
import { sendTextMessage, getWindowState, ConversasApiError } from '@/services/conversas/cloud-api'
import { encryptSecret } from '@/lib/conversas/crypto'
import type { ConversationStatus } from '@prisma/client'

/** Resultado padrão das mutações do módulo (mensagens pt-BR operacionais). */
type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

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

// ─── FASE 2 — Mutações de supervisão / pipeline / configuração ────────────────
//
// Padrão INEGOCIÁVEL de cada action (CLAUDE.md #2):
//   1. requireSession()                    — autenticação
//   2. can(role, <ação>, 'conversas')      — papel
//   3. posse: clientId DERIVADO da entidade + assertClientMutationAccess
//   4. AuditLog nas ações críticas (assign, status, stage, valor, canal)
//   5. revalidatePath('/conversas')
// Mensagens de erro sempre pt-BR operacionais. Segredos NUNCA logados/retornados.

const CONVERSAS_PATH = '/conversas'

/** Carrega uma conversa + clientId (posse) para as mutações. */
async function loadConversationClient(conversationId: string) {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, clientId: true },
  })
}

/**
 * Atribui (ou desatribui, userId=null) o atendente de uma conversa.
 * Valida que o userId é staff ATIVO. Não valida carteira do atendente (a Arkza
 * distribui livremente entre staff); a posse é sobre o CLIENTE da conversa.
 */
export async function assignConversation(
  conversationId: string,
  userId: string | null,
): Promise<ActionResult> {
  const session = await requireSession()
  const role = normalizeRole(session.role)
  if (!can(role, 'update', 'conversas')) {
    return { ok: false, error: 'Você não tem permissão para atribuir conversas.' }
  }

  const conversation = await loadConversationClient(conversationId)
  if (!conversation) return { ok: false, error: 'Conversa não encontrada.' }
  try {
    await assertClientMutationAccess(session, conversation.clientId, { allowCS: true })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Sem permissão para esta conversa.' }
  }

  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, active: true },
    })
    if (!user || !user.active) {
      return { ok: false, error: 'Atendente inválido ou inativo.' }
    }
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { assignedUserId: userId },
  })
  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'conversas.conversation.assigned',
    entityType: 'Conversation',
    entityId: conversationId,
    clientId: conversation.clientId,
    metadata: { assignedUserId: userId },
  })
  revalidatePath(CONVERSAS_PATH)
  return { ok: true }
}

const statusSchema = z.enum(['OPEN', 'PENDING', 'CLOSED'])

/** Altera o status operacional de uma conversa. */
export async function setConversationStatus(
  conversationId: string,
  status: ConversationStatus,
): Promise<ActionResult> {
  const session = await requireSession()
  const role = normalizeRole(session.role)
  if (!can(role, 'update', 'conversas')) {
    return { ok: false, error: 'Você não tem permissão para alterar o status de conversas.' }
  }
  const parsed = statusSchema.safeParse(status)
  if (!parsed.success) return { ok: false, error: 'Status de conversa inválido.' }

  const conversation = await loadConversationClient(conversationId)
  if (!conversation) return { ok: false, error: 'Conversa não encontrada.' }
  try {
    await assertClientMutationAccess(session, conversation.clientId, { allowCS: true })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Sem permissão para esta conversa.' }
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: parsed.data },
  })
  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'conversas.conversation.status',
    entityType: 'Conversation',
    entityId: conversationId,
    clientId: conversation.clientId,
    metadata: { status: parsed.data },
  })
  revalidatePath(CONVERSAS_PATH)
  return { ok: true }
}

/** Zera o contador de não lidas de uma conversa (abertura pelo atendente). */
export async function markConversationRead(
  conversationId: string,
): Promise<ActionResult> {
  const session = await requireSession()
  const role = normalizeRole(session.role)
  if (!can(role, 'update', 'conversas')) {
    return { ok: false, error: 'Você não tem permissão para esta conversa.' }
  }
  const conversation = await loadConversationClient(conversationId)
  if (!conversation) return { ok: false, error: 'Conversa não encontrada.' }
  try {
    await assertClientMutationAccess(session, conversation.clientId, { allowCS: true })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Sem permissão para esta conversa.' }
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { unreadCount: 0 },
  })
  revalidatePath(CONVERSAS_PATH)
  return { ok: true }
}

/**
 * Move um lead para outro estágio do MESMO pipeline. Atualiza stageEnteredAt e
 * deriva o status (WON/LOST/OPEN) a partir das flags do estágio destino.
 */
export async function moveLeadStage(
  leadId: string,
  stageId: string,
  lostReason?: string,
): Promise<ActionResult> {
  const session = await requireSession()
  const role = normalizeRole(session.role)
  if (!can(role, 'update', 'conversas')) {
    return { ok: false, error: 'Você não tem permissão para mover leads no funil.' }
  }

  const lead = await prisma.conversationLead.findUnique({
    where: { id: leadId },
    select: { id: true, clientId: true, pipelineId: true, stageId: true },
  })
  if (!lead) return { ok: false, error: 'Lead não encontrado.' }
  try {
    await assertClientMutationAccess(session, lead.clientId, { allowCS: true })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Sem permissão para este lead.' }
  }

  // Estágio destino DEVE pertencer ao pipeline do lead (sem cross-pipeline).
  const stage = await prisma.conversationStage.findUnique({
    where: { id: stageId },
    select: { id: true, pipelineId: true, isWon: true, isLost: true },
  })
  if (!stage || stage.pipelineId !== lead.pipelineId) {
    return { ok: false, error: 'Estágio inválido para o funil deste lead.' }
  }

  const status = stage.isWon ? 'WON' : stage.isLost ? 'LOST' : 'OPEN'
  await prisma.conversationLead.update({
    where: { id: leadId },
    data: {
      stageId,
      status,
      stageEnteredAt: new Date(),
      lostReason: stage.isLost ? (lostReason?.trim() || null) : null,
    },
  })
  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'conversas.lead.stageMoved',
    entityType: 'ConversationLead',
    entityId: leadId,
    clientId: lead.clientId,
    metadata: { fromStageId: lead.stageId, toStageId: stageId, status },
  })
  revalidatePath(CONVERSAS_PATH)
  return { ok: true }
}

const valueSchema = z
  .number({ error: 'Informe um valor numérico.' })
  .min(0, 'O valor não pode ser negativo.')
  .max(99_999_999.99, 'Valor acima do limite permitido.')

/** Define o valor de monetização de um lead (null = limpar). */
export async function upsertLeadValue(
  leadId: string,
  value: number | null,
): Promise<ActionResult> {
  const session = await requireSession()
  const role = normalizeRole(session.role)
  if (!can(role, 'update', 'conversas')) {
    return { ok: false, error: 'Você não tem permissão para editar o valor do lead.' }
  }
  if (value !== null) {
    const parsed = valueSchema.safeParse(value)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Valor inválido.' }
    }
  }

  const lead = await prisma.conversationLead.findUnique({
    where: { id: leadId },
    select: { id: true, clientId: true },
  })
  if (!lead) return { ok: false, error: 'Lead não encontrado.' }
  try {
    await assertClientMutationAccess(session, lead.clientId, { allowCS: true })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Sem permissão para este lead.' }
  }

  await prisma.conversationLead.update({
    where: { id: leadId },
    data: { value },
  })
  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'conversas.lead.valueSet',
    entityType: 'ConversationLead',
    entityId: leadId,
    clientId: lead.clientId,
    metadata: { value },
  })
  revalidatePath(CONVERSAS_PATH)
  return { ok: true }
}

/** Estágios default do 'Funil WhatsApp' (ordem canônica). */
const DEFAULT_STAGES = [
  { name: 'Novo', order: 0, isWon: false, isLost: false, isConversion: false },
  { name: 'Em atendimento', order: 1, isWon: false, isLost: false, isConversion: false },
  { name: 'Qualificado', order: 2, isWon: false, isLost: false, isConversion: false },
  { name: 'Proposta', order: 3, isWon: false, isLost: false, isConversion: false },
  { name: 'Ganhou', order: 4, isWon: true, isLost: false, isConversion: true },
  { name: 'Perdeu', order: 5, isWon: false, isLost: true, isConversion: false },
] as const

/**
 * Cria o pipeline default do cliente se ele ainda não tiver NENHUM.
 * Idempotente: chamada repetida não duplica. ADMIN ou SUPERVISOR_TRAFEGO.
 */
export async function createDefaultPipeline(
  clientId: string,
): Promise<ActionResult<{ pipelineId: string; created: boolean }>> {
  const session = await requireSession()
  const role = normalizeRole(session.role)
  if (role !== 'ADMIN' && role !== 'SUPERVISOR_TRAFEGO') {
    return { ok: false, error: 'Apenas administradores ou supervisores criam o funil padrão.' }
  }
  try {
    await assertClientMutationAccess(session, clientId)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Sem permissão para este cliente.' }
  }

  const existing = await prisma.conversationPipeline.findFirst({
    where: { clientId },
    select: { id: true },
  })
  if (existing) {
    return { ok: true, data: { pipelineId: existing.id, created: false } }
  }

  const pipeline = await prisma.conversationPipeline.create({
    data: {
      clientId,
      name: 'Funil WhatsApp',
      isDefault: true,
      stages: { create: DEFAULT_STAGES.map((s) => ({ ...s })) },
    },
    select: { id: true },
  })
  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'conversas.pipeline.created',
    entityType: 'ConversationPipeline',
    entityId: pipeline.id,
    clientId,
    metadata: { name: 'Funil WhatsApp' },
  })
  revalidatePath(CONVERSAS_PATH)
  return { ok: true, data: { pipelineId: pipeline.id, created: true } }
}

const channelSchema = z.object({
  phoneNumberId: z.string().min(1, 'Informe o phoneNumberId do canal.'),
  wabaId: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  accessToken: z.string().min(1, 'Informe o token de acesso do canal.'),
  verifyToken: z.string().min(1).optional(),
})

/**
 * Cria um canal WhatsApp Cloud para um cliente. ADMIN only.
 * O accessToken é CIFRADO (AES-256-GCM) em `credentials` e NUNCA é logado nem
 * retornado. Canal nasce em status PENDING (aguarda verificação/webhook).
 */
export async function createConversationChannel(
  clientId: string,
  input: {
    phoneNumberId: string
    wabaId?: string
    displayName?: string
    accessToken: string
    verifyToken?: string
  },
): Promise<ActionResult<{ channelId: string }>> {
  const session = await requireSession()
  const role = normalizeRole(session.role)
  if (role !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores configuram canais de WhatsApp.' }
  }
  try {
    await assertClientMutationAccess(session, clientId)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Sem permissão para este cliente.' }
  }

  const parsed = channelSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados do canal inválidos.' }
  }
  const { phoneNumberId, wabaId, displayName, accessToken, verifyToken } = parsed.data

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } })
  if (!client) return { ok: false, error: 'Cliente não encontrado.' }

  // Unicidade GLOBAL (type, phoneNumberId): impede misroteamento de tenant.
  const clash = await prisma.conversationChannel.findFirst({
    where: { type: 'WHATSAPP_CLOUD', phoneNumberId },
    select: { id: true },
  })
  if (clash) {
    return { ok: false, error: 'Este número de WhatsApp já está vinculado a um canal.' }
  }

  let credentials: string
  try {
    // NUNCA persistir/logar o token em claro — só o payload cifrado.
    credentials = encryptSecret(JSON.stringify({ accessToken }))
  } catch {
    return { ok: false, error: 'Não foi possível proteger as credenciais do canal (chave de criptografia ausente).' }
  }

  const channel = await prisma.conversationChannel.create({
    data: {
      clientId,
      type: 'WHATSAPP_CLOUD',
      status: 'PENDING',
      phoneNumberId,
      wabaId: wabaId ?? null,
      displayName: displayName ?? null,
      credentials,
      webhookSecret: verifyToken ?? null,
    },
    select: { id: true },
  })
  // AuditLog SEM o token (regra de segredo).
  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'conversas.channel.created',
    entityType: 'ConversationChannel',
    entityId: channel.id,
    clientId,
    metadata: { phoneNumberId, wabaId: wabaId ?? null, displayName: displayName ?? null },
  })
  revalidatePath(CONVERSAS_PATH)
  return { ok: true, data: { channelId: channel.id } }
}
