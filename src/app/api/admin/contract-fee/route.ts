import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const fd  = await req.formData()
  const id  = (fd.get('id')       as string)?.trim()
  const fee = parseFloat((fd.get('feeValue') as string) || '0')

  if (!id)       return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (isNaN(fee))return NextResponse.json({ error: 'invalid fee' }, { status: 400 })

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
