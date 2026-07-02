/**
 * RBAC v2 — Escopo de linhas (row-level) por papel.
 *
 * Traduz um papel canônico em um `where` Prisma que restringe as linhas
 * visíveis. Funções PURAS: recebem role+userId e devolvem um filtro; NÃO
 * tocam no banco. A composição de segurança é: can() (ação) → scope (linhas).
 *
 * Regra: ADMIN/SUPERVISOR/ANALISTA/CS enxergam tudo ({} = sem filtro);
 * GESTOR_TRAFEGO só a carteira (clientes atribuídos via ClientAssignment).
 *
 * ⚠️ `{}` (objeto vazio) em Prisma significa "sem restrição" — é intencional
 * para os papéis de leitura ampla. NUNCA use este helper como única barreira de
 * mutação: a posse de escrita ainda exige checagem de ação (can) + ownership.
 */

import type { Prisma } from '@prisma/client'
import type { Role5 } from './roles'

const GESTOR: Role5 = 'GESTOR_TRAFEGO'

/**
 * Filtro de clientes visíveis ao papel.
 * GESTOR → apenas clientes com um ClientAssignment para o userId.
 */
export function scopeClients(
  role: Role5,
  userId: string,
): Prisma.ClientWhereInput {
  if (role === GESTOR) {
    return { assignments: { some: { userId } } }
  }
  // ADMIN / SUPERVISOR_TRAFEGO / ANALISTA_TRAFEGO / CS → leitura ampla.
  return {}
}

/**
 * Filtro de tarefas visíveis ao papel.
 * GESTOR → tarefas de um cliente da carteira OU tarefa interna própria
 * (sem cliente, mas onde ele é responsável principal `assignedTo` ou
 * responsável auxiliar `auxAssignees`). Espelha o recorte de leitura já usado
 * em src/lib/tasks/panel.ts.
 */
export function scopeTasks(
  role: Role5,
  userId: string,
): Prisma.TaskWhereInput {
  if (role === GESTOR) {
    return {
      OR: [
        // Tarefa de cliente da carteira.
        { client: { assignments: { some: { userId } } } },
        // Tarefa interna (sem cliente) da qual o gestor é responsável.
        { clientId: null, assignedTo: userId },
        { clientId: null, auxAssignees: { some: { userId } } },
      ],
    }
  }
  // Demais papéis → leitura ampla de tarefas.
  return {}
}
