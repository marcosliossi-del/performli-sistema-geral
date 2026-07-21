/**
 * Derivação de METAS a partir do BUDGET mensal por plataforma (regra do Marcos,
 * 2026-07-21 — Operação Fundação).
 *
 * Definição literal do dono: "Investimento = budget que o cliente disponibiliza
 * sempre todo mês, métrica editável todo início de mês; com base nela, calcular
 * a meta do cliente + faturamento/roas esperado — para o health score saber
 * calcular a partir daí."
 *
 * DIREÇÃO (importante): aqui o `roasMinimo` é DECISÃO HUMANA (input editável) e o
 * FATURAMENTO é DERIVADO dele:
 *      spendGoal       = investimentoMeta + investimentoGoogle + investimentoTiktok
 *      faturamentoGoal = spendGoal × roasMinimo
 *      roasGoal        = roasMinimo
 *
 * Isto é o INVERSO da projeção automática do cron (`meta-projection.ts`), que
 * projeta o faturamento por crescimento e deriva o ROAS a partir dele. Regra de
 * convivência (decidida com o dono): quando o Marcos edita budget/ROAS mínimo do
 * MÊS CORRENTE, esta derivação SOBRESCREVE a projeção automática do mesmo mês —
 * budget é decisão humana e vence a projeção. Meses futuros seguem a projeção.
 *
 * Contrato PURO: sem I/O, sem Prisma — só matemática, para ser testável e reusado
 * do mesmo jeito no backend (action de edição do cliente) sem contas divergentes.
 */

export interface BudgetInput {
  investimentoMeta: number | null | undefined
  investimentoGoogle: number | null | undefined
  investimentoTiktok: number | null | undefined
  roasMinimo: number | null | undefined
}

export interface MetasDerivadas {
  /** Meta de investimento total do mês (soma dos 3 canais). null se nenhum canal informado. */
  spendGoal: number | null
  /** Meta de faturamento do mês = spendGoal × roasMinimo. null sem budget ou sem ROAS mínimo. */
  faturamentoGoal: number | null
  /** Meta de ROAS = o próprio ROAS mínimo informado. null se não informado. */
  roasGoal: number | null
}

/** Soma tratando null como "canal não informado" (não como zero-orçado). */
function somaBudget(
  meta: number | null | undefined,
  google: number | null | undefined,
  tiktok: number | null | undefined,
): number | null {
  const canais = [meta, google, tiktok].filter(
    (v): v is number => v != null && Number.isFinite(v),
  )
  if (canais.length === 0) return null
  return round2(canais.reduce((s, v) => s + v, 0))
}

/**
 * Deriva as metas do mês (SPEND / FATURAMENTO / ROAS) a partir do budget e do
 * ROAS mínimo. Regras de null:
 *  - Nenhum canal informado → spendGoal = null (e portanto faturamentoGoal = null).
 *  - Sem roasMinimo → só spendGoal (faturamentoGoal e roasGoal = null).
 */
export function computeMetasFromBudget(input: BudgetInput): MetasDerivadas {
  const spendGoal = somaBudget(
    input.investimentoMeta,
    input.investimentoGoogle,
    input.investimentoTiktok,
  )

  const roas =
    input.roasMinimo != null && Number.isFinite(input.roasMinimo) && input.roasMinimo > 0
      ? round2(input.roasMinimo)
      : null

  const faturamentoGoal =
    spendGoal != null && roas != null ? round2(spendGoal * roas) : null

  return { spendGoal, faturamentoGoal, roasGoal: roas }
}

/** Arredonda para 2 casas (dinheiro/ROAS) evitando ruído de ponto flutuante. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
