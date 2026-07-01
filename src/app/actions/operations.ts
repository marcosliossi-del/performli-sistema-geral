'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { assertClientMutationAccess, writeAuditLog } from '@/lib/audit'

const schema = z.object({
  clientId: z.string().min(1, 'Selecione um cliente'),
  subject:  z.string().min(3, 'Assunto obrigatório'),
  requested: z.string().min(5, 'Descreva o que foi solicitado'),
  done:      z.string().min(5, 'Descreva o que foi feito'),
  notes:     z.string().optional(),
})

export async function createOperation(formData: FormData) {
  const session = await requireSession()
  const { userId, role } = session

  const raw = {
    clientId:  formData.get('clientId'),
    subject:   formData.get('subject'),
    requested: formData.get('requested'),
    done:      formData.get('done'),
    notes:     formData.get('notes') ?? '',
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(', ')
    throw new Error(msg)
  }

  const { clientId, subject, requested, done, notes } = parsed.data

  // Mutação: valida autenticação + papel + posse (CS pode registrar operações).
  await assertClientMutationAccess(session, clientId, { allowCS: true })

  const op = await prisma.operation.create({
    data: {
      clientId,
      userId,
      subject,
      requested,
      done,
      notes: notes || null,
    },
  })

  await writeAuditLog({
    actorId: userId,
    actorRole: role,
    action: 'operation.created',
    entityType: 'Operation',
    entityId: op.id,
    clientId,
    metadata: { subject },
  })

  revalidatePath('/operations')
}
