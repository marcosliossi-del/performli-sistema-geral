import 'server-only'

/**
 * DAL do módulo Conversas (CRM conversacional) — FASE 2 (leitura).
 *
 * Diretriz de produto (Marcos, discovery §6.0): supervisão de atendimento por
 * vendedor, estágio dos leads, monetização. TODA leitura aqui:
 *   1. requireSession()                    — autenticação
 *   2. can(role, 'view', 'conversas')      — papel
 *   3. escopo por papel (scopeClients)     — posse/linha (multi-tenant)
 *
 * Multi-tenant INEGOCIÁVEL: toda query filtra `clientId` (direta ou via relação
 * `client`). GESTOR_TRAFEGO só enxerga a carteira (ClientAssignment); os demais
 * papéis têm leitura ampla (scopeClients retorna {}).
 *
 * Sem N+1: agregações usam groupBy/aggregate; listas usam include/batch.
 */

import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { normalizeRole, can, scopeClients } from '@/lib/rbac'
import type { Role5 } from '@/lib/rbac'
import {
  getWindowState,
  type WindowState,
} from '@/services/conversas/cloud-api'
import type {
  ConversationStatus,
  ConversationLeadStatus,
  Prisma,
} from '@prisma/client'

// ─── Erros ──────────────────────────────────────────────────────────────────

/** Erro de leitura com mensagem operacional pt-BR (para a UI exibir direto). */
export class ConversasReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConversasReadError'
  }
}

// ─── Tipos exportados (consumidos pela UI) ────────────────────────────────────

export interface ConversationInboxItem {
  id: string
  clientId: string
  status: ConversationStatus
  unreadCount: number
  lastMessageAt: Date | null
  /** Estado da janela de 24h (base p/ badge "fora da janela"). */
  window: WindowState
  contact: {
    id: string
    name: string | null
    phone: string | null
  }
  /** Prévia (até 80 chars) da última mensagem, com direção. */
  lastMessage: {
    preview: string
    direction: 'IN' | 'OUT'
    at: Date
  } | null
  /** Atendente atribuído (null = sem responsável). */
  assignee: { id: string; name: string } | null
  /** Lead vinculado + estágio (null = conversa sem lead no funil). */
  lead: {
    id: string
    stageId: string
    stageName: string | null
    status: ConversationLeadStatus
  } | null
}

export interface ConversationInboxPage {
  items: ConversationInboxItem[]
  /** id da última conversa desta página; passe em `cursor` para a próxima. */
  nextCursor: string | null
  lastUpdated: Date
}

export interface ThreadMessage {
  id: string
  direction: 'IN' | 'OUT'
  type: string
  body: string | null
  mediaUrl: string | null
  status: string
  sentByBot: boolean
  sentByUserId: string | null
  createdAt: Date
}

export interface ThreadData {
  conversation: {
    id: string
    clientId: string
    status: ConversationStatus
    unreadCount: number
    assignee: { id: string; name: string } | null
  }
  contact: {
    id: string
    name: string | null
    phone: string | null
    email: string | null
  }
  channel: {
    id: string
    type: string
    status: string
    displayName: string | null
  }
  lead: {
    id: string
    stageId: string
    stageName: string | null
    status: ConversationLeadStatus
    value: number | null
  } | null
  window: WindowState
  messages: ThreadMessage[]
  lastUpdated: Date
}

export interface PipelineBoardStage {
  id: string
  name: string
  order: number
  color: string | null
  isWon: boolean
  isLost: boolean
  isConversion: boolean
  /** Soma de `value` dos leads deste estágio (monetização em pipeline). */
  totalValue: number
  leads: PipelineBoardLead[]
}

export interface PipelineBoardLead {
  id: string
  contactId: string
  contactName: string | null
  contactPhone: string | null
  value: number | null
  source: string | null
  status: ConversationLeadStatus
  owner: { id: string; name: string } | null
  /** Dias no estágio atual (base stageEnteredAt). */
  daysInStage: number
}

