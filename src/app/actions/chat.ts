'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'

export type ChatMessageState = {
  error?: string
  success?: boolean
}

export async function sendChatMessage(
  prevState: ChatMessageState,
  formData: FormData
): Promise<ChatMessageState> {
  const session = await requireSession()

  const chatId = formData.get('chatId') as string
  const content = (formData.get('content') as string)?.trim()
  const clientSlug = formData.get('clientSlug') as string

  if (!chatId || !content) return { error: 'Mensagem não pode estar vazia.' }

  // Verify chat exists and user has access
  const chat = await prisma.clientChat.findUnique({
    where: { id: chatId },
    include: {
      client: {
        select: {
          assignments: { where: { userId: session.userId } },
        },
      },
    },
  })

  if (!chat) return { error: 'Chat não encontrado.' }

  // Participantes do canal interno: ADMIN (Marcos) + CS + gestor atribuído.
  const isOversight = session.role === 'ADMIN' || session.role === 'CS'
  const isAssignedManager = session.role === 'MANAGER' && chat.client.assignments.length > 0
  if (!isOversight && !isAssignedManager) {
    return { error: 'Apenas o gestor atribuído, a CS e o admin participam deste canal.' }
  }

  await prisma.clientChatMessage.create({
    data: {
      chatId,
      userId: session.userId,
      content,
    },
  })

  revalidatePath(`/clients/${clientSlug}`)
  revalidatePath('/canais')
  return { success: true }
}

export async function ensureClientChat(clientId: string): Promise<string | null> {
  const chat = await prisma.clientChat.upsert({
    where: { clientId },
    create: { clientId },
    update: {},
    select: { id: true },
  })
  return chat.id
}
