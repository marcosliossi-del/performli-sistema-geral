import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { z } from 'zod'

// Permissivo: mesmos campos do formData atual. `id` obrigatório (trim > 0);
// `feeValue` opcional (default '0', como antes) e coercível para número >= 0.
const schema = z.object({
  id: z.string().trim().min(1),
  feeValue: z.coerce.number().min(0),
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const fd  = await req.formData()
  const parsed = schema.safeParse({
    id: fd.get('id'),
    feeValue: fd.get('feeValue') ?? '0',
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados do fee inválidos. Informe o contrato e um valor numérico maior ou igual a zero.' },
      { status: 400 },
    )
  }
  const id  = parsed.data.id
  const fee = parsed.data.feeValue

  const updated = await prisma.contract.update({
    where:  { id },
    data:   { feeValue: fee },
    select: { clientId: true },
  })

  // Keep Client.contractValue in sync so the clients list and summary card reflect the new fee
  await prisma.client.update({
    where: { id: updated.clientId },
    data:  { contractValue: fee },
  })

  return NextResponse.json({ ok: true })
}
