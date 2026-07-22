import { MetricType } from '@prisma/client'

/**
 * Fonte ÚNICA das opções de métrica de meta (labels operacionais).
 * Consumido pelo GoalFormModal (modal de nova meta) e pela MetasBulkTable
 * (grade em massa). Não duplicar listas: qualquer novo label entra aqui.
 */
export type MetricOption = { value: MetricType; label: string; hint: string }

export const ECOMMERCE_WEEKLY: MetricOption[] = [
  { value: 'ROAS',           label: 'ROAS',                       hint: 'ex: 4.0'   },
  { value: 'FATURAMENTO',    label: 'Faturamento (R$)',           hint: 'ex: 50000' },
  { value: 'INVESTMENT',     label: 'Investimento Semanal (R$)',  hint: 'ex: 2500'  },
  { value: 'CAC',            label: 'CAC (Custo por Aquisição)',  hint: 'ex: 80.00' },
  { value: 'TAXA_CONVERSAO', label: 'Taxa de Conversão (%)',      hint: 'ex: 2.5'   },
  { value: 'TICKET_MEDIO',   label: 'Ticket Médio (R$)',          hint: 'ex: 300'   },
  { value: 'CPS',            label: 'Custo por Sessão (R$)',      hint: 'ex: 0.50'  },
  { value: 'CPA',            label: 'CPA (Custo por Aquisição)',  hint: 'ex: 60.00' },
  { value: 'CONVERSIONS',    label: 'Conversões / Compras',       hint: 'ex: 80'    },
  { value: 'CTR',            label: 'CTR (%)',                    hint: 'ex: 2.5'   },
  { value: 'CPC',            label: 'CPC (R$)',                   hint: 'ex: 1.50'  },
]

export const ECOMMERCE_MONTHLY: MetricOption[] = [
  { value: 'ROAS',           label: 'ROAS Esperado',             hint: 'ex: 4.0'    },
  { value: 'FATURAMENTO',    label: 'Faturamento Meta (R$)',     hint: 'ex: 80000'  },
  { value: 'SPEND',          label: 'Budget Mensal (R$)',        hint: 'ex: 10000'  },
  { value: 'CAC',            label: 'CAC Meta (R$)',             hint: 'ex: 80.00'  },
  { value: 'CONVERSIONS',    label: 'Compras Meta',              hint: 'ex: 200'    },
  { value: 'TAXA_CONVERSAO', label: 'Taxa de Conversão (%)',     hint: 'ex: 2.5'    },
  { value: 'TICKET_MEDIO',   label: 'Ticket Médio (R$)',         hint: 'ex: 350'    },
  { value: 'CPS',            label: 'Custo por Sessão (R$)',     hint: 'ex: 0.50'   },
]

export const LOCAL_WEEKLY: MetricOption[] = [
  { value: 'LEADS',          label: 'Leads Gerados',             hint: 'ex: 50'    },
  { value: 'MENSAGENS',      label: 'Mensagens Recebidas',       hint: 'ex: 150'   },
  { value: 'CONVERSIONS',    label: 'Compras (Meta Ads)',        hint: 'ex: 30'    },
  { value: 'FATURAMENTO',    label: 'Faturamento (R$)',          hint: 'ex: 5000'  },
  { value: 'SEGUIDORES',     label: 'Seguidores Ganhos',         hint: 'ex: 200'   },
  { value: 'VISITAS_PERFIL', label: 'Visitas ao Perfil',         hint: 'ex: 500'   },
  { value: 'LIGACOES',       label: 'Ligações Recebidas',        hint: 'ex: 30'    },
  { value: 'AGENDAMENTOS',   label: 'Agendamentos',              hint: 'ex: 20'    },
  { value: 'CPL',            label: 'CPL (Custo por Lead)',      hint: 'ex: 25.00' },
  { value: 'CTR',            label: 'CTR (%)',                   hint: 'ex: 2.5'   },
  { value: 'CPC',            label: 'CPC (R$)',                  hint: 'ex: 1.50'  },
  { value: 'INVESTMENT',     label: 'Investimento Semanal (R$)', hint: 'ex: 2500'  },
]

export const LOCAL_MONTHLY: MetricOption[] = [
  { value: 'LEADS',          label: 'Leads Gerados',             hint: 'ex: 200'   },
  { value: 'MENSAGENS',      label: 'Mensagens Recebidas',       hint: 'ex: 500'   },
  { value: 'CONVERSIONS',    label: 'Compras (Meta Ads)',        hint: 'ex: 100'   },
  { value: 'FATURAMENTO',    label: 'Faturamento (R$)',          hint: 'ex: 15000' },
  { value: 'SEGUIDORES',     label: 'Seguidores Ganhos',         hint: 'ex: 800'   },
  { value: 'VISITAS_PERFIL', label: 'Visitas ao Perfil',         hint: 'ex: 2000'  },
  { value: 'LIGACOES',       label: 'Ligações Recebidas',        hint: 'ex: 100'   },
  { value: 'AGENDAMENTOS',   label: 'Agendamentos',              hint: 'ex: 60'    },
  { value: 'CPL',            label: 'CPL (Custo por Lead)',      hint: 'ex: 20.00' },
  { value: 'SPEND',          label: 'Budget Mensal (R$)',        hint: 'ex: 5000'  },
]

