/**
 * RBAC v2 — Policy Engine (Agente 2). Barrel de re-exports.
 *
 * Funções puras, deny-by-default. Composição de segurança:
 *   normalizeRole (entrada) → can (ação) → scope (linhas) → stripSensitive
 *   (colunas) / assertTaskPatchAllowed (campo).
 *
 * Este módulo NÃO toca em rotas/actions/UI (isso é do Agente 3) nem no banco.
 */

export {
  type Role5,
  ROLE5_ALL,
  normalizeRole,
  isRole5,
} from './roles'

export {
  type Action,
  type Module,
  PERMISSION_MATRIX,
  can,
} from './permissions'

export { scopeClients, scopeTasks } from './scope'

export {
  type SensitiveModel,
  SENSITIVE_FIELDS,
  REVENUE_METRICS,
  isRevenueMetric,
  isFullySensitiveModel,
} from './sensitiveFields'

export { stripSensitive, stripSensitiveMany } from './serialize'

export {
  GESTOR_ALLOWED_TASK_FIELDS,
  assertTaskPatchAllowed,
  isTaskPatchAllowed,
} from './taskFieldGuard'

export { runRbacSelfTest, type RbacSelfTestResult } from './selftest'
