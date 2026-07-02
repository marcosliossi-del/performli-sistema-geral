import 'server-only'
import { prisma } from './prisma'
import { assertClientMutationAccess } from './audit'

type SessionLike = { userId: string; role: string }

export type PermissionAction = 'task.read' | 'task.write' | 'workspace.admin'

const ARKZA_WORKSPACE_ID = 'ws_arkza'

/**
 * Enforcement de permissão do módulo Tasks (D-007, tenancy gradual).
 *
 * Implementação mínima viável:
 *  1. valida que o usuário é membro do workspace Arkza (`ws_arkza`) — todo user
 *     recebe WorkspaceMember no backfill da Fase 1;
 *  2. `workspace.admin` exige role ADMIN (Arkza) ou WorkspaceRole OWNER/ADMIN;
 *  3. quando o recurso tem `clientId`, delega a `assertClientMutationAccess`
 *     (papel + posse) para ações de escrita.
 *
 * Lança Error (mensagem operacional) quando negado — o caller traduz para
 * `{ error }`. `task.read` é amplo (leitura), `task.write` respeita posse.
 */
export async function assertCan(
  session: SessionLike,
  action: PermissionAction,
  resource?: { clientId?: string },
): Promise<void> {
  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: ARKZA_WORKSPACE_ID, userId: session.userId },
    select: { role: true },
  })
  if (!membership) {
    throw new Error('Sem acesso: você não é membro do workspace.')
  }

  if (action === 'workspace.admin') {
    const isAdmin = session.role === 'ADMIN' || membership.role === 'OWNER' || membership.role === 'ADMIN'
    if (!isAdmin) throw new Error('Sem permissão: ação restrita a administradores.')
    return
  }

  if (action === 'task.read') {
    // Leitura ampla dentro do workspace (isolamento fino fica na DAL por Client).
    return
  }

  // task.write: se há cliente, valida papel + posse (CS acompanha).
  if (resource?.clientId) {
    await assertClientMutationAccess(session, resource.clientId, { allowCS: true })
  } else if (session.role === 'ANALYST') {
    throw new Error('Seu papel não permite esta ação.')
  }
}
