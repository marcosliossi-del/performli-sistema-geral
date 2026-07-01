import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { z } from 'zod'

const CATEGORIES = ['SALARIOS','MARKETING','FERRAMENTAS','IMPOSTOS','CONTABILIDADE','ESCRITORIO','OUTROS'] as const

const schema = z.object({
  description: z.string().min(1).optional(),
  category:    z.enum(CATEGORIES).optional(),
  value:       z.number().positive().optional(),
  date:        z.string().min(1).optional(),
  recurring:   z.boolean().optional(),
  notes:       z.string().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id }   = await params
  const body     = await req.json()
  const parsed   = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const data = parsed.data
  const expense = await prisma.expense.update({
    where: { id },
    data:  {
      ...data,
      date:  data.date  ? new Date(data.date) : undefined,
      notes: data.notes ?? null,
    },
  })

  return NextResponse.json({ ...expense, value: Number(expense.value) })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  await prisma.expense.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