export interface PipelineBoardData {
  pipeline: { id: string; name: string } | null
  stages: PipelineBoardStage[]
  lastUpdated: Date
}

export interface SupervisionAttendantRow {
  userId: string
  name: string
  openConversations: number
  pendingConversations: number
  messagesSent7d: number
  /** Tempo médio de 1ª resposta (min), últimos 7 dias. null = sem amostra. */
  avgFirstResponseMin7d: number | null
  /** Tempo médio de 1ª resposta (min), últimos 30 dias. null = sem amostra. */
  avgFirstResponseMin30d: number | null
}

export interface SupervisionData {
  attendants: SupervisionAttendantRow[]
  /** Conversas sem atendente atribuído (fila não distribuída). */
  unassignedOpen: number
  pipeline: {
    stageId: string
    stageName: string
    leadCount: number
    totalValue: number
  }[]
  monetization: {
    /** Soma do `value` de leads WON com entrada no estágio nos últimos 30d. */
    wonValue30d: number
    wonCount30d: number
    lostCount30d: number
    /** WON / (WON + LOST) fechados em 30d. null = nada fechado. */
    winRate: number | null
  }
  lastUpdated: Date
}

// ─── Helpers de sessão/escopo ─────────────────────────────────────────────────

interface Viewer {
  userId: string
  role: Role5
}

/** requireSession + gate de papel 'view' para o módulo conversas. */
async function requireConversasViewer(): Promise<Viewer> {
  const session = await requireSession()
  const role = normalizeRole(session.role)
  if (!can(role, 'view', 'conversas')) {
    throw new ConversasReadError('Você não tem acesso ao módulo de Conversas.')
  }
  return { userId: session.userId, role }
}

/**
 * Constrói o filtro de conversas/leads no escopo do papel + clientId opcional.
 * `client: scopeClients(...)` restringe GESTOR_TRAFEGO à carteira; demais papéis
 * recebem {} (leitura ampla). Se `clientId` vier, é intersectado (o escopo ainda
 * manda — GESTOR fora da carteira volta lista vazia).
 */
function clientScopeFilter(
  viewer: Viewer,
  clientId?: string,
): Prisma.ClientWhereInput {
  const scope = scopeClients(viewer.role, viewer.userId)
  if (clientId) return { AND: [{ id: clientId }, scope] }
  return scope
}

/**
 * Valida posse de leitura de UM cliente (clientId derivado da entidade, nunca de
 * input direto). GESTOR_TRAFEGO só passa se o cliente estiver na carteira.
 * Retorna true/false — o caller decide a mensagem.
 */
async function canReadClient(viewer: Viewer, clientId: string): Promise<boolean> {
  const found = await prisma.client.findFirst({
    where: { AND: [{ id: clientId }, scopeClients(viewer.role, viewer.userId)] },
    select: { id: true },
  })
  return !!found
}

/** Busca nomes de usuários em lote (evita N+1 ao resolver atendentes/owners). */
async function loadUserNames(ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (unique.length === 0) return new Map()
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  })
  return new Map(users.map((u) => [u.id, u.name]))
}

const INBOX_PAGE_SIZE = 30
const THREAD_MESSAGE_LIMIT = 100
const DAY_MS = 24 * 60 * 60 * 1000

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS))
}

// ─── 1. Inbox ─────────────────────────────────────────────────────────────────

