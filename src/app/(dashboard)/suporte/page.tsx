import { requireSession, getClientsForSelect } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { SupportBoard } from '@/components/suporte/SupportBoard'
import type { SupportCardData } from '@/components/suporte/SupportBoard'
import { NewSupportDemand } from '@/components/suporte/NewSupportDemand'
import { Headset } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function SuportePage() {
  const session = await requireSession()

  // Escopo por papel: ADMIN/CS enxergam tudo; MANAGER/ANALYST só demandas de
  // clientes atribuídos a eles (mesmo padrão de alerts/page.tsx). A segurança
  // real das mutações vive no backend; aqui é só recorte de leitura.
  const isViewAll = session.role === 'ADMIN' || session.role === 'CS'
  const where: Prisma.TaskWhereInput = {
    isSupport: true,
    status: { not: 'CANCELADO' },
    ...(isViewAll
      ? {}
      : { client: { assignments: { some: { userId: session.userId } } } }),
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      client: { select: { name: true, slug: true, gestorId: true, csId: true } },
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

  const clients = (await getClientsForSelect(session.userId, session.role)).map(
    (c) => ({ id: c.id, name: c.name }),
  )

  // Data/hora da última atualização (CLAUDE.md, regra de UX #10).
  const lastMovement = tasks.length
    ? tasks.reduce((max, t) => (t.updatedAt > max ? t.updatedAt : max), tasks[0].updatedAt)
    : null
  const stamp = (lastMovement ?? new Date()).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

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
              O atendimento diário da agência: arraste cada demanda pelo fluxo até concluir.
            </p>
            <p className="text-[11px] text-[#87919E]/70 mt-1">
              {cards.length} demanda{cards.length !== 1 ? 's' : ''} em aberto · última movimentação em {stamp}
            </p>
          </div>
        </div>
        <div className="flex-shrink-0">
          <NewSupportDemand clients={clients} />
        </div>
      </div>

      <SupportBoard initialCards={cards} />
    </div>
  )
}
