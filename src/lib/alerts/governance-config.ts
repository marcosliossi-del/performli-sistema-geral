/**
 * Governança de Alertas (Fase 2 — anti-churn calibrado)
 *
 * "Um alerta sem dono e SLA é um badge com push notification."
 *
 * Este arquivo é a FONTE ÚNICA da governança de cada tipo de alerta: quem é o
 * dono, em quanto tempo precisa ser reconhecido (SLA), para quem escala se
 * estourar, qual o teto diário saudável (circuit breaker) e qual a severidade
 * operacional. É config TS VERSIONADA (não tabela) de propósito: mudar
 * governança é mudança de código, revisada e auditável no diff.
 *
 * ⚠️ O mapa `ALERT_GOVERNANCE` é EXAUSTIVO sobre `AlertType` via
 * `satisfies Record<AlertType, AlertGovernance>`. Criar um novo valor no enum
 * `AlertType` SEM adicioná-lo aqui QUEBRA O BUILD — isso é intencional: nenhum
 * alerta nasce órfão de dono e SLA.
 */

import type { AlertType } from '@prisma/client'

/**
 * Papel-dono de um alerta. Semântica OPERACIONAL (rotina Arkza), não é o enum
 * de autorização (RBAC `Role`): 'GESTOR' = gestor de tráfego da carteira,
 * 'HEAD' = head de operação/retenção. Usado para roteamento e leitura humana,
 * NUNCA como barreira de autorização — a posse de escrita continua no RBAC.
 */
export type GovernanceRole = 'ADMIN' | 'CS' | 'GESTOR' | 'HEAD'

export type GovernanceSeverity = 'ALTA' | 'MEDIA' | 'BAIXA'

export type AlertGovernance = {
  /** Quem é o responsável por reconhecer e agir sobre este tipo de alerta. */
  ownerRole: GovernanceRole
  /** Prazo (horas) desde createdAt para reconhecer antes de escalar. */
  slaHours: number
  /** Papel para quem o SLA estourado escala (dente do SLA). */
  escalationTarget: GovernanceRole
  /**
   * Teto diário saudável de alertas deste tipo (circuit breaker). Acima disso
   * por 3 dias seguidos, o breaker denuncia "alerta gritando demais" — mas NÃO
   * suprime (sem perda de sinal).
   */
  maxPerDayPerOwner: number
  /** Severidade operacional (ordena a lista e o dashboard de saúde). */
  severity: GovernanceSeverity
}

/**
 * EXAUSTIVO sobre AlertType. Uma linha por tipo, com justificativa.
 * Valores calibrados pela realidade da Arkza (~30 clientes, dono real por rotina).
 */