export async function getConversationsInbox(params: {
  clientId?: string
  status?: ConversationStatus
  assignedUserId?: string
  cursor?: string
} = {}): Promise<ConversationInboxPage> {
  const viewer = await requireConversasViewer()

  const where: Prisma.ConversationWhereInput = {
    client: clientScopeFilter(viewer, params.clientId),
    ...(params.status ? { status: params.status } : {}),
    ...(params.assignedUserId ? { assignedUserId: params.assignedUserId } : {}),
  }

  const rows = await prisma.conversation.findMany({
    where,
    // lastMessageAt desc; id como desempate estável p/ cursor.
    orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
    take: INBOX_PAGE_SIZE + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      clientId: true,
      status: true,
      unreadCount: true,
      lastMessageAt: true,
      lastInboundAt: true,
      leadId: true,
      assignedUserId: true,
      contact: { select: { id: true, name: true, phone: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { body: true, type: true, direction: true, createdAt: true },
      },
    },
  })

  const hasMore = rows.length > INBOX_PAGE_SIZE
  const pageRows = hasMore ? rows.slice(0, INBOX_PAGE_SIZE) : rows

  // Resolve nomes de atendentes e estágios de lead em lote (sem N+1).
  const assigneeNames = await loadUserNames(
    pageRows.map((r) => r.assignedUserId).filter((v): v is string => !!v),
  )
  const leadIds = pageRows.map((r) => r.leadId).filter((v): v is string => !!v)
  const leads = leadIds.length
    ? await prisma.conversationLead.findMany({
        where: { id: { in: leadIds } },
        select: { id: true, stageId: true, status: true },
      })
    : []
  const leadMap = new Map(leads.map((l) => [l.id, l]))
  const stageIds = Array.from(new Set(leads.map((l) => l.stageId)))
  const stages = stageIds.length
    ? await prisma.conversationStage.findMany({
        where: { id: { in: stageIds } },
        select: { id: true, name: true },
      })
    : []
  const stageNameMap = new Map(stages.map((s) => [s.id, s.name]))

  const now = new Date()
  const items: ConversationInboxItem[] = pageRows.map((r) => {
    const last = r.messages[0]
    const lead = r.leadId ? leadMap.get(r.leadId) : undefined
    return {
      id: r.id,
      clientId: r.clientId,
      status: r.status,
      unreadCount: r.unreadCount,
      lastMessageAt: r.lastMessageAt,
      window: getWindowState({ lastInboundAt: r.lastInboundAt }, now),
      contact: { id: r.contact.id, name: r.contact.name, phone: r.contact.phone },
      lastMessage: last
        ? {
            preview: previewOf(last.body, last.type),
            direction: last.direction,
            at: last.createdAt,
          }
        : null,
      assignee: r.assignedUserId
        ? { id: r.assignedUserId, name: assigneeNames.get(r.assignedUserId) ?? 'Atendente' }
        : null,
      lead: lead
        ? {
            id: lead.id,
            stageId: lead.stageId,
            stageName: stageNameMap.get(lead.stageId) ?? null,
            status: lead.status,
          }
        : null,
    }
  })

  return {
    items,
    nextCursor: hasMore ? pageRows[pageRows.length - 1]!.id : null,
    lastUpdated: now,
  }
}

/** Prévia de 80 chars; tipos de mídia viram rótulo operacional. */
function previewOf(body: string | null, type: string): string {
  if (body && body.trim()) return body.trim().slice(0, 80)
  switch (type) {
    case 'IMAGE': return '[imagem]'
    case 'AUDIO': return '[áudio]'
    case 'VIDEO': return '[vídeo]'
    case 'DOCUMENT': return '[documento]'
    case 'TEMPLATE': return '[mensagem de template]'
    case 'INTERACTIVE': return '[mensagem interativa]'
    default: return '[sem conteúdo]'
  }
}

// ─── 2. Thread ────────────────────────────────────────────────────────────────