/**
 * Métricas-RESULTADO possíveis como MÉTRICA PRINCIPAL de um cliente local/B2B
 * na grade de metas. Cada cliente escolhe a sua: um delivery mede Compras (Meta
 * Ads), uma clínica mede Agendamentos, etc. Exclui custo-alvo (CPL/CPA), budget
 * (SPEND) e faturamento — esses têm colunas próprias.
 * Labels iguais aos do GoalFormModal para consistência.
 */
export const LOCAL_RESULT_METRICS: MetricOption[] = [
  { value: 'CONVERSIONS',    label: 'Compras (Meta Ads)', hint: 'ex: 100' },
  { value: 'LEADS',          label: 'Leads',              hint: 'ex: 200' },
  { value: 'MENSAGENS',      label: 'Mensagens',          hint: 'ex: 500' },
  { value: 'AGENDAMENTOS',   label: 'Agendamentos',       hint: 'ex: 60'  },
  { value: 'LIGACOES',       label: 'Ligações',           hint: 'ex: 100' },
  { value: 'SEGUIDORES',     label: 'Seguidores',         hint: 'ex: 800' },
  { value: 'VISITAS_PERFIL', label: 'Visitas ao perfil',  hint: 'ex: 2000' },
]

/** Conjunto das métricas-resultado locais (lookup rápido). */
export const LOCAL_RESULT_METRIC_SET: Set<MetricType> = new Set(
  LOCAL_RESULT_METRICS.map((m) => m.value),
)

/** Custo-alvo correto para a métrica principal: CPL só p/ LEADS, CPA p/ o resto. */
export function costMetricFor(metric: MetricType): 'CPL' | 'CPA' {
  return metric === 'LEADS' ? 'CPL' : 'CPA'
}

export function costLabelFor(metric: MetricType): 'CPL' | 'CPA' {
  return costMetricFor(metric)
}

/**
 * FONTE ÚNICA da eleição da MÉTRICA-RESULTADO PRINCIPAL de um cliente local/B2B
 * a partir das Goals do mês (regra 0 · DADO AMARRADO — a métrica principal é
 * derivada da Goal, NÃO um campo novo no Client). Regra idêntica à da grade
 * `/agency/metas` (fetchMonthlyGoals) e do `fetchMonthProgress`: entre as Goals
 * cuja métrica é resultado-local (LOCAL_RESULT_METRIC_SET) com alvo > 0, vence a
 * MAIS RECENTE. O chamador DEVE passar as goals já ordenadas por `updatedAt asc`
 * (a última iterada prevalece). Retorna null quando o cliente ainda não tem
 * meta-resultado no mês.
 *
 * Existe para que health-derive (pacing do Cockpit) e progress (grade de metas)
 * consumam a MESMA eleição — sem isso, o mesmo cliente poderia ter "Mensagens"
 * como principal numa tela e "Leads" noutra.
 */
export function electPrimaryLocalGoal(
  goalsOrderedByUpdatedAtAsc: Array<{ metric: MetricType; targetValue: number | { toString(): string } }>,
): { metric: MetricType; goal: number } | null {
  let elected: { metric: MetricType; goal: number } | null = null
  for (const g of goalsOrderedByUpdatedAtAsc) {
    if (!LOCAL_RESULT_METRIC_SET.has(g.metric)) continue
    const goal = Number(g.targetValue)
    if (goal > 0) elected = { metric: g.metric, goal }
  }
  return elected
}

/**
 * Rótulo humano da métrica do SELO MENSAL ("Resultado do mês"): FATURAMENTO/SALES
 * (e-commerce) → "Faturamento"; métrica-resultado local/B2B → label canônico da
 * grade (LOCAL_RESULT_METRICS). Mantém o MESMO nome em toda superfície.
 */
export function pacingMetricLabel(metric: MetricType): string {
  if (metric === 'FATURAMENTO' || metric === 'SALES') return 'Faturamento'
  return LOCAL_RESULT_METRICS.find((m) => m.value === metric)?.label ?? String(metric)
}

/** true = grandeza monetária (R$, formatCurrency); false = contagem (número puro). */
export function isMonetaryMetric(metric: MetricType): boolean {
  return metric === 'FATURAMENTO' || metric === 'SALES'
}
