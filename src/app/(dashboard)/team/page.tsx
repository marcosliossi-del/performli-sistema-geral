import { requireSession, getTeamMembers } from '@/lib/dal'
import { Users } from 'lucide-react'
import { TeamMemberRow } from '@/components/team/TeamMemberRow'
import { InviteUserForm } from '@/components/team/InviteUserForm'
import { redirect } from 'next/navigation'

export default async function TeamPage() {
  const { userId, role } = await requireSession()
  if (role !== 'ADMIN') redirect('/dashboard')

  const members = await getTeamMembers()

  const active   = members.filter((m) => m.active).length
  const managers = members.filter((m) => m.role === 'MANAGER').length
  const admins   = members.filter((m) => m.role === 'ADMIN').length
  const isAdmin  = role === 'ADMIN'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#EBEBEB]">Equipe</h1>
          <p className="text-[#87919E] text-sm mt-0.5">Gerencie os membros da sua agência</p>
        </div>
        {isAdmin && <InviteUserForm />}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: 'Total de Membros', value: members.length, sub: `${active} ativos` },
          { label: 'Admins',    value: admins,   sub: 'acesso total' },
          { label: 'Gestores',  value: managers, sub: 'gestão de clientes' },
          { label: 'Succ. Clientes', value: members.filter((m) => m.role === 'CS').length, sub: 'visão geral' },
          { label: 'Analistas', value: members.filter((m) => m.role === 'ANALYST').length, sub: 'somente leitura' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-[#0A1E2C] border border-[#38435C] rounded-2xl p-4">
            <p className="text-xs text-[#87919E] mb-1">{kpi.label}</p>
            <p className="text-3xl font-bold text-[#EBEBEB]">{kpi.value}</p>
            <p className="text-xs text-[#87919E] mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Members table */}
      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users size={32} className="text-[#38435C] mb-3" />
          <p className="text-[#87919E] text-sm">Nenhum membro cadastrado</p>
        </div>
      ) : (
        <div className="bg-[#0A1E2C] border border-[#38435C] rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#38435C]">
            <h2 className="text-sm font-semibold text-[#EBEBEB]">Membros</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#38435C]/50">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider">Usuário</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider">Perfil</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider">Clientes</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider">Status</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-[#87919E] uppercase tracking-wider">Desde</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <TeamMemberRow
                  key={member.id}
                  user={member}
                  isSelf={member.id === userId}
                  isAdmin={isAdmin}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
