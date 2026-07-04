import 'server-only'
import { prisma } from '@/lib/prisma'

/**
 * Resolve a CS responsável por um cliente.
 * 1) CS atribuída ao cliente (ClientAssignment com user.operationalRole = CS);
 * 2) fallback: CS global da agência (user ativo mais antigo com operationalRole = CS).
 * Centraliza a lógica que antes vivia duplicada (seed-suporte / offboarding / feedback).
 */
export async function resolveClientCs(
  clientId: string,
): Promise<{ id: string; name: string } | null> {
  const assigned = await prisma.clientAssignment.findFirst({
    where: { clientId, user: { operationalRole: 'CS', active: true } },
    select: { user: { select: { id: true, name: true } } },
    orderBy: { assignedAt: 'asc' },
  })
  if (assigned?.user) return assigned.user

  const global = await prisma.user.findFirst({
    where: { operationalRole: 'CS', active: true },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  })
  return global ?? null
}

/**
 * Publica uma mensagem no canal interno do cliente (ClientChat), garantindo o
 * chat via upsert. `authorUserId` é obrigatório (FK) — normalmente o gestor da
 * sessão. `mentions` são userIds mencionados (@) — ex.: a CS no handoff do
 * relatório. NÃO lança: uma falha ao postar não pode derrubar o fluxo-pai.
 */
export async function postClientChatMessage(
  clientId: string,
  authorUserId: string,
  content: string,
  mentions: string[] = [],
): Promise<boolean> {
  try {
    const chat = await prisma.clientChat.upsert({
      where: { clientId },
      create: { clientId },
      update: {},
      select: { id: true },
    })
    await prisma.clientChatMessage.create({
      data: { chatId: chat.id, userId: authorUserId, content, mentions },
    })
    return true
  } catch (err) {
    console.error(`[client-chat] falha ao postar no chat do cliente ${clientId}:`, err)
    return false
  }
}
