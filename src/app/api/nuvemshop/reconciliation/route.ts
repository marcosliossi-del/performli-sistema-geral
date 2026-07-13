import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { reconcileClientData, matchOrdersWithGA4 } from '@/services/nuvemshop/reconciliation'
import { z } from 'zod'

// Permissivo: clientId obrigatório (já era); since/until opcionais (default
// calculado no handler quando ausentes).
const postSchema = z.object({
  clientId: z.string().min(1, 'clientId é obrigatório'),
  since: z.string().optional(),
  until: z.string().optional(),
})

/**
 * GET /api/nuvemshop/reconciliation?clientId=xxx&since=YYYY-MM-DD&until=YYYY-MM-DD
 *
 * Retorna a reconciliação de dados Nuvemshop ↔ GA4 para um cliente.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) {
    return NextResponse.json({ error: 'clientId é obrigatório' }, { status: 400 })
  }

  // Verifica permissão
  if (session.role !== 'ADMIN') {
    const assignment = await prisma.clientAssignment.findFirst({
      where: { clientId, userId: session.userId },
    })
    if (!assignment) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }
  }

  const now = new Date()
  const since = request.nextUrl.searchParams.get('since')
    ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const until = request.nextUrl.searchParams.get('until')
    ?? now.toISOString().split('T')[0]

  const reconciliation = await reconcileClientData(clientId, since, until)
  return NextResponse.json(reconciliation)
}

/**
 * POST /api/nuvemshop/reconciliation
 *
 * Executa o cruzamento de pedidos Nuvemshop ↔ GA4.
 * Body: { clientId, since?, until? }
 */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const raw = await request.json().catch(() => null)
  const parsed = postSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'clientId é obrigatório e deve ser texto.' }, { status: 400 })
  }
  const { clientId, since, until } = parsed.data

  if (session.role !== 'ADMIN') {
    const assignment = await prisma.clientAssignment.findFirst({
      where: { clientId, userId: session.userId },
    })
    if (!assignment) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }
  }

  const now = new Date()
  const sinceDate = since ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const untilDate = until ?? now.toISOString().split('T')[0]

  const matchResult = await matchOrdersWithGA4(clientId, sinceDate, untilDate)
  const reconciliation = await reconcileClientData(clientId, sinceDate, untilDate)

  return NextResponse.json({ ...reconciliation, matching: matchResult })
}
