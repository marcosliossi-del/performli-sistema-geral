/**
 * RBAC v2 — Matriz de permissões (Módulo × Ação × Papel), deny-by-default.
 *
 * Fonte da verdade: matriz oficial da missão do Agente 2. Funções PURAS.
 * NUNCA há bypass: o que não está explicitamente listado é NEGADO.
 *
 * O escopo (carteira do GESTOR) NÃO é decidido aqui — `can()` responde apenas
 * "o papel pode, em tese, esta ação neste módulo?". O recorte por cliente vive
 * em `scope.ts`; o recorte por campo (fee, metas de receita) vive em
 * `sensitiveFields.ts`/`serialize.ts`. Assim a autorização é composta:
 *   can() (ação) → scope (linhas) → serialize (colunas).
 *
 * Ambiguidades da especificação foram resolvidas SEMPRE por NEGAR (ver
 * HANDOFF_AGENTE_2.md, seção "Decisões por negação").
 */

import type { Role5 } from './roles'

/** Ações possíveis. `update_status_only` é o update de campo restrito do GESTOR. */
export type Action =
  | 'view'
  | 'create'
  | 'update'
  | 'delete'
  | 'update_status_only'

/** Módulos do sistema (espelham a navegação/áreas do Performli). */
export type Module =
  | 'tarefas'
  | 'cockpit'
  | 'clientes'
  | 'operacao'
  | 'warRoom'
  | 'comercial'
  | 'financeiro'
  | 'juridico'
  | 'gestaoEquipeVisaoGestor'
  | 'gestaoEquipeMetas'
  | 'gestaoEquipeEquipe'
  | 'inteligencia'

type ActionSet = readonly Action[]
type ModuleMatrix = Readonly<Record<Role5, ActionSet>>

const FULL_CRUD = ['view', 'create', 'update', 'delete'] as const
const NONE = [] as const
const VIEW_ONLY = ['view'] as const

/**
 * Matriz completa. Cada célula é o conjunto de ações permitidas ao papel
 * naquele módulo. Célula vazia = 🔒 (nem leitura).
 */
