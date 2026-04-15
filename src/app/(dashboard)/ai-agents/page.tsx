import { requireSession } from '@/lib/dal'
import { AIAgentsClient } from '@/components/ai-agents/AIAgentsClient'

export default async function AIAgentsPage() {
  const session = await requireSession()
  return <AIAgentsClient role={session.role} />
}
