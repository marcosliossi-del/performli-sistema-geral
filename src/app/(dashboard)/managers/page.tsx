import { requireSession, getManagersOverview } from '@/lib/dal'
import { UsersRound } from 'lucide-react'
import { ManagersClient } from '@/components/managers/ManagersClient'

export default async function ManagersPage() {
  await requireSession()
  const managers = await getManagersOverview()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#0A1E2C] border border-[#38435C] flex items-center justify-center">
          <UsersRound size={18} className="text-[#95BBE2]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#EBEBEB]">Visão por Gestor</h1>
          <p className="text-[#87919E] text-sm">
            Performance e metas dos gestores responsáveis por cada cliente
          </p>
        </div>
      </div>

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
