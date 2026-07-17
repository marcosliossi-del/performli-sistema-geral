import { requireSession, getClientsForSelect, taskScopeFor } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import type { SupportCardData } from '@/components/suporte/SupportBoard'
import type { SupportRow } from '@/components/suporte/SupportList'
import { SupportViews } from '@/components/suporte/SupportViews'
import { NewSupportDemand } from '@/components/suporte/NewSupportDemand'
import { Headset } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function SuportePage() {
  const session = await requireSession()

  // A-108: escopo por papel via FONTE ÚNICA `taskScopeFor` — o MESMO predicado
  // do badge da sidebar (staff amplo vê tudo; GESTOR vê `assignedTo` OU carteira).
  // Antes a tela filtrava só por carteira e uma demanda atribuída fora da carteira
  // contava no badge mas sumia daqui. A tela segue mostrando ≠CANCELADO (inclui
  // CONCLUIDO); o badge conta só os status ABERTOS (OPEN_SUPPORT_STATUSES).
  const where: Prisma.TaskWhereInput = {
    isSupport: true,
    status: { not: 'CANCELADO' },
    ...taskScopeFor(session.userId, session.role),
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      client: { select: { name: true, razaoSocial: true, slug: true, gestorId: true, csId: true } },
      user: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const cards: SupportCardData[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    supportDirection: t.supportDirection,
    clientName: t.client?.name ?? null,
    clientSlug: t.client?.slug ?? null,
    assigneeName: t.user?.name ?? null,
    updatedAt: t.updatedAt.toISOString(),
  }))

  const rows: SupportRow[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    category: t.supportCategory,
    clientName: t.client?.name ?? null,
    clientRazaoSocial: t.client?.razaoSocial ?? null,
    clientSlug: t.client?.slug ?? null,
    assigneeName: t.user?.name ?? null,
    requestedAt: t.requestedAt?.toISOString() ?? null,
    dueDate: t.dueDate?.toISOString() ?? null,
    isRecurring: t.origin === 'RECORRENCIA',
  }))

  const clients = (await getClientsForSelect(session.userId, session.role)).map(
    (c) => ({ id: c.id, name: c.name, razaoSocial: c.razaoSocial }),
  )

  const users = (
    await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
  ).map((u) => ({ id: u.id, name: u.name }))

  // Data/hora da última atualização (CLAUDE.md, regra de UX #10).
  const lastMovement = tasks.length
    ? tasks.reduce((max, t) => (t.updatedAt > max ? t.updatedAt : max), tasks[0].updatedAt)
    : null
  const stamp = (lastMovement ?? new Date()).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

  // T-12: contador honesto — quantas demandas estão em status FORA das 6 colunas
  // padrão do board. Com a coluna catch-all "Outros" elas continuam visíveis, e
  // o header explicita quantas exigem atenção fora do fluxo normal.
  const BOARD_COLUMN_STATUSES = new Set<string>([
    'A_FAZER', 'EM_ANDAMENTO', 'EM_VALIDACAO', 'AGUARDANDO_CLIENTE', 'AJUSTES_SOLICITADOS', 'CONCLUIDO',
  ])
  const otherStatusCount = cards.filter((c) => !BOARD_COLUMN_STATUSES.has(c.status)).length

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-start justify-between mb-6 flex-shrink-0 gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#54e0ee]/10 flex items-center justify-center text-[#54e0ee] flex-shrink-0">
            <Headset size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#EBEBEB]">Hub de Suporte</h1>
            <p className="text-sm text-[#87919E] mt-0.5">
              As tarefas de suporte diário da agência: responsável, prazo, prioridade e cliente em uma lista.
            </p>
            <p className="text-[11px] text-[#87919E]/70 mt-1">
              {cards.length} demanda{cards.length !== 1 ? 's' : ''} em aberto
              {otherStatusCount > 0 && ` · ${otherStatusCount} em outros status`}
              {' · '}última movimentação em {stamp}
            </p>
          </div>
        </div>
        <div className="flex-shrink-0">
          <NewSupportDemand clients={clients} users={users} />
        </div>
      </div>

      <SupportViews rows={rows} cards={cards} />
    </div>
  )
}
