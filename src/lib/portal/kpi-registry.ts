/**
 * Registry de KPIs do portal do cliente (orientado a configuração).
 *
 * O frontend renderiza a partir deste array — plugar/ordenar KPIs = editar este
 * arquivo. Cada `metric` é a chave de cálculo consumida por `getPortalKpis`
 * (via `aggregateSnapshots`, a MESMA fonte das telas internas de metas/saúde),
 * EXCETO os casos especiais abaixo, que não são `MetricType` do Prisma e são
 * computados à parte a partir de campos crus do MetricSnapshot GA4:
 *   - `SESSOES`     → soma de `clicks` (sessões GA4).
 *   - `NEW_USERS`   → soma de `newUsers` (clientes novos GA4).
 *   - `PROJECAO_MES`→ standalone: NÃO é série do período; é o run-rate do
 *                     faturamento do MÊS CORRENTE (parede SP). Ver `standalone`.
 *
 * `standalone: true` = card informativo que NÃO segue o seletor de período nem
 * gera série diária. `getPortalKpis` PULA esses defs (não vira `KpiData`); o
 * valor vem de função dedicada (`getPortalProjection`). O registry mantém o def
 * só para a UI conhecer ordem/label/format/helpText.
 *
 * `provisional: true` = lista inicial sujeita a validação com o cliente; nenhum
 * KPI aqui inventa dado que não exista no schema.
 *
 * `helpText`: linguagem de LOJISTA, não técnica — explica o que o número diz.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PENDÊNCIAS (quebras do dashboard GA4 do print SEM dado no schema hoje):
 * O MetricSnapshot é um agregado DIÁRIO por (cliente, conta, dia) e NÃO guarda
 * dimensões. As 5 quebras abaixo dependem de ingestão de dimensões GA4/produto
 * (novas colunas/tabela) e ficam registradas como pendência — NÃO inventar:
 *   1. Faturamento por FAIXA ETÁRIA (dimensão demográfica GA4).
 *   2. Faturamento/sessões por CANAL (default channel grouping GA4).
 *   3. Faturamento por CATEGORIA de produto (item category GA4/Nuvemshop).
 *   4. Faturamento por REGIÃO (dimensão geográfica GA4).
 *   5. TOP PRODUTOS (item name/receita por item GA4/Nuvemshop).
 * Enquanto não houver ingestão dessas dimensões, essas quebras não têm KPI aqui.
 * ─────────────────────────────────────────────────────────────────────────────
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
  /** Card informativo fora do seletor de período (sem série). Ver docstring. */
  standalone?: boolean
}

// Ordem = ordem do print aprovado pelo Marcos: Receita, Investimento, ROAS,
// Clientes Novos, CPS, Projeção, Pedidos, Taxa de conversão, Ticket médio,
// Sessões.
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
  {
    key: 'clientes_novos',
    metric: 'NEW_USERS',
    label: 'Clientes novos',
    format: 'number',
    chartType: 'bar',
    provisional: true,
    helpText: 'Quantas pessoas visitaram sua loja pela primeira vez no período.',
  },
  {
    key: 'cps',
    metric: 'CPS',
    label: 'Custo por visita',
    format: 'currency',
    chartType: 'line',
    provisional: true,
    helpText: 'Quanto, em média, você pagou em anúncios para trazer cada visita à sua loja.',
  },
  {
    key: 'projecao_mes',
    metric: 'PROJECAO_MES',
    label: 'Projeção do mês',
    format: 'currency',
    chartType: 'line',
    provisional: true,
    standalone: true,
    helpText:
      'Estimativa de quanto sua loja deve vender até o fim deste mês, no ritmo atual. Sempre mostra o mês em andamento, não muda com o filtro de período.',
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
    key: 'taxa_conversao',
    metric: 'TAXA_CONVERSAO',
    label: 'Taxa de conversão',
    format: 'percent',
    chartType: 'line',
    provisional: true,
    helpText: 'De cada 100 visitas, quantas viraram compra.',
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
]
