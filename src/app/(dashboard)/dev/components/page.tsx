import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/dal'
import { ComponentsPlayground } from './Playground'

// Página interna de desenvolvimento — vocabulário visual do módulo Tasks.
// Não entra no Sidebar. Só ADMIN acessa.
export const metadata = { title: 'Playground — componentes do módulo Tasks' }

export default async function DevComponentsPage() {
  const session = await requireSession()
  if (session.role !== 'ADMIN') redirect('/')
  return <ComponentsPlayground />
}
