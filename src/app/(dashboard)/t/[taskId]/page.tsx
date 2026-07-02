import { notFound } from 'next/navigation'
import { requireSession } from '@/lib/dal'
import { loadTaskPanel } from '@/lib/tasks/panel'
import { TaskPanel } from '@/components/tasks/TaskPanel'

export const dynamic = 'force-dynamic'

/**
 * Página cheia standalone do painel da task (deep-link direto / refresh).
 * Sempre disponível — é o alvo robusto do `/t/[taskId]`. A versão slide-over
 * (rota interceptada @modal) só aparece em navegação suave a partir das listas.
 */
export default async function TaskPanelPage({
  params,
}: {
  params: Promise<{ taskId: string }>
}) {
  const { taskId } = await params
  const session = await requireSession()
  const result = await loadTaskPanel(taskId, session)

  // notFound cobre "não existe" e "sem acesso" (não revela existência ao papel
  // sem posse — mesmo padrão de recorte de leitura do resto do sistema).
  if (!result) notFound()

  return <TaskPanel result={result} variant="page" />
}
