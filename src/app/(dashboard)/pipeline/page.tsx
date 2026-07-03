import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/dal'
import { getPipelineClients } from '@/lib/dal'
import { PipelineBoard } from './PipelineBoard'
import { normalizeRole, can } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export default async function PipelinePage() {
  const session = await requireSession()
  // RBAC v2: Pipeline CRM é SÓ ADMIN (matriz comercial).
  if (!can(normalizeRole(session.role), 'view', 'comercial')) redirect('/dashboard')
  const clients = await getPipelineClients(session.userId, session.role)

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-[#EBEBEB]">Estágio da Carteira</h1>
          <p className="text-sm text-[#87919E] mt-0.5">Clientes ativos por estágio — arraste os cards para mover entre etapas</p>
        </div>
        <div className="text-xs text-[#87919E] bg-[#1B2B3A] border border-[#38435C] px-3 py-1.5 rounded-lg">
          {clients.length} cliente{clients.length !== 1 ? 's' : ''}
        </div>
      </div>
      <PipelineBoard initialClients={clients} />
    </div>
  )
}
