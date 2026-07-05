/**
 * Lógica compartilhada do Gerador de Proposta (Comercial).
 * Usada pelo client (defaults do form) e pelo route handler (preenche o template
 * tokenizado e gera o PDF). Mantém os valores idênticos ao template da Arkza.
 */

// Valores-base (idênticos ao template). Só mudam em caso específico.
export const DEFAULTS = {
  start6: 2500, start3: 3000,
  pro6: 3500, pro3: 4000,
  growth6: 5000, growth3: 5500,
}

export type Vals = typeof DEFAULTS

export const fmt = (n: number): string => Math.round(n).toLocaleString('pt-BR')

/** Economia no contrato = (mensal 3m − mensal 6m) × 6 meses. */
const econ = (v6: number, v3: number): number => (v3 - v6) * 6

/** Validade da proposta = hoje + 7 dias, em dd/mm/aaaa. */
export function validadeMais7(now: Date = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() + 7)
  return d.toLocaleDateString('pt-BR')
}

/** Sanitiza os valores recebidos (números inteiros >= 0), preenchendo com o default. */
export function normalizeVals(input: Partial<Record<keyof Vals, unknown>> | null | undefined): Vals {
  const out = { ...DEFAULTS }
  if (input) {
    for (const k of Object.keys(DEFAULTS) as (keyof Vals)[]) {
      const n = Number(input[k])
      if (Number.isFinite(n) && n >= 0) out[k] = Math.round(n)
    }
  }
  return out
}

/** Monta o mapa de tokens {{...}} a partir da loja + valores. */
export function buildTokens(loja: string, vals: Vals): Record<string, string> {
  const promo1 = Math.round(vals.pro6 * 0.8) // 20% off no 1º mês (plano Pro)
  return {
    LOJA: loja.trim(),
    V_START_6M: fmt(vals.start6),
    V_START_3M: fmt(vals.start3),
    V_PRO_6M: fmt(vals.pro6),
    V_PRO_3M: fmt(vals.pro3),
    V_GROWTH_6M: fmt(vals.growth6),
    V_GROWTH_3M: fmt(vals.growth3),
    ECON_START: fmt(econ(vals.start6, vals.start3)),
    ECON_PRO: fmt(econ(vals.pro6, vals.pro3)),
    ECON_GROWTH: fmt(econ(vals.growth6, vals.growth3)),
    PROMO_1M: fmt(promo1),
    PROMO_ECON: fmt(vals.pro6 - promo1),
    VALIDADE: validadeMais7(),
  }
}

/** Substitui todos os tokens {{X}} no template pelo valor correspondente. */
export function fillTemplate(html: string, tokens: Record<string, string>): string {
  let out = html
  for (const [k, v] of Object.entries(tokens)) {
    out = out.replaceAll(`{{${k}}}`, v)
  }
  return out
}