export const ALERT_GOVERNANCE = {
  // Queda de saúde para crítico: gestor da carteira age no mesmo dia; se não
  // reconhecer em 24h, o HEAD assume — cliente crítico não pode ficar órfão.
  STATUS_DROPPED_TO_RUIM:        { ownerRole: 'GESTOR', slaHours: 24, escalationTarget: 'HEAD',  maxPerDayPerOwner: 5,  severity: 'ALTA' },
  // Queda para regular: atenção do gestor, prazo mais folgado; escala ao HEAD.
  STATUS_DROPPED_TO_REGULAR:     { ownerRole: 'GESTOR', slaHours: 48, escalationTarget: 'HEAD',  maxPerDayPerOwner: 8,  severity: 'MEDIA' },
  // Melhora para ótimo: sinal positivo, sem urgência; dono é o gestor só p/ ciência.
  STATUS_IMPROVED_TO_OTIMO:      { ownerRole: 'GESTOR', slaHours: 72, escalationTarget: 'HEAD',  maxPerDayPerOwner: 20, severity: 'BAIXA' },
  // Integração parou de atualizar: risco de falha silenciosa — ADMIN (dono técnico)
  // resolve em até 48h; escala ao HEAD (dado velho contamina todas as telas).
  SYNC_FAILED:                   { ownerRole: 'ADMIN',  slaHours: 48, escalationTarget: 'HEAD',  maxPerDayPerOwner: 4,  severity: 'ALTA' },
  // Orçamento esgotado: gestor precisa reagir rápido (campanha pode ter parado).
  BUDGET_EXHAUSTED:              { ownerRole: 'GESTOR', slaHours: 12, escalationTarget: 'HEAD',  maxPerDayPerOwner: 6,  severity: 'ALTA' },
  // Budget quase esgotado: aviso preventivo do gestor, prazo de 1 dia.
  BUDGET_WARNING:                { ownerRole: 'GESTOR', slaHours: 24, escalationTarget: 'HEAD',  maxPerDayPerOwner: 10, severity: 'MEDIA' },
  // Queda 24h de KPI: ruído alto por natureza (oscilação diária); teto generoso,
  // dono é o gestor, sem escalação agressiva.
  KPI_DROP_24H:                  { ownerRole: 'GESTOR', slaHours: 48, escalationTarget: 'HEAD',  maxPerDayPerOwner: 15, severity: 'BAIXA' },
  // Alta 24h de KPI: sinal positivo/informativo; teto alto, severidade baixa.
  KPI_SPIKE_24H:                 { ownerRole: 'GESTOR', slaHours: 72, escalationTarget: 'HEAD',  maxPerDayPerOwner: 15, severity: 'BAIXA' },
  // ROAS abaixo da meta há 2 semanas: conta crítica de verdade — gestor em 24h,
  // escala ao HEAD; teto baixo (deveria ser raro).
  ROAS_BELOW_TARGET_2W:          { ownerRole: 'GESTOR', slaHours: 24, escalationTarget: 'HEAD',  maxPerDayPerOwner: 3,  severity: 'ALTA' },
  // Faturamento < 70% na 2ª semana: crítico de negócio; HEAD é o dono (visão
  // agência), escala ao ADMIN.
  FATURAMENTO_BELOW_70PCT_WEEK2: { ownerRole: 'HEAD',   slaHours: 24, escalationTarget: 'ADMIN', maxPerDayPerOwner: 3,  severity: 'ALTA' },
  // Contrato vencendo: rotina financeira/comercial — ADMIN cuida, prazo largo.
  CONTRACT_EXPIRING_SOON:        { ownerRole: 'ADMIN',  slaHours: 72, escalationTarget: 'HEAD',  maxPerDayPerOwner: 4,  severity: 'MEDIA' },
  // War Room sem revisão semanal: dono é o HEAD (governa contas críticas).
  WARROOM_NO_REVIEW:             { ownerRole: 'HEAD',   slaHours: 48, escalationTarget: 'ADMIN', maxPerDayPerOwner: 4,  severity: 'MEDIA' },
  // Critério de saída atingido: avaliar encerramento — HEAD decide, sem urgência.
  WARROOM_EXIT_CRITERIA_MET:     { ownerRole: 'HEAD',   slaHours: 72, escalationTarget: 'ADMIN', maxPerDayPerOwner: 6,  severity: 'BAIXA' },
  // War Room em regressão: critério deixou de ser cumprido — HEAD reage em 24h.
  WARROOM_REGRESSION:            { ownerRole: 'HEAD',   slaHours: 24, escalationTarget: 'ADMIN', maxPerDayPerOwner: 4,  severity: 'ALTA' },
  // Fatura vencida: contas a receber — ADMIN (financeiro) roda a régua; dinheiro
  // em risco, prazo curto.
  INVOICE_OVERDUE:               { ownerRole: 'ADMIN',  slaHours: 24, escalationTarget: 'HEAD',  maxPerDayPerOwner: 8,  severity: 'ALTA' },
  // Cliente ativo sem cobrança no Asaas: buraco financeiro silencioso — ADMIN.
  CLIENT_WITHOUT_BILLING:        { ownerRole: 'ADMIN',  slaHours: 48, escalationTarget: 'HEAD',  maxPerDayPerOwner: 5,  severity: 'MEDIA' },
  // Anti-churn: cliente em risco e silencioso — CS é dona da retenção, age em
  // 24h; escala ao ADMIN. Severidade ALTA (é o coração do plano anti-churn).
  ANTICHURN_ACTION_NEEDED:       { ownerRole: 'CS',     slaHours: 24, escalationTarget: 'ADMIN', maxPerDayPerOwner: 6,  severity: 'ALTA' },
  // Check-in da semana faltando: gestor da carteira preenche; escala ao HEAD.
  CHECKIN_MISSING:               { ownerRole: 'GESTOR', slaHours: 48, escalationTarget: 'HEAD',  maxPerDayPerOwner: 10, severity: 'MEDIA' },
  // Check-in reprovado sem correção: gestor corrige rápido (evidência travada).
  CHECKIN_REJECTED_STALE:        { ownerRole: 'GESTOR', slaHours: 24, escalationTarget: 'HEAD',  maxPerDayPerOwner: 6,  severity: 'MEDIA' },
  // Automação de tarefa (inclui as ESCALAÇÕES de SLA e meta-alertas do breaker):
  // dono ADMIN, prazo largo — é o canal de meta-sinal, não deve auto-escalar.
  TASK_AUTOMATION:               { ownerRole: 'ADMIN',  slaHours: 72, escalationTarget: 'ADMIN', maxPerDayPerOwner: 30, severity: 'BAIXA' },
} satisfies Record<AlertType, AlertGovernance>