export async function getConversationThread(
  conversationId: string,
): Promise<ThreadData> {
  const viewer = await requireConversasViewer()

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      clientId: true,
      status: true,
      unreadCount: true,
      lastInboundAt: true,
      leadId: true,
      assignedUserId: true,
      contact: { select: { id: true, name: true, phone: true, email: true } },
      channel: { select: { id: true, type: true, status: true, displayName: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: THREAD_MESSAGE_LIMIT,
        select: {
          id: true,
          direction: true,
          type: true,
          body: true,
          mediaUrl: true,
          status: true,
          sentByBot: true,
          sentByUserId: true,
          createdAt: true,
        },
      },
    },
  })

  if (!conversation) {
    throw new ConversasReadError('Conversa não encontrada.')
  }
  // Posse: clientId vem da conversa, validado contra o escopo do papel.
  if (!(await canReadClient(viewer, conversation.clientId))) {
    throw new ConversasReadError('Você não tem acesso a esta conversa.')
  }

  const assigneeName = conversation.assignedUserId
    ? (await loadUserNames([conversation.assignedUserId])).get(conversation.assignedUserId) ?? 'Atendente'
    : null

  let lead: ThreadData['lead'] = null
  if (conversation.leadId) {
    const l = await prisma.conversationLead.findUnique({
      where: { id: conversation.leadId },
      select: { id: true, stageId: true, status: true, value: true },
    })
    if (l) {
      const stage = await prisma.conversationStage.findUnique({
        where: { id: l.stageId },
        select: { name: true },
      })
      lead = {
        id: l.id,
        stageId: l.stageId,
        stageName: stage?.name ?? null,
        status: l.status,
        value: l.value ? Number(l.value) : null,
      }
    }
  }

  const now = new Date()
  return {
    conversation: {
      id: conversation.id,
      clientId: conversation.clientId,
      status: conversation.status,
      unreadCount: conversation.unreadCount,
      assignee: conversation.assignedUserId
        ? { id: conversation.assignedUserId, name: assigneeName! }
        : null,
    },
    contact: conversation.contact,
    channel: conversation.channel,
    lead,
    window: getWindowState({ lastInboundAt: conversation.lastInboundAt }, now),
    // messages vieram desc (últimas 100); a UI lê em ordem cronológica asc.
    messages: conversation.messages.slice().reverse(),
    lastUpdated: now,
  }
}

// ─── 3. Pipeline board ────────────────────────────────────────────────────────

export async function getPipelineBoard(clientId: string): Promise<PipelineBoardData> {
  const viewer = await requireConversasViewer()
  if (!(await canReadClient(viewer, clientId))) {
    throw new ConversasReadError('Você não tem acesso ao funil deste cliente.')
  }

  const now = new Date()
  const pipeline = await prisma.conversationPipeline.findFirst({
    where: { clientId, isDefault: true },
    select: {
      id: true,
      name: true,
      stages: {
        orderBy: { order: 'asc' },
        select: {
          id: true, name: true, order: true, color: true,
          isWon: true, isLost: true, isConversion: true,
        },
      },
    },
  })

  if (!pipeline) {
    return { pipeline: null, stages: [], lastUpdated: now }
  }

  const leads = await prisma.conversationLead.findMany({
    where: { clientId, pipelineId: pipeline.id, deletedAt: null },
    select: {
      id: true, contactId: true, stageId: true, value: true, source: true,
      status: true, ownerUserId: true, stageEnteredAt: true,
      contact: { select: { name: true, phone: true } },
    },
  })

  const ownerNames = await loadUserNames(
    leads.map((l) => l.ownerUserId).filter((v): v is string => !!v),
  )

  const leadsByStage = new Map<string, PipelineBoardLead[]>()
  for (const l of leads) {
    const card: PipelineBoardLead = {
      id: l.id,
      contactId: l.contactId,
      contactName: l.contact.name,
      contactPhone: l.contact.phone,
      value: l.value ? Number(l.value) : null,
      source: l.source,
      status: l.status,
      owner: l.ownerUserId
        ? { id: l.ownerUserId, name: ownerNames.get(l.ownerUserId) ?? 'Responsável' }
        : null,
      daysInStage: daysBetween(l.stageEnteredAt, now),
    }
    const arr = leadsByStage.get(l.stageId) ?? []
    arr.push(card)
    leadsByStage.set(l.stageId, arr)
  }

  const stages: PipelineBoardStage[] = pipeline.stages.map((s) => {
    const stageLeads = leadsByStage.get(s.id) ?? []
    return {
      ...s,
      totalValue: stageLeads.reduce((sum, l) => sum + (l.value ?? 0), 0),
      leads: stageLeads,
    }
  })

  return {
    pipeline: { id: pipeline.id, name: pipeline.name },
    stages,
    lastUpdated: now,
  }
}

