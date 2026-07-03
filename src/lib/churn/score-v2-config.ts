/**
 * Score de Risco de Churn v2 — pesos e faixas (Bloco 6 da auditoria).
 *
 * ATENÇÃO: os pesos abaixo são PROPOSTOS pela auditoria — hipótese até
 * docs/churn-score-backtest.md registrar recall T-6 >=60% e FP <=20%. Enquanto
 * `uncalibrated` for `true`, NENHUM peso deve alimentar automação em produção
 * (Alert/task/War Room). O backtest da Fase 0 valida (ou reprova) estes números
 * contra churns reais ANTES de qualquer código de score entrar em produção.
 *
 * Soma dos pesos = 100. Fonte de cada fator: Bloco 6 de
 * docs/AUDITORIA_CHURN_SILENCIOSO.md.
 *
 * CANDIDATO FUTURO — "downgrade de produto (60 dias)" (Fase 3 anti-churn):
 * a partir desta fatia, ClientProductChange passa a acumular o histórico de
 * remoções de produto (antes inexistente — `Client.produtos` nunca teve
 * mutação). NÃO é fator do score AGORA: os pesos abaixo somam 100 e o backtest
 * vigente os referencia — mexer aqui invalidaria a calibração. Este fator entra
 * como candidato `uncalibrated` na REEXECUÇÃO do backtest em ~90 dias, quando já
 * houver série temporal suficiente para medir o poder preditivo da remoção de
 * produto sobre o churn. Até lá: nenhum código de score o consome.
 */

export type ChurnFactorKey =
  | 'cronicoRegularRuim'
  | 'performanceRecente'
  | 'tendenciaSpend'
  | 'fichaCs'
  | 'stalenessFicha'
  | 'suporteAtrasado'
  | 'silencio'
  | 'feedbackReincidencia'
  | 'inadimplencia'
  | 'idadeContrato'

export type ChurnFactorConfig = {
  /** Peso do fator no score 0-100. */
  weight: number
  /** Rótulo operacional (linguagem de negócio, não técnica). */
  label: string
  /**
   * `true` = peso ainda é hipótese da auditoria, não calibrado contra churns
   * reais. Só vira `false` quando o backtest atingir as metas e o doc for
   * atualizado. Enquanto `true`, não pode disparar automação.
   */
  uncalibrated: boolean
}

/** Versão dos pesos — gravada no relatório e no AuditLog para rastreabilidade. */
export const CHURN_SCORE_WEIGHTS_VERSION = 'v2-proposta-2026-07-03'

export const CHURN_SCORE_WEIGHTS_V2: Record<ChurnFactorKey, ChurnFactorConfig> = {
  cronicoRegularRuim: { weight: 18, label: 'Regular/Ruim crônico', uncalibrated: true },
  performanceRecente: { weight: 12, label: 'Performance recente fraca', uncalibrated: true },
  tendenciaSpend: { weight: 14, label: 'Investimento (spend) caindo', uncalibrated: true },
  fichaCs: { weight: 12, label: 'Ficha CS ruim (NPS/relacionamento/engajamento)', uncalibrated: true },
  stalenessFicha: { weight: 5, label: 'Ficha CS desatualizada', uncalibrated: true },
  suporteAtrasado: { weight: 8, label: 'Demandas de suporte atrasadas', uncalibrated: true },
  silencio: { weight: 10, label: 'Cliente em silêncio', uncalibrated: true },
  feedbackReincidencia: { weight: 7, label: 'Feedback negativo reincidente', uncalibrated: true },
  inadimplencia: { weight: 8, label: 'Fatura em atraso', uncalibrated: true },
  idadeContrato: { weight: 6, label: 'Idade de contrato na janela de risco', uncalibrated: true },
}

/** Ordem canônica dos fatores (para iteração determinística). */
export const CHURN_FACTOR_KEYS: ChurnFactorKey[] = [
  'cronicoRegularRuim',
  'performanceRecente',
  'tendenciaSpend',
  'fichaCs',
  'stalenessFicha',
  'suporteAtrasado',
  'silencio',
  'feedbackReincidencia',
  'inadimplencia',
  'idadeContrato',
]

export type ChurnBand = 'SAUDAVEL' | 'ATENCAO' | 'ALTO' | 'CRITICO'

/** Faixas de score → banda. SAUDAVEL<40, ATENCAO 40-64, ALTO 65-79, CRITICO>=80. */
export const CHURN_SCORE_BANDS_V2 = {
  ATENCAO_MIN: 40,
  ALTO_MIN: 65,
  CRITICO_MIN: 80,
} as const

/** Limiar de "risco relevante" usado pelas métricas do backtest (recall/FP). */
export const CHURN_RISK_THRESHOLD = CHURN_SCORE_BANDS_V2.ALTO_MIN // 65

export function classifyChurnScore(score: number): ChurnBand {
  if (score >= CHURN_SCORE_BANDS_V2.CRITICO_MIN) return 'CRITICO'
  if (score >= CHURN_SCORE_BANDS_V2.ALTO_MIN) return 'ALTO'
  if (score >= CHURN_SCORE_BANDS_V2.ATENCAO_MIN) return 'ATENCAO'
  return 'SAUDAVEL'
}