/** Acesso tipado à governança de um tipo (sempre definido — mapa exaustivo). */
export function getAlertGovernance(type: AlertType): AlertGovernance {
  return ALERT_GOVERNANCE[type]
}

/** Rótulos operacionais (pt-BR) dos papéis-dono, para a UI. */
export const GOVERNANCE_ROLE_LABELS: Record<GovernanceRole, string> = {
  ADMIN: 'Admin',
  CS: 'Sucesso do Cliente',
  GESTOR: 'Gestor da conta',
  HEAD: 'Head de operação',
}

/**
 * Rótulos operacionais (pt-BR) por tipo de alerta — fonte única para telas de
 * governança. EXAUSTIVO sobre AlertType (satisfies), pelo mesmo motivo do mapa
 * de governança: tipo novo sem rótulo quebra o build.
 */
export const ALERT_TYPE_LABELS = {
  STATUS_DROPPED_TO_RUIM:        'Saúde caiu para crítica',
  STATUS_DROPPED_TO_REGULAR:     'Saúde caiu para atenção',
  STATUS_IMPROVED_TO_OTIMO:      'Saúde melhorou para saudável',
  SYNC_FAILED:                   'Integração parou de atualizar',
  BUDGET_EXHAUSTED:              'Orçamento esgotado',
  BUDGET_WARNING:                'Orçamento quase esgotado',
  KPI_DROP_24H:                  'Queda de indicador em 24h',
  KPI_SPIKE_24H:                 'Alta de indicador em 24h',
  ROAS_BELOW_TARGET_2W:          'ROAS abaixo da meta há 2 semanas',
  FATURAMENTO_BELOW_70PCT_WEEK2: 'Faturamento abaixo de 70% na 2ª semana',
  CONTRACT_EXPIRING_SOON:        'Contrato vencendo',
  WARROOM_NO_REVIEW:             'War Room sem revisão semanal',
  WARROOM_EXIT_CRITERIA_MET:     'Critério de saída da War Room atingido',
  WARROOM_REGRESSION:            'War Room em regressão',
  INVOICE_OVERDUE:               'Fatura vencida',
  CLIENT_WITHOUT_BILLING:        'Cliente ativo sem cobrança',
  ANTICHURN_ACTION_NEEDED:       'Cliente em risco sem ação',
  CHECKIN_MISSING:               'Cliente sem check-in na semana',
  CHECKIN_REJECTED_STALE:        'Check-in reprovado sem correção',
  TASK_AUTOMATION:               'Automação / escalação de alerta',
} satisfies Record<AlertType, string>