export const PERMISSION_MATRIX = {
  // Tarefas: staff completo em todos os clientes; GESTOR vê a carteira e só
  // altera o STATUS (nível de campo — reforçado por taskFieldGuard.ts).
  tarefas: {
    ADMIN: FULL_CRUD,
    SUPERVISOR_TRAFEGO: FULL_CRUD,
    ANALISTA_TRAFEGO: FULL_CRUD,
    CS: FULL_CRUD,
    GESTOR_TRAFEGO: ['view', 'update_status_only'],
  },

  // Cockpit: leitura para todos (GESTOR limitado à carteira via scope).
  cockpit: {
    ADMIN: VIEW_ONLY,
    SUPERVISOR_TRAFEGO: VIEW_ONLY,
    ANALISTA_TRAFEGO: VIEW_ONLY,
    CS: VIEW_ONLY,
    GESTOR_TRAFEGO: VIEW_ONLY,
  },

  // Clientes (lista, 360, check-ins, validação CS, comunicação, relatórios).
  clientes: {
    ADMIN: FULL_CRUD,
    SUPERVISOR_TRAFEGO: FULL_CRUD,
    ANALISTA_TRAFEGO: FULL_CRUD,
    CS: FULL_CRUD,
    GESTOR_TRAFEGO: FULL_CRUD, // escopo restrito à carteira via scopeClients()
  },

  // Operação (aceite, processos, recorrências, registro): idem clientes.
  operacao: {
    ADMIN: FULL_CRUD,
    SUPERVISOR_TRAFEGO: FULL_CRUD,
    ANALISTA_TRAFEGO: FULL_CRUD,
    CS: FULL_CRUD,
    GESTOR_TRAFEGO: FULL_CRUD, // escopo restrito à carteira via scopeClients()
  },

  // War Room e alertas: todos; GESTOR só carteira (via scope).
  warRoom: {
    ADMIN: FULL_CRUD,
    SUPERVISOR_TRAFEGO: FULL_CRUD,
    ANALISTA_TRAFEGO: FULL_CRUD,
    CS: FULL_CRUD,
    GESTOR_TRAFEGO: FULL_CRUD, // escopo restrito à carteira via scopeClients()
  },

  // Comercial (funil, CRM, dashboard comercial, pipeline, leads): SÓ ADMIN.
  comercial: {
    ADMIN: FULL_CRUD,
    SUPERVISOR_TRAFEGO: NONE,
    ANALISTA_TRAFEGO: NONE,
    CS: NONE,
    GESTOR_TRAFEGO: NONE,
  },

  // Financeiro (DRE, /financeiro): SÓ ADMIN.
  financeiro: {
    ADMIN: FULL_CRUD,
    SUPERVISOR_TRAFEGO: NONE,
    ANALISTA_TRAFEGO: NONE,
    CS: NONE,
    GESTOR_TRAFEGO: NONE,
  },

  // Jurídico (contratos): SÓ ADMIN.
  juridico: {
    ADMIN: FULL_CRUD,
    SUPERVISOR_TRAFEGO: NONE,
    ANALISTA_TRAFEGO: NONE,
    CS: NONE,
    GESTOR_TRAFEGO: NONE,
  },

  // Gestão de equipe → visão do gestor (desempenho).
  // ADMIN tudo; SUP/ANA/CS leem TODOS os gestores; GESTOR lê só o próprio
  // (recorte "próprio" é aplicado na camada de dados via userId, não aqui).
  gestaoEquipeVisaoGestor: {
    ADMIN: FULL_CRUD,
    SUPERVISOR_TRAFEGO: VIEW_ONLY,
    ANALISTA_TRAFEGO: VIEW_ONLY,
    CS: VIEW_ONLY,
    GESTOR_TRAFEGO: VIEW_ONLY, // só o próprio desempenho (self-scope na DAL)
  },

  // Gestão de equipe → metas.
  // ADMIN tudo; SUP/ANA/CS leem APENAS metas operacionais (metas de
  // faturamento/receita são removidas por stripSensitive); GESTOR 🔒.
  gestaoEquipeMetas: {
    ADMIN: FULL_CRUD,
    SUPERVISOR_TRAFEGO: VIEW_ONLY, // sem campos de receita (serialize)
    ANALISTA_TRAFEGO: VIEW_ONLY, // sem campos de receita (serialize)
    CS: VIEW_ONLY, // sem campos de receita (serialize)
    GESTOR_TRAFEGO: NONE,
  },

  // Gestão de equipe → equipe, atribuições, visão CEO, settings/admin: SÓ ADMIN.
  gestaoEquipeEquipe: {
    ADMIN: FULL_CRUD,
    SUPERVISOR_TRAFEGO: NONE,
    ANALISTA_TRAFEGO: NONE,
    CS: NONE,
    GESTOR_TRAFEGO: NONE,
  },

  // Inteligência (agentes IA, base de conhecimento, painel analítico):
  // todos veem; contexto = scopeClients do papel; NUNCA dado financeiro para
  // não-ADMIN (garantido por serialize.ts + montagem de contexto no Agente 3).
  inteligencia: {
    ADMIN: VIEW_ONLY,
    SUPERVISOR_TRAFEGO: VIEW_ONLY,
    ANALISTA_TRAFEGO: VIEW_ONLY,
    CS: VIEW_ONLY,
    GESTOR_TRAFEGO: VIEW_ONLY, // contexto restrito à carteira via scopeClients()
  },
} as const satisfies Readonly<Record<Module, ModuleMatrix>>

/**
 * Decisão de autorização pura, deny-by-default.
 * @returns true somente se a matriz listar explicitamente `action` para
 *          `role` em `module`. Papel/módulo/ação desconhecidos → false.
 */
export function can(role: Role5, action: Action, module: Module): boolean {
  const moduleMatrix = PERMISSION_MATRIX[module]
  if (!moduleMatrix) return false
  const allowed = moduleMatrix[role]
  if (!allowed) return false
  return allowed.includes(action)
}
