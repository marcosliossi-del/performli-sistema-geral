import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { z } from 'zod'

const CATEGORIES = ['SALARIOS','MARKETING','FERRAMENTAS','IMPOSTOS','CONTABILIDADE','ESCRITORIO','OUTROS'] as const

const schema = z.object({
  description: z.string().min(1),
  category:    z.enum(CATEGORIES),
  value:       z.number().positive(),
  date:        z.string().min(1),
  recurring:   z.boolean().optional().default(false),
  notes:       z.string().optional(),
})

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  const expenses = await prisma.expense.findMany({
    where: from && to ? { date: { gte: new Date(from), lte: new Date(to) } } : undefined,
    orderBy: { date: 'desc' },
  })

  return NextResponse.json(expenses.map(e => ({ ...e, value: Number(e.value) })))
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body   = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { description, category, value, date, recurring, notes } = parsed.data

  const expense = await prisma.expense.create({
    data: { description, category, value, date: new Date(date), recurring, notes: notes || null },
  })

  return NextResponse.json({ ...expense, value: Number(expense.value) }, { status: 201 })
}
