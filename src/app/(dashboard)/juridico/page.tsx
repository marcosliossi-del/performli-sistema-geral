import { Scale, FileText, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { formatCurrency } from '@/lib/utils'
import { ContractsTable } from '@/components/juridico/ContractsTable'

export const dynamic = 'force-dynamic'

async function getData() {
  const [contracts, clients, users] = await Promise.all([
    prisma.contract.findMany({
      include: {
        client:      { select: { id: true, name: true, slug: true } },
        responsible: { select: { id: true, name: true } },
      },
      orderBy: { endDate: 'asc' },
    }),
    prisma.client.findMany({
      where:   { status: 'ACTIVE' },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      where:   { active: true },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const serialized = contracts.map(c => ({
    ...c,
    feeValue:    Number(c.feeValue),
    setupFee:    c.setupFee ? Number(c.setupFee) : null,
    startDate:   c.startDate.toISOString(),
    endDate:     c.endDate.toISOString(),
    signedAt:    c.signedAt    ? c.signedAt.toISOString()    : null,
    cancelledAt: c.cancelledAt ? c.cancelledAt.toISOString() : null,
    createdAt:   c.createdAt.toISOString(),
    updatedAt:   c.updatedAt.toISOString(),
  }))

  const vigentes   = serialized.filter(c => c.status === 'VIGENTE')
  const renovacoes = serialized.filter(c => c.status === 'RENOVACAO')
  const rascunhos  = serialized.filter(c => c.status === 'RASCUNHO')
  const expirando  = vigentes.filter(c => {
    const days = Math.ceil((new Date(c.endDate).getTime() - today.getTime()) / 86_400_000)
    return days >= 0 && days <= 30
  })

  const mrr = vigentes.reduce((s, c) => s + c.feeValue, 0)

  return { serialized, clients, users, vigentes, renovacoes, rascunhos, expirando, mrr }
}

export default async function JuridicoPage() {
  await requireSession()
  const { serialized, clients, users, vigentes, renovacoes, rascunhos, expirando, mrr } = await getData()

  const stats = [
    {
      label:   'MRR Contratos',
      value:   formatCurrency(mrr),
      sub:     `${vigentes.length} contratos ativos`,
      icon:    CheckCircle2,
      color:   'text-[#22C55E]',
      bg:      'bg-[#22C55E]/10',
    },
    {
      label:   'Em Vigor',
      value:   vigentes.length.toString(),
      sub:     'contratos vigentes',
      icon:    FileText,
      color:   'text-[#95BBE2]',
      bg:      'bg-[#95BBE2]/10',
    },
    {
      label:   'Renovação',
      value:   renovacoes.length.toString(),
      sub:     'aguardando renovar',
      icon:    Clock,
      color:   'text-[#F59E0B]',
      bg:      'bg-[#F59E0B]/10',
    },
    {
      label:   'Vencendo em 30d',
      value:   expirando.length.toString(),
      sub:     'requerem atenção',
      icon:    AlertTriangle,
      color:   expirando.length > 0 ? 'text-[#EF4444]' : 'text-[#87919E]',
      bg:      expirando.length > 0 ? 'bg-[#EF4444]/10' : 'bg-[#38435C]/30',
    },
  ]

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#95BBE2]/10 flex items-center justify-center">
            <Scale size={20} className="text-[#95BBE2]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#EBEBEB]">Jurídico</h1>
            <p className="text-xs text-[#87919E]">Gestão de contratos e SLA</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-[#0A1E2C] border border-[#38435C] rounded-xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center`}>
                  <Icon size={15} className={s.color} />
                </div>
              </div>
              <p className="text-2xl font-bold text-[#EBEBEB]">{s.value}</p>
              <p className="text-xs text-[#87919E] mt-0.5">{s.label}</p>
              <p className="text-[11px] text-[#87919E]/60 mt-1">{s.sub}</p>
            </div>
          )
        })}
      </div>

      {/* Aviso de vencimentos próximos */}
      {expirando.length > 0 && (
        <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={16} className="text-[#F59E0B] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-[#F59E0B]">
              {expirando.length} contrato{expirando.length > 1 ? 's' : ''} vence{expirando.length > 1 ? 'm' : ''} nos próximos 30 dias
            </p>
            <p className="text-xs text-[#F59E0B]/70 mt-0.5">
              {expirando.map(c => c.client.name).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Contracts table */}
      <ContractsTable contracts={serialized} clients={clients} users={users} />
    </div>
  )
}
