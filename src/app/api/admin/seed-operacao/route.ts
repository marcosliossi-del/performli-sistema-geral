import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { seedOperacaoArkza } from '@/services/seed-operacao'
import { runTaskRecurrences } from '@/services/recurrence-engine'

/**
 * POST /api/admin/seed-operacao[?backfill=1]
 *
 * ADMIN-only. Semeia (idempotente) o time real + os 15 templates recorrentes
 * fixos + regras de recorrência. Com ?backfill=1, também materializa a janela
 * atual de tarefas nos clientes ATIVOS (runTaskRecurrences force).
 *
 * Segurança: exige sessão com role ADMIN. Não vaza err.message cru ao cliente.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao administrador' }, { status: 403 })
  }

  try {
    const seed = await seedOperacaoArkza()

    const backfill = req.nextUrl.searchParams.get('backfill') === '1'
    const recurrence = backfill ? await runTaskRecurrences({ force: true }) : null

    return NextResponse.json({ ok: true, seed, backfill, recurrence })
  } catch (err) {
    // Log interno com detalhe; resposta genérica ao cliente.
    console.error('[seed-operacao] falha ao semear operação:', err)
    return NextResponse.json(
      { error: 'Falha ao semear a operação. Consulte os logs do servidor.' },
      { status: 500 },
    )
  }
}
