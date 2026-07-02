import { Users, AlertTriangle, UserMinus, UserPlus, DollarSign, TrendingUp } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { formatCurrency } from '@/lib/utils'
import { ClientesTable } from '@/components/clientes/ClientesTable'
import { normalizeRole, scopeClients } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

async function getClientesData(userId: string, role: string) {
  // Posse (CLAUDE.md #2): staff amplo vê toda a carteira; só GESTOR_TRAFEGO fica
  // restrito aos clientes atribuídos (scopeClients).
  const where = scopeClients(normalizeRole(role), userId)

  const now        = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const prevStart  = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevEnd    = new Date(now.getFullYear(), now.getMonth(), 0)

  const [clients, prevNewCount, overdueCount] = await Promise.all([
    prisma.client.findMany({
      where,
      select: {
        id: true, name: true, razaoSocial: true, slug: true, source: true, phone: true,
        email: true, status: true, contractValue: true, createdAt: true,
        businessType: true,
        resultado: true, etapa: true, resultadoRoas: true, resultadoUpdatedAt: true,
        nps: true, relacionamento: true, curva: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.client.count({
      where: { ...where, createdAt: { gte: prevStart, lte: prevEnd } },
    }),
    prisma.asaasPayment.count({
      where: {
        status: 'OVERDUE',
        // Escopo de posse: ADMIN/CS contam a inadimplência global; MANAGER/ANALYST
        // só contam faturas dos clientes que enxergam.
        ...(canViewAll
          ? {}
          : { customer: { client: { assignments: { some: { userId } } } } }),
      },
    }),
  ])

  const active   = clients.filter(c => c.status === 'ACTIVE')
  const churned  = clients.filter(c => c.status === 'CHURNED')
  const newMonth = clients.filter(c => c.createdAt >= monthStart)

  const recorrente  = active.reduce((s, c) => s + Number(c.contractValue ?? 0), 0)
  const comContrato = active.filter(c => c.contractValue).length
  const mediaReceita = comContrato > 0 ? recorrente / comContrato : 0

  const deltaNew = prevNewCount > 0
    ? Math.round(((newMonth.length - prevNewCount) / prevNewCount) * 100)
    : 0

  return {
    clients: clients.map(c => ({
      ...c,
      contractValue: c.contractValue ? Number(c.contractValue) : null,
      createdAt:     c.createdAt.toISOString(),
      resultadoRoas:      c.resultadoRoas != null ? Number(c.resultadoRoas) : null,
      resultadoUpdatedAt: c.resultadoUpdatedAt ? c.resultadoUpdatedAt.toISOString() : null,
    })),
    kpis: {
      recorrentes:       active.length,
      inadimplentes:     overdueCount,
      cancelados:        churned.length,
      novos:             newMonth.length,
      deltaNew,
      receitaMedia:      mediaReceita,
      receitaRecorrente: recorrente,
    },
  }
}

export default async function ClientsPage() {
  const session = await requireSession()
  const { clients, kpis } = await getClientesData(session.userId, session.role)

  const cards = [
    {
      label: 'Clientes recorrentes',
      value: String(kpis.recorrentes),
      icon:  Users,
      color: '#22C55E',
      sub:   'Ativos na carteira hoje',
    },
    {
      label: 'Clientes inadimplentes',
      value: String(kpis.inadimplentes),
      icon:  AlertTriangle,
      color: '#EF4444',
      sub:   'Com fatura vencida no Asaas',
    },
    {
      label: 'Clientes cancelados',
      value: String(kpis.cancelados),
      icon:  UserMinus,
      color: '#EF4444',
      sub:   'Já saíram da carteira',
    },
    {
      label: 'Novos clientes',
      value: String(kpis.novos),
      icon:  UserPlus,
      color: '#22C55E',
      sub:   `Este mês · ${kpis.deltaNew >= 0 ? '+' : ''}${kpis.deltaNew}% vs. mês anterior`,
    },
    {
      label: 'Receita média por cliente',
      value: formatCurrency(kpis.receitaMedia),
      icon:  DollarSign,
      color: '#22C55E',
      sub:   'Média dos contratos ativos',
    },
    {
      label: 'Receita recorrente',
      value: formatCurrency(kpis.receitaRecorrente),
      icon:  TrendingUp,
      color: '#22C55E',
      sub:   'Soma dos contratos ativos',
    },
  ]

  return (
    <div className="flex flex-col gap-5 p-5 min-h-screen">
      <div>
        <h1 className="text-xl font-bold text-[#EBEBEB]">Clientes</h1>
        <p className="text-sm text-[#87919E] mt-0.5">Gestão de carteira de clientes</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map(card => (
          <div key={card.label} className="bg-[#0D2137] border border-[#38435C] rounded-2xl p-4">
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs text-[#87919E] leading-tight max-w-[130px]">{card.label}</p>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `${card.color}18` }}
              >
                <card.icon size={15} style={{ color: card.color }} />
              </div>
            </div>
            <p className="text-2xl font-bold text-[#EBEBEB]">{card.value}</p>
            <p className="text-[11px] text-[#87919E] mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <ClientesTable clients={clients} />
    </div>
  )
}