// ─── 4. Supervision dashboard ─────────────────────────────────────────────────

export async function getSupervisionDashboard(params: {
  clientId?: string
} = {}): Promise<SupervisionData> {
  const viewer = await requireConversasViewer()
  if (params.clientId && !(await canReadClient(viewer, params.clientId))) {
    throw new ConversasReadError('Você não tem acesso a este cliente.')
  }

  const now = new Date()
  const since7d = new Date(now.getTime() - 7 * DAY_MS)
  const since30d = new Date(now.getTime() - 30 * DAY_MS)

  const convScope: Prisma.ConversationWhereInput = {
    client: clientScopeFilter(viewer, params.clientId),
  }
  const leadScope: Prisma.ConversationLeadWhereInput = {
    client: clientScopeFilter(viewer, params.clientId),
    deletedAt: null,
  }

  // ── Conversas abertas/pendentes por atendente (groupBy — sem N+1) ──
  const byAssignee = await prisma.conversation.groupBy({
    by: ['assignedUserId', 'status'],
    where: { ...convScope, status: { in: ['OPEN', 'PENDING'] } },
    _count: { _all: true },
  })

  // ── Mensagens OUT humanas enviadas nos últimos 7d por atendente ──
  const sentByUser = await prisma.conversationMessage.groupBy({
    by: ['sentByUserId'],
    where: {
      direction: 'OUT',
      sentByUserId: { not: null },
      createdAt: { gte: since7d },
      conversation: convScope,
    },
    _count: { _all: true },
  })

  // ── Tempo de 1ª resposta (aproximação documentada) ──
  // Amostra: conversas do escopo com atividade nos últimos 30d. Para cada uma,
  // 1ª resposta = 1ª msg OUT HUMANA (sentByUserId != null) com createdAt após a
  // 1ª msg IN. Atribuída ao atendente que respondeu (sentByUserId). Bucketizada
  // em 7d/30d pela data da resposta. LIMITAÇÃO: só considera conversas cuja 1ª
  // troca (IN→OUT) tenha ocorrido dentro da janela de 30d de mensagens carregadas
  // — casos com IN muito antigo e OUT recente podem não ter o IN na amostra e são
  // ignorados (não distorcem a média, apenas reduzem a amostra). Query única de
  // mensagens (2 queries totais: conversas + mensagens), sem N+1.
  const convRows = await prisma.conversation.findMany({
    where: { ...convScope, lastMessageAt: { gte: since30d } },
    select: { id: true },
  })
  const convIds = convRows.map((c) => c.id)

  const firstResponse = { d7: new Map<string, number[]>(), d30: new Map<string, number[]>() }
  if (convIds.length > 0) {
    const msgs = await prisma.conversationMessage.findMany({
      where: {
        conversationId: { in: convIds },
        createdAt: { gte: since30d },
        OR: [
          { direction: 'IN' },
          { direction: 'OUT', sentByUserId: { not: null } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: { conversationId: true, direction: true, sentByUserId: true, createdAt: true },
    })

    const firstInAt = new Map<string, Date>()
    const responded = new Set<string>()
    for (const m of msgs) {
      if (m.direction === 'IN') {
        if (!firstInAt.has(m.conversationId)) firstInAt.set(m.conversationId, m.createdAt)
        continue
      }
      // OUT humana: só a PRIMEIRA após existir um IN conta como 1ª resposta.
      if (responded.has(m.conversationId)) continue
      const inAt = firstInAt.get(m.conversationId)
      if (!inAt || m.createdAt < inAt || !m.sentByUserId) continue
      responded.add(m.conversationId)
      const minutes = (m.createdAt.getTime() - inAt.getTime()) / 60_000
      pushMetric(firstResponse.d30, m.sentByUserId, minutes)
      if (m.createdAt >= since7d) pushMetric(firstResponse.d7, m.sentByUserId, minutes)
    }
  }

  // ── Montagem por atendente ──
  const openByUser = new Map<string, number>()
  const pendingByUser = new Map<string, number>()
  let unassignedOpen = 0
  for (const g of byAssignee) {
    const count = g._count._all
    if (!g.assignedUserId) {
      if (g.status === 'OPEN' || g.status === 'PENDING') unassignedOpen += count
      continue
    }
    if (g.status === 'OPEN') openByUser.set(g.assignedUserId, count)
    if (g.status === 'PENDING') pendingByUser.set(g.assignedUserId, count)
  }
  const sentMap = new Map<string, number>()
  for (const g of sentByUser) {
    if (g.sentByUserId) sentMap.set(g.sentByUserId, g._count._all)
  }

  const attendantIds = Array.from(new Set([
    ...openByUser.keys(),
    ...pendingByUser.keys(),
    ...sentMap.keys(),
    ...firstResponse.d30.keys(),
  ]))
  const names = await loadUserNames(attendantIds)

  const attendants: SupervisionAttendantRow[] = attendantIds.map((id) => ({
    userId: id,
    name: names.get(id) ?? 'Atendente',
    openConversations: openByUser.get(id) ?? 0,
    pendingConversations: pendingByUser.get(id) ?? 0,
    messagesSent7d: sentMap.get(id) ?? 0,
    avgFirstResponseMin7d: avgOf(firstResponse.d7.get(id)),
    avgFirstResponseMin30d: avgOf(firstResponse.d30.get(id)),
  }))
  attendants.sort((a, b) => b.openConversations - a.openConversations)

  // ── Pipeline: leads por estágio + valor somado ──
  const leadsByStage = await prisma.conversationLead.groupBy({
    by: ['stageId'],
    where: { ...leadScope, status: 'OPEN' },
    _count: { _all: true },
    _sum: { value: true },
  })
  const pipelineStageIds = leadsByStage.map((g) => g.stageId)
  const pipelineStages = pipelineStageIds.length
    ? await prisma.conversationStage.findMany({
        where: { id: { in: pipelineStageIds } },
        select: { id: true, name: true, order: true },
      })
    : []
  const stageMeta = new Map(pipelineStages.map((s) => [s.id, s]))
  const pipeline = leadsByStage
    .map((g) => ({
      stageId: g.stageId,
      stageName: stageMeta.get(g.stageId)?.name ?? 'Estágio',
      order: stageMeta.get(g.stageId)?.order ?? 0,
      leadCount: g._count._all,
      totalValue: g._sum.value ? Number(g._sum.value) : 0,
    }))
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...rest }) => rest)

  // ── Monetização: WON/LOST fechados nos últimos 30d (proxy stageEnteredAt) ──
  const [wonAgg, lostCount] = await Promise.all([
    prisma.conversationLead.aggregate({
      where: { ...leadScope, status: 'WON', stageEnteredAt: { gte: since30d } },
      _sum: { value: true },
      _count: { _all: true },
    }),
    prisma.conversationLead.count({
      where: { ...leadScope, status: 'LOST', stageEnteredAt: { gte: since30d } },
    }),
  ])
  const wonCount30d = wonAgg._count._all
  const closed = wonCount30d + lostCount

  return {
    attendants,
    unassignedOpen,
    pipeline,
    monetization: {
      wonValue30d: wonAgg._sum.value ? Number(wonAgg._sum.value) : 0,
      wonCount30d,
      lostCount30d: lostCount,
      winRate: closed > 0 ? wonCount30d / closed : null,
    },
    lastUpdated: now,
  }
}

function pushMetric(map: Map<string, number[]>, key: string, value: number): void {
  const arr = map.get(key) ?? []
  arr.push(value)
  map.set(key, arr)
}

function avgOf(values: number[] | undefined): number | null {
  if (!values || values.length === 0) return null
  const sum = values.reduce((a, b) => a + b, 0)
  return Math.round((sum / values.length) * 10) / 10
}
