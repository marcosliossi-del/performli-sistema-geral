import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import { MetasBulkTable } from '@/components/agency/MetasBulkTable'

export const dynamic = 'force-dynamic'

export default async function MetasPage() {
  const session = await requireSession()
  if (session.role !== 'ADMIN') redirect('/dashboard')

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-indexed

  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 0)

  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      assignments: {
        where: { isPrimary: true },
        select: { user: { select: { name: true } } },
        take: 1,
      },
      goals: {
        where: {
          period: 'MONTHLY',
          startDate: { lte: monthEnd },
          endDate: { gte: monthStart },
          metric: { in: ['FATURAMENTO', 'ROAS', 'SPEND'] },
        },
        select: { metric: true, targetValue: true },
      },
    },
  })

  const clientsData = clients.map((c) => {
    const fat   = c.goals.find((g) => g.metric === 'FATURAMENTO')
    const roas  = c.goals.find((g) => g.metric === 'ROAS')
    const spend = c.goals.find((g) => g.metric === 'SPEND')
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      managerName: c.assignments[0]?.user?.name ?? '—',
      goals: {
        FATURAMENTO: fat   ? Number(fat.targetValue)   : null,
        ROAS:        roas  ? Number(roas.targetValue)  : null,
        SPEND:       spend ? Number(spend.targetValue) : null,
      },
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#EBEBEB]">Metas Mensais</h1>
        <p className="text-[#87919E] text-sm mt-0.5">
          Defina ou ajuste as metas de faturamento, ROAS e budget de todos os clientes de uma vez.
        </p>
      </div>
      <MetasBulkTable clients={clientsData} initialYear={year} initialMonth={month} />
    </div>
  )
}
