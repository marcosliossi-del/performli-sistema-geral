import { requireSession } from '@/lib/dal'
import { loadTaskPanel } from '@/lib/tasks/panel'
import { TaskPanel } from '@/components/tasks/TaskPanel'

export const dynamic = 'force-dynamic'

/**
 * Rota INTERCEPTADA (D-009): abre o MESMO painel como slide-over sobre a lista,
 * sem perder o contexto (anti-feature 2.11 §5). Só dispara em navegação suave
 * (clique num <Link href="/t/..."> dentro do grupo (dashboard)). Refresh /
 * deep-link direto caem na página cheia (children slot).
 *
 * Se a task não existe ou o papel não tem acesso, renderiza nada — a página
 * cheia é quem mostra o notFound; aqui o slot fica vazio para não travar a view.
 */
export default async function InterceptedTaskPanel({
  params,
}: {
  params: Promise<{ taskId: string }>
}) {
  const { taskId } = await params
  const session = await requireSession()
  const result = await loadTaskPanel(taskId, session)
  if (!result) return null

  return <TaskPanel result={result} variant="slideover" />
}
