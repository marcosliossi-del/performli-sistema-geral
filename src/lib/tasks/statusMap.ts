import type { TaskStatus } from '@prisma/client'
import type { StatusGroup } from '@prisma/client'

/**
 * Mapa ÚNICO enum TaskStatus ↔ id fixo st_* (StatusSet default `sset_arkza`) ↔
 * grupo semântico (StatusGroup). Importado por TODAS as mutações de status para
 * manter o espelho `Task.status` (enum) e `Task.statusId` (FK) coerentes
 * (D-004 — convivência enum↔FK durante a transição).
 *
 * Os ids st_* são FIXOS e vêm do backfill da migração da Fase 1
 * (20260702000000_tasks_clickup_class). NÃO renomear sem migração de dados.
 *
 * A-100 (2026-07-17): `Task.statusId` é WRITE-ONLY até D-004 decidir a fonte
 * canônica (enum × FK). Todas as mutações continuam escrevendo o espelho, mas
 * NENHUMA leitura depende mais da coluna — quem precisa do id deriva do enum
 * via `statusIdFor(status)`. Isso elimina a fonte dupla viva sem migração.
 */

type StatusMapEntry = {
  statusId: string
  group: StatusGroup
}

const STATUS_MAP: Record<TaskStatus, StatusMapEntry> = {
  A_FAZER:             { statusId: 'st_a_fazer',             group: 'NOT_STARTED' },
  EM_ANDAMENTO:        { statusId: 'st_em_andamento',        group: 'ACTIVE' },
  AGUARDANDO_CLIENTE:  { statusId: 'st_aguardando_cliente',  group: 'ACTIVE' },
  AGUARDANDO_GESTOR:   { statusId: 'st_aguardando_gestor',   group: 'ACTIVE' },
  AGUARDANDO_CS:       { statusId: 'st_aguardando_cs',       group: 'ACTIVE' },
  EM_VALIDACAO:        { statusId: 'st_em_validacao',        group: 'ACTIVE' },
  AJUSTES_SOLICITADOS: { statusId: 'st_ajustes_solicitados', group: 'ACTIVE' },
  BLOQUEADO:           { statusId: 'st_bloqueado',           group: 'ACTIVE' },
  ATRASADO:            { statusId: 'st_atrasado',            group: 'ACTIVE' },
  CONCLUIDO:           { statusId: 'st_concluido',           group: 'DONE' },
  CANCELADO:           { statusId: 'st_cancelado',           group: 'CLOSED' },
}

/** Id fixo st_* correspondente ao enum (para escrever o espelho `statusId`). */
export function statusIdFor(status: TaskStatus): string {
  return STATUS_MAP[status].statusId
}

/** Grupo semântico do status (NOT_STARTED/ACTIVE/DONE/CLOSED). */
export function statusGroupFor(status: TaskStatus): StatusGroup {
  return STATUS_MAP[status].group
}

/** Está em grupo de conclusão (DONE ou CLOSED)? Base das automações "ao concluir". */
export function isDoneStatus(status: TaskStatus): boolean {
  const g = STATUS_MAP[status].group
  return g === 'DONE' || g === 'CLOSED'
}
