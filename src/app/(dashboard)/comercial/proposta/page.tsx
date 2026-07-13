import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/dal'
import { normalizeRole, can } from '@/lib/rbac'
import { PropostaGenerator } from '@/components/comercial/PropostaGenerator'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'

export const dynamic = 'force-dynamic'

export default async function PropostaPage() {
  const session = await requireSession()
  if (!can(normalizeRole(session.role), 'view', 'comercial')) redirect('/cockpit')

  return (
    <div className="p-6 space-y-4">
      <Breadcrumbs items={[{ label: 'Comercial', href: '/comercial' }, { label: 'Gerador de Proposta' }]} />
      <PropostaGenerator />
    </div>
  )
}
