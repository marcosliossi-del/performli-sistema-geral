/**
 * RBAC v2 — Campos sensíveis (financeiro/comercial) por model.
 *
 * Recorte de COLUNAS: mesmo quando um papel pode VER uma linha (scope) e a AÇÃO
 * é permitida (can), certos campos financeiros/comerciais NUNCA vão para
 * não-ADMIN. `serialize.stripSensitive()` consome este mapa.
 *
 * ── Distinção crítica: BUDGET DE MÍDIA (visível) vs FEE (invisível) ──────────
 * Verba/investimento de mídia e faturamento ESPERADO do cliente são dados de
 * PERFORMANCE — o gestor/analista precisa deles para operar tráfego. São
 * VISÍVEIS. Portanto os campos abaixo do Client NÃO entram no mapa:
 *   investimentoMeta, investimentoGoogle, investimentoTiktok, roasMinimo,
 *   cpaMaximo, faturamentoEsperado.
 * Já o FEE / valor do CONTRATO é dinheiro que a Arkza cobra do cliente —
 * financeiro/comercial. É INVISÍVEL para não-ADMIN. Por isso `contractValue`,
 * `feeAmount` e `billingDueDay` (cache de cobrança) do Client ENTRAM no mapa.
 *
 * Deny-by-default de exposição: na dúvida, um campo monetário de RECEITA DA
 * AGÊNCIA é sensível (ver HANDOFF_AGENTE_2.md).
 */

/** Models cobertos pelo mapa de campos sensíveis. */
export type SensitiveModel =
  | 'Client'
  | 'Contract'
  | 'Goal'
  | 'AsaasPayment'
  | 'AsaasSubscription'
  | 'Expense'

/**
 * Campos removidos para não-ADMIN, por model.
 *
 * `'*'` = o model inteiro é financeiro/comercial; nenhum campo deve vazar para
 * não-ADMIN (o serializer devolve `{}` / undefined). Usado quando expor
 * QUALQUER coluna já seria vazamento.
 */
export const SENSITIVE_FIELDS: Readonly<
  Record<SensitiveModel, readonly string[]>
> = {
  // Cliente: apenas os campos de RECEITA DA AGÊNCIA (fee/cobrança). Budget de
  // mídia e faturamento esperado permanecem visíveis (performance).
  Client: ['contractValue', 'feeAmount', 'billingDueDay'],

  // Contrato inteiro é jurídico/financeiro — SÓ ADMIN. Nada vaza.
  Contract: ['*'],

  // Meta: o valor-alvo é sensível QUANDO a meta é de receita/faturamento
  // (metric ∈ FATURAMENTO/TICKET_MEDIO/CAC etc. — ver isRevenueGoal()).
  // Como o mapa é estático por campo, `targetValue` é listado e o serializer
  // de Goal deve ser chamado com o contexto do `metric` (ver serialize.ts).
  Goal: ['targetValue'],

  // Pagamentos/assinaturas Asaas: financeiro puro — SÓ ADMIN.
  AsaasPayment: ['*'],
  AsaasSubscription: ['*'],

  // Despesas: financeiro puro — SÓ ADMIN.
  Expense: ['*'],
}

/**
 * Métricas de Goal consideradas RECEITA (meta de faturamento/receita), cujas
 * metas SUP/ANA/CS não podem ler. Metas operacionais (ROAS, CPL, CPA, CTR…)
 * permanecem visíveis.
 */
export const REVENUE_METRICS = [
  'FATURAMENTO',
  'TICKET_MEDIO',
  'SALES',
  'CAC',
] as const

export function isRevenueMetric(metric: string): boolean {
  return (REVENUE_METRICS as readonly string[]).includes(metric)
}

/** true se o model tem marcação de "tudo sensível" (`'*'`). */
export function isFullySensitiveModel(model: SensitiveModel): boolean {
  return SENSITIVE_FIELDS[model].includes('*')
}
