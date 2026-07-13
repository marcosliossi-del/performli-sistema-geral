import { requireSession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import { KnowledgeClient } from '@/components/knowledge/KnowledgeClient'
import { hasSpaceGrant } from '@/lib/nav-access'

export default async function KnowledgePage() {
  const session = await requireSession()
  // Guard de papel + grant de espaço (lista personalizada 'dá' acesso — QA D2)
  if (session.role !== 'ADMIN' && !(await hasSpaceGrant(session.userId, 'inteligencia.knowledge'))) redirect('/cockpit')
  return <KnowledgeClient />
}
