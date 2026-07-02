/**
 * RBAC v2 — Guard de campo para PATCH de tarefas.
 *
 * O GESTOR_TRAFEGO pode atualizar tarefas da carteira APENAS no campo `status`
 * (matriz: `update_status_only`). Este guard rejeita qualquer PATCH que toque
 * outros campos. Função PURA: recebe o papel e as chaves alteradas; lança um
 * Error com mensagem OPERACIONAL (regra de UX) quando negado.
 *
 * Deny-by-default: só a chave exata 'status' é liberada para o GESTOR.
 */

import type { Role5 } from './roles'

const GESTOR: Role5 = 'GESTOR_TRAFEGO'

/** Único campo que o GESTOR pode alterar em uma tarefa. */
export const GESTOR_ALLOWED_TASK_FIELDS = ['status'] as const

/**
 * Valida as chaves de um patch de tarefa para o papel dado.
 * @throws Error (mensagem operacional) se o GESTOR tentar alterar algo além do
 *         status. Demais papéis passam (a permissão de ação já foi checada por
 *         `can()`).
 */
export function assertTaskPatchAllowed(
  role: Role5,
  patchKeys: readonly string[],
): void {
  if (role !== GESTOR) return

  const forbidden = patchKeys.filter(
    (key) => !(GESTOR_ALLOWED_TASK_FIELDS as readonly string[]).includes(key),
  )

  if (forbidden.length > 0) {
    throw new Error(
      `Como gestor você só pode mover a tarefa de coluna (mudar o status). ` +
        `Peça ao responsável para ajustar: ${forbidden.join(', ')}.`,
    )
  }
}

/** Versão booleana (sem throw) para checagens em UI/condicionais. */
export function isTaskPatchAllowed(
  role: Role5,
  patchKeys: readonly string[],
): boolean {
  if (role !== GESTOR) return true
  return patchKeys.every((key) =>
    (GESTOR_ALLOWED_TASK_FIELDS as readonly string[]).includes(key),
  )
}
