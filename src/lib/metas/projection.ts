/**
 * Projeção de metas (dia 1 de cada mês) e derivação do ROAS esperado.
 *
 * Contrato PURO compartilhado entre o serviço de projeção (cron) e a edição de
 * budget na ficha do cliente. Sem I/O, sem Prisma — só matemática, para poder
 * ser testado e reusado dos dois lados sem risco de duas contas divergentes.
 *
 * Regras de negócio (decididas com o dono, 2026-07):
 *  - E-commerce: cresce o FATURAMENTO em +15% ao mês.
 *  - Negócio local: cresce a MÉTRICA-RESULTADO (mensagens/leads/compras…) +20%.
 *  - Base do crescimento = MAIOR entre {realizado do mês anterior, meta anterior}
 *    — nunca reduz a ambição por um mês fraco, mas captura o crescimento real.
 *  - Budget de mídia é FIXO (mantém o do mês anterior); só muda manualmente.
 *  - ROAS esperado é DERIVADO (nunca armazenado como fonte da verdade):
 *      ROAS esperado = faturamento projetado ÷ investimento total.
 *    Recalcula sempre que o faturamento-alvo OU o budget mudam.
 *  - Taxas (ROAS/CPL/CPA/CTR) NÃO crescem por % — são carregadas do mês anterior.
 */

/** Crescimento mensal por tipo de negócio (fração). */
export const CRESCIMENTO_ECOMMERCE = 0.15
export const CRESCIMENTO_LOCAL = 0.20

/**
 * Alvo projetado do próximo mês.
 * base = max(realizado, metaAnterior); alvo = base × (1 + crescimento).
 * Qualquer entrada nula/negativa é tratada como 0 (sem histórico ⇒ base 0).
 */
export function projetarAlvo(
  realizadoMesAnterior: number | null | undefined,
  metaMesAnterior: number | null | undefined,
  crescimento: number,
): number {
  const realizado = Math.max(0, Number(realizadoMesAnterior ?? 0) || 0)
  const meta = Math.max(0, Number(metaMesAnterior ?? 0) || 0)
  const base = Math.max(realizado, meta)
  return round2(base * (1 + crescimento))
}

/** Soma dos budgets por plataforma = investimento total (nulls ⇒ 0). */
export function investimentoTotal(
  meta: number | null | undefined,
  google: number | null | undefined,
  tiktok: number | null | undefined,
): number {
  return round2(
    (Number(meta ?? 0) || 0) +
    (Number(google ?? 0) || 0) +
    (Number(tiktok ?? 0) || 0),
  )
}

/**
 * ROAS esperado derivado = faturamento projetado ÷ investimento total.
 * Sem budget (total ≤ 0) o ROAS é indeterminado → null (nunca divide por zero,
 * nunca inventa um número).
 */
export function roasEsperado(
  faturamentoProjetado: number | null | undefined,
  investimentoTotalValor: number | null | undefined,
): number | null {
  const fat = Number(faturamentoProjetado ?? 0) || 0
  const inv = Number(investimentoTotalValor ?? 0) || 0
  if (inv <= 0) return null
  return round2(fat / inv)
}

/** Arredonda para 2 casas (dinheiro/ROAS) evitando ruído de ponto flutuante. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
