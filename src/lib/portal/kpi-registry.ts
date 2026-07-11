/**
 * Registry de KPIs do portal do cliente (orientado a configuração).
 *
 * O frontend renderiza a partir deste array — plugar/ordenar KPIs = editar este
 * arquivo. Cada `metric` é a chave de cálculo consumida por `getPortalKpis`
 * (via `aggregateSnapshots`, a MESMA fonte das telas internas de metas/saúde),
 * EXCETO `SESSOES`, que não é um MetricType do Prisma e é computado à parte
 * (soma de sessões GA4, campo `clicks` dos snapshots GA4).
 *
 * `provisional: true` = lista inicial sujeita a validação com o cliente; nenhum
 * KPI aqui inventa dado que não exista no schema.
 *
 * `helpText`: linguagem de LOJISTA, não técnica — explica o que o número diz.
 */
export type KpiFormat = 'currency' | 'number' | 'percent' | 'ratio'

export type KpiDef = {
  key: string
  metric: string
  label: string
  format: KpiFormat
  chartType: 'line' | 'bar'
  provisional: boolean
  helpText: string
}

export const KPI_REGISTRY: KpiDef[] = [
  {
    key: 'faturamento',
    metric: 'FATURAMENTO',
    label: 'Faturamento',
    format: 'currency',
    chartType: 'line',
    provisional: true,
    helpText: 'Quanto sua loja vendeu no período. É a receita das compras confirmadas.',
  },
  {
    key: 'pedidos',
    metric: 'CONVERSIONS',
    label: 'Pedidos',
    format: 'number',
    chartType: 'bar',
    provisional: true,
    helpText: 'Quantas compras foram fechadas no período.',
  },
  {
    key: 'ticket_medio',
    metric: 'TICKET_MEDIO',
    label: 'Ticket médio',
    format: 'currency',
    chartType: 'line',
    provisional: true,
    helpText: 'Quanto, em média, cada cliente gastou por compra.',
  },
  {
    key: 'sessoes',
    metric: 'SESSOES',
    label: 'Visitas ao site',
    format: 'number',
    chartType: 'line',
    provisional: true,
    helpText: 'Quantas visitas sua loja recebeu no período.',
  },
  {
    key: 'taxa_conversao',
    metric: 'TAXA_CONVERSAO',
    label: 'Taxa de conversão',
    format: 'percent',
    chartType: 'line',
    provisional: true,
    helpText: 'De cada 100 visitas, quantas viraram compra.',
  },
  {
    key: 'investimento',
    metric: 'INVESTMENT',
    label: 'Investimento em anúncios',
    format: 'currency',
    chartType: 'line',
    provisional: true,
    helpText: 'Quanto foi investido em anúncios no período.',
  },
  {
    key: 'roas',
    metric: 'ROAS',
    label: 'Retorno dos anúncios',
    format: 'ratio',
    chartType: 'line',
    provisional: true,
    helpText: 'Para cada R$ 1 investido em anúncios, quanto voltou em vendas.',
  },
]
