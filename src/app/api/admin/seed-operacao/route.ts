import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { seedOperacaoArkza } from '@/services/seed-operacao'
import { seedCarteiras, createNovosClientes, getCancelCandidates, cancelarForaDaCarteira } from '@/services/seed-carteiras'
import { materializeRecurringTasksForClient } from '@/services/recurrence-engine'
import { importarSuporteClickUp } from '@/services/seed-suporte'
import { migrarClickUp, type LoteName } from '@/services/clickup-migration'
import { reconcileAsaasTasks } from '@/services/asaas-task-reconciler'
import { vincularAsaasClientes } from '@/services/seed-vincular-asaas'
import { migrarMetasRoasParaFaturamento } from '@/services/migrar-metas-faturamento'
import { limparMetasZeradas } from '@/services/limpar-metas-zeradas'
import { reconciliarBusinessTypeB2B } from '@/services/reconciliar-business-type'
import { backfillEtapaFromResultado } from '@/services/client-etapa-backfill'
import { writeAuditLog } from '@/lib/audit'

// Backfill pode processar vários clientes — dá folga ao tempo de execução.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/seed-operacao
 *
 * ADMIN-only. Dois modos (para não estourar o tempo-limite serverless):
 *   - phase=seed (padrão): semeia (idempotente) o time real + 15 templates +
 *     recorrências. Rápido. Retorna as contagens + total de clientes ativos.
 *   - phase=backfill&cursor=<clientId>&batch=<n>: materializa as tarefas
 *     recorrentes de um LOTE de clientes ativos (id > cursor). Retorna o
 *     agregado, o último id processado e se terminou. O cliente repete até done.
 *
 * Segurança: exige sessão ADMIN. Não vaza err.message cru.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao administrador' }, { status: 403 })
  }

  const phase = req.nextUrl.searchParams.get('phase') ?? 'seed'

  try {
    if (phase === 'backfill') {
      const cursor = req.nextUrl.searchParams.get('cursor') || undefined
      const batch = Math.min(Math.max(Number(req.nextUrl.searchParams.get('batch') ?? '6'), 1), 20)

      const clients = await prisma.client.findMany({
        where: { status: 'ACTIVE', ...(cursor ? { id: { gt: cursor } } : {}) },
        orderBy: { id: 'asc' },
        take: batch,
        select: { id: true },
      })

      let created = 0
      let skipped = 0
      let failed = 0
      for (const c of clients) {
        try {
          const r = await materializeRecurringTasksForClient(c.id)
          created += r.created
          skipped += r.skipped
          failed += r.failed
        } catch (err) {
          console.error(`[seed-operacao] backfill falhou p/ cliente ${c.id}:`, err)
          failed++
        }
      }

      const lastId = clients.length ? clients[clients.length - 1].id : cursor ?? null
      const done = clients.length < batch
      return NextResponse.json({ ok: true, phase, processed: clients.length, created, skipped, failed, lastId, done })
    }

    if (phase === 'carteiras') {
      // Novos clientes ANTES do preenchimento — assim a mesma rodada já
      // preenche gestor/metas dos recém-criados (Tayna, Duplo Varejo etc.).
      const novos = await createNovosClientes()
      const carteiras = await seedCarteiras()
      const candidates = await getCancelCandidates()
      return NextResponse.json({ ok: true, phase, carteiras, novos, candidates })
    }

    if (phase === 'cancelar') {
      const result = await cancelarForaDaCarteira()
      return NextResponse.json({ ok: true, phase, ...result })
    }

    if (phase === 'suporte') {
      const suporte = await importarSuporteClickUp()
      return NextResponse.json({ ok: true, phase, suporte })
    }

    if (phase === 'migrar-clickup') {
      const loteParam = (req.nextUrl.searchParams.get('lote') ?? 'tudo') as LoteName
      const lotesValidos: LoteName[] = ['internas', 'rituais', 'pagar', 'metas', 'contratos', 'tudo']
      const lote = lotesValidos.includes(loteParam) ? loteParam : 'tudo'
      const migracao = await migrarClickUp(lote)
      return NextResponse.json({ ok: true, phase, lote, migracao })
    }

    if (phase === 'migrar-metas-faturamento') {
      const result = await migrarMetasRoasParaFaturamento()
      await writeAuditLog({
        actorId: session.userId,
        actorRole: session.role,
        action: 'goals.migrarRoasParaFaturamento',
        entityType: 'Goal',
        entityId: 'bulk',
        metadata: {
          migrados: result.migrados,
          semRoas: result.semRoas,
          semBudget: result.semBudget,
        },
      })
      return NextResponse.json({ ok: true, phase, ...result })
    }

    if (phase === 'limpar-metas-zeradas') {
      // Apaga metas com targetValue <= 0 (bug antigo). Idempotente; o próprio
      // serviço registra o AuditLog 'goals.limpezaZeradas' com a contagem.
      const result = await limparMetasZeradas({
        actorId: session.userId,
        actorRole: session.role,
      })
      return NextResponse.json({ ok: true, phase, ...result })
    }

    if (phase === 'reconciliar-b2b') {
      // Marca os 3 clientes de atacado como B2B (medem como negócio local).
      // Idempotente; o serviço registra o AuditLog 'client.businessTypeB2B'.
      const result = await reconciliarBusinessTypeB2B({
        actorId: session.userId,
        actorRole: session.role,
      })
      return NextResponse.json({ ok: true, phase, ...result })
    }

    if (phase === 'backfill-etapa') {
      // Recalcula Client.etapa a partir do Client.resultado atual (retroativo —
      // ponto cego do ClickUp). Idempotente; o serviço grava o AuditLog.
      const result = await backfillEtapaFromResultado({ actorId: session.userId, actorRole: session.role })
      return NextResponse.json({ ok: true, phase, ...result })
    }

    if (phase === 'vincular-asaas') {
      const vinculo = await vincularAsaasClientes()
      return NextResponse.json({ ok: true, phase, vinculo })
    }

    if (phase === 'reconciliar-asaas') {
      const reconcile = await reconcileAsaasTasks()
      return NextResponse.json({ ok: true, phase, reconcile })
    }

    if (phase === 'diagnostico') {
      // Clientes ativos sem gestor resolvível (nem gestorId, nem atribuição
      // primária) — são a causa das falhas dos templates de gestor.
      const clients = await prisma.client.findMany({
        where: {
          status: 'ACTIVE',
          gestorId: null,
          assignments: { none: { isPrimary: true } },
        },
        orderBy: { name: 'asc' },
        select: { name: true, slug: true },
      })
      return NextResponse.json({ ok: true, phase, semGestor: clients })
    }

    // phase === 'seed'
    const seed = await seedOperacaoArkza()
    const totalActiveClients = await prisma.client.count({ where: { status: 'ACTIVE' } })
    return NextResponse.json({ ok: true, phase: 'seed', seed, totalActiveClients })
  } catch (err) {
    console.error('[seed-operacao] falha:', err)
    return NextResponse.json(
      { error: 'Falha ao semear a operação. Consulte os logs do servidor.' },
      { status: 500 },
    )
  }
}
