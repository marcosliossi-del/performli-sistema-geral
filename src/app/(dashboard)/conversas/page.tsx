import { redirect } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { requireSession, getClientsForSelect } from '@/lib/dal'
import { normalizeRole, can } from '@/lib/rbac'
import {
  getConversationsInbox,
  getConversationThread,
  getPipelineBoard,
  getSupervisionDashboard,
  ConversasReadError,
} from '@/lib/conversas/dal'
import type { ConversationStatus } from '@prisma/client'
import { ConversasTabs, type ConversasView } from '@/components/conversas/ConversasTabs'
import { InboxView } from '@/components/conversas/InboxView'
import { PipelineBoard } from '@/components/conversas/PipelineBoard'
import { SupervisionView } from '@/components/conversas/SupervisionView'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{
    view?: string
    clientId?: string
    status?: string
    mine?: string
    conversationId?: string
  }>
}

const VALID_VIEWS: ConversasView[] = ['inbox', 'pipeline', 'supervisao']
const VALID_STATUS: ConversationStatus[] = ['OPEN', 'PENDING', 'CLOSED']

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 p-5 flex items-start gap-3">
      <AlertTriangle size={18} className="text-[#EF4444] flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-[#EBEBEB]">Não foi possível carregar</p>
        <p className="text-sm text-[#87919E] mt-0.5">{message}</p>
      </div>
    </div>
  )
}

export default async function ConversasPage({ searchParams }: Props) {
  const session = await requireSession()
  const role = normalizeRole(session.role)
  if (!can(role, 'view', 'conversas')) redirect('/cockpit')

  const params = await searchParams
  const view: ConversasView = VALID_VIEWS.includes(params.view as ConversasView)
    ? (params.view as ConversasView)
    : 'inbox'

  const canReply = can(role, 'update', 'conversas')
  const canCreatePipeline = role === 'ADMIN' || role === 'SUPERVISOR_TRAFEGO'
  const canConfigureChannel = role === 'ADMIN'

  const clientsRaw = await getClientsForSelect(session.userId, session.role)
  const clients = clientsRaw.map((c) => ({ id: c.id, name: c.name }))

  return (
    <div className="flex flex-col gap-4 p-5 h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#EBEBEB]">Conversas</h1>
          <p className="text-sm text-[#87919E] mt-0.5">
            Atendimento dos vendedores, estágio dos leads e receita do WhatsApp
          </p>
        </div>
        <ConversasTabs active={view} />
      </div>

      {view === 'inbox' && (
        <InboxSection
          params={params}
          clients={clients}
          currentUserId={session.userId}
          currentUserName={session.name}
          canReply={canReply}
        />
      )}

      {view === 'pipeline' && (
        <PipelineSection
          clientId={params.clientId ?? ''}
          clients={clients}
          canEdit={canReply}
          canCreatePipeline={canCreatePipeline}
        />
      )}

      {view === 'supervisao' && (
        <SupervisionSection clients={clients} canConfigureChannel={canConfigureChannel} />
      )}
    </div>
  )
}

async function InboxSection({
  params, clients, currentUserId, currentUserName, canReply,
}: {
  params: { clientId?: string; status?: string; mine?: string; conversationId?: string }
  clients: { id: string; name: string }[]
  currentUserId: string
  currentUserName: string
  canReply: boolean
}) {
  const filters = {
    clientId: params.clientId ?? '',
    status: VALID_STATUS.includes(params.status as ConversationStatus) ? params.status! : '',
    mine: params.mine === '1',
  }

  try {
    const inbox = await getConversationsInbox({
      clientId: filters.clientId || undefined,
      status: (filters.status as ConversationStatus) || undefined,
      assignedUserId: filters.mine ? currentUserId : undefined,
    })

    const selectedId = params.conversationId ?? null
    let thread = null
    if (selectedId) {
      try {
        thread = await getConversationThread(selectedId)
      } catch (err) {
        // Conversa fora de escopo / inexistente: ignora e mostra o placeholder.
        thread = null
        if (!(err instanceof ConversasReadError)) throw err
      }
    }

    // Opções de atendente para o dropdown de atribuição. LIMITAÇÃO CONHECIDA:
    // a DAL não expõe uma lista de staff atribuível — derivamos dos atendentes
    // já presentes no inbox/thread + o próprio usuário. Ver lacuna reportada.
    const staffMap = new Map<string, { id: string; name: string }>()
    for (const it of inbox.items) {
      if (it.assignee) staffMap.set(it.assignee.id, it.assignee)
    }
    if (thread?.conversation.assignee) {
      staffMap.set(thread.conversation.assignee.id, thread.conversation.assignee)
    }
    staffMap.set(currentUserId, { id: currentUserId, name: currentUserName })
    const staff = Array.from(staffMap.values())

    return (
      <InboxView
        inbox={inbox}
        thread={thread}
        selectedId={selectedId}
        clients={clients}
        staff={staff}
        currentUserId={currentUserId}
        canReply={canReply}
        filters={filters}
      />
    )
  } catch (err) {
    return <ErrorCard message={err instanceof ConversasReadError ? err.message : 'Erro ao carregar a caixa de entrada.'} />
  }
}

async function PipelineSection({
  clientId, clients, canEdit, canCreatePipeline,
}: {
  clientId: string
  clients: { id: string; name: string }[]
  canEdit: boolean
  canCreatePipeline: boolean
}) {
  if (!clientId) {
    return (
      <PipelineBoard
        board={null}
        clients={clients}
        selectedClientId=""
        canEdit={canEdit}
        canCreatePipeline={canCreatePipeline}
      />
    )
  }
  try {
    const board = await getPipelineBoard(clientId)
    return (
      <PipelineBoard
        board={board}
        clients={clients}
        selectedClientId={clientId}
        canEdit={canEdit}
        canCreatePipeline={canCreatePipeline}
      />
    )
  } catch (err) {
    return <ErrorCard message={err instanceof ConversasReadError ? err.message : 'Erro ao carregar o funil.'} />
  }
}

async function SupervisionSection({
  clients, canConfigureChannel,
}: {
  clients: { id: string; name: string }[]
  canConfigureChannel: boolean
}) {
  try {
    const data = await getSupervisionDashboard()
    return <SupervisionView data={data} clients={clients} canConfigureChannel={canConfigureChannel} />
  } catch (err) {
    return <ErrorCard message={err instanceof ConversasReadError ? err.message : 'Erro ao carregar a supervisão.'} />
  }
}
