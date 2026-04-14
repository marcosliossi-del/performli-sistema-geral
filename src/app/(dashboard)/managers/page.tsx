import { requireSession, getManagersOverview, getManagersMRR } from '@/lib/dal'
import { UsersRound, DollarSign, UserCog } from 'lucide-react'
import { ManagersClient } from '@/components/managers/ManagersClient'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function ManagersPage() {
  const session = await requireSession()
  if (session.role !== 'ADMIN' && session.role !== 'CS') redirect('/dashboard')

  const [managers, mrrData] = await Promise.all([
    getManagersOverview(),
    getManagersMRR(),
  ])

  const totalMRR = mrrData.reduce((sum, m) => sum + m.mrr, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#0A1E2C] border border-[#38435C] flex items-center justify-center">
          <UsersRound size={18} className="text-[#95BBE2]" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#EBEBEB]">Visão por Gestor</h1>
          <p className="text-[#87919E] text-sm">
            Performance, metas e receita recorrente gerenciada por cada gestor
          </p>
        </div>
        {session.role === 'ADMIN' && (
          <Link
            href="/managers/assignments"
            className="flex items-center gap-2 h-9 px-4 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#95BBE2] hover:border-[#95BBE2]/60 transition-colors"
          >
            <UserCog size={15} />
            Gerenciar atribuições
          </Link>
        )}
      </div>

      {/* MRR Cards */}
      {mrrData.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <DollarSign size={14} className="text-[#95BBE2]" />
            <h2 className="text-sm font-semibold text-[#EBEBEB]">
              Receita Recorrente Mensal (Budget Gerenciado)
            </h2>
            <span className="ml-auto text-xs text-[#87919E]">
              Total da agência: <span className="text-[#EBEBEB] font-semibold">{formatCurrency(totalMRR)}/mês</span>
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {mrrData.map((m, i) => {
              const colors = ['#95BBE2', '#A78BFA', '#34D399', '#FB923C', '#F472B6', '#60A5FA', '#FBBF24']
              const color = colors[i % colors.length]
              const pct = totalMRR > 0 ? Math.round((m.mrr / totalMRR) * 100) : 0
              return (
                <div
                  key={m.userId}
                  className="bg-[#0A1E2C] border border-[#38435C] rounded-xl p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: color }}
                    >
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#EBEBEB] truncate">{m.name}</p>
                      <p className="text-[10px] text-[#87919E]">{m.clientCount} cliente{m.clientCount !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <p className="text-xl font-bold" style={{ color }}>{formatCurrency(m.mrr)}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[10px] text-[#87919E]">{pct}% do total</p>
                    {m.avgBudgetPerClient > 0 && (
                      <p className="text-[10px] text-[#87919E]">
                        ~{formatCurrency(m.avgBudgetPerClient)}/cliente
                      </p>
                    )}
                  </div>
                  {/* Bar */}
                  <div className="w-full bg-[#38435C] rounded-full h-1 mt-2">
                    <div
                      className="h-1 rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          {totalMRR === 0 && (
            <p className="text-xs text-[#87919E] mt-2">
              * MRR calculado com base nas metas de budget (SPEND/INVESTMENT) mensais cadastradas.
              Cadastre metas mensais de investimento nos clientes para ver os dados.
            </p>
          )}
        </div>
      )}

      {managers.length === 0 ? (
        <div className="bg-[#0A1E2C] border border-[#38435C] rounded-2xl flex flex-col items-center py-16 text-center">
          <UsersRound size={36} className="text-[#38435C] mb-3" />
          <p className="text-[#EBEBEB] font-medium">Nenhum gestor com clientes ativos</p>
          <p className="text-[#87919E] text-sm mt-1 max-w-xs">
            Atribua clientes a membros da equipe para ver a visão por gestor.
          </p>
        </div>
      ) : (
        <ManagersClient managers={managers} />
      )}
    </div>
  )
}
