import { requireSession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import { KnowledgeClient } from '@/components/knowledge/KnowledgeClient'

export default async function KnowledgePage() {
  const session = await requireSession()
  if (session.role !== 'ADMIN') redirect('/dashboard')
  return <KnowledgeClient />
}
