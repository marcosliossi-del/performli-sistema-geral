/**
 * Campaign Insight Generator
 *
 * Analisa os snapshots de campanha de um cliente via Claude e retorna
 * diagnóstico estruturado com: oportunidades de escala, campanhas arrastando
 * o ROAS pra baixo e ações prioritizadas para o gestor executar.
 *
 * Fonte de verdade dos resultados = GA4 (faturamento/metas).
 * Fonte dos dados de campanha = Meta Ads (via CampaignSnapshot).
 */

import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'
import { getClientCampaigns } from '@/lib/dal'
import { formatCurrency } from '@/lib/utils'
import { getMonthRange } from '@/lib/utils'

const anthropic = new Anthropic()

// ── Sistema: conhecimento de e-commerce e tráfego pago ────────────────────────

const SYSTEM_PROMPT = `Você é um especialista sênior em tráfego pago e performance de e-commerce, com foco em Meta Ads.
Seu trabalho é analisar dados reais de campanhas e entregar diagnósticos cirúrgicos, diretos e acionáveis.

CONHECIMENTO BASE — E-COMMERCE & TRÁFEGO PAGO:

ROAS (Return on Ad Spend):
- ROAS = Receita de compras atribuída / Investimento em anúncio
- ROAS blend da conta = total de receita / total investido (todas as campanhas)
- Campanha com ROAS acima da meta = candidata a escala (aumentar budget 20–50%, duplicar audiências)
- Campanha com ROAS abaixo de 60% da meta = está consumindo budget sem retorno adequado → pausar, reduzir budget ou reestruturar
- Campanhas com ROAS entre 60–90% da meta = monitorar, testar criativos, refinar audiência

CPA (Custo por Aquisição):
- CPA = Investimento / Número de compras
- CPA alto + ROAS baixo = problema de conversão (landing page, preço, oferta) ou audiência errada
- CPA baixo + alto volume = campanha escalável

CTR (Taxa de Cliques):
- CTR < 1% = criativo com fadiga ou audience fit ruim → trocar criativos
- CTR > 3% = criativo forte, investigar se a landing page está convertendo

Taxa de Conversão do site (CR):
- CR < 1% = gargalo na jornada de compra (UX, velocidade, checkout, frete)
- CR entre 1–3% = dentro da média para e-commerce fashion/geral
- CR > 3% = excelente — priorize escalar tráfego qualificado para este fluxo

CPM (Custo por Mil Impressões):
- CPM alto (> R$ 60) = saturação de audiência ou alta competição — testar novas audiências/criativos
- CPM subindo semana a semana = sinal de fadiga de audiência

Share de budget por campanha:
- Campanha com < 5% do budget e ROAS alto = subinvestida, oportunidade imediata de escala
- Campanha com > 30% do budget e ROAS baixo = destruindo a média — prioridade máxima de intervenção

Jornada de compra no e-commerce:
Anúncio → Clique → Landing/Produto → Adicionar ao carrinho → Checkout → Compra
Pontos de travamento comuns:
- Anúncio → Clique: criativo fraco (resolver com novo criativo/copy)
- Clique → Compra: experiência do site (velocidade, mobile, UX do checkout)
- Carrinho → Compra: abandono de carrinho (frete, prazo, forma de pagamento)

FRAMEWORK DE PRIORIZAÇÃO DE AÇÕES:
1. PAUSE IMEDIATO: campanha com ROAS < 50% da meta + > 15% do budget
2. REDUZIR: campanha com ROAS < 70% da meta, manter mínimo para coleta de dados
3. MANTER: campanha estável, dentro da meta
4. ESCALAR: campanha com ROAS > meta, aumentar budget 20–30% por semana (evitar sair da fase de aprendizado)
5. TESTAR: campanha promissora com poucos dados ainda

REGRAS DE SAÍDA:
- Sem markdown (sem *, #, **, ---)
- Use emojis como marcadores visuais
- Frases curtas e diretas
- Cada ação deve ter: o quê fazer + em qual campanha + por quê (1 linha)
- Tom: consultor parceiro, não alarmista`

// ── Geração ───────────────────────────────────────────────────────────────────

export async function generateCampaignInsights(clientId: string): Promise<string | null> {
  const today = new Date()
  const { start: monthStart } = getMonthRange(today)

  // Busca dados do cliente + metas + GA4 blended performance este mês
  const [client, monthlySnaps, roasGoal, campaigns] = await Promise.all([
    prisma.client.findUnique({
      where: { id: clientId },
      select: { name: true, industry: true },
    }),
    prisma.metricSnapshot.findMany({
      where: { clientId, date: { gte: monthStart, lte: today } },
    }),
    prisma.goal.findFirst({
      where: {
        clientId,
        metric: 'ROAS',
        period: 'MONTHLY',
        startDate: { lte: today },
        endDate: { gte: monthStart },
      },
    }),
    getClientCampaigns(clientId, 7),
  ])

  if (!client) return null
  if (campaigns.length === 0) return null

  // Calcula ROAS blend da conta (GA4 revenue / ad spend)
  const ga4Snaps  = monthlySnaps.filter((s) => Number(s.spend ?? 0) === 0)
  const adSnaps   = monthlySnaps.filter((s) => Number(s.spend ?? 0) > 0)
  const ga4Revenue = ga4Snaps.reduce((s, x) => s + Number(x.conversionValue ?? 0), 0)
  const adRevenue  = adSnaps.reduce((s, x) => s + Number(x.conversionValue ?? 0), 0)
  const totalRevenue = ga4Revenue > 0 ? ga4Revenue : adRevenue
  const totalSpend   = adSnaps.reduce((s, x) => s + Number(x.spend ?? 0), 0)
  const blendedRoas  = totalSpend > 0 && totalRevenue > 0 ? totalRevenue / totalSpend : null

  const roasMeta = roasGoal ? Number(roasGoal.targetValue) : null

  // Monta tabela de campanhas para o prompt
  const campaignLines = campaigns
    .map((c) => {
      const roasStr = c.roas !== null ? `ROAS ${c.roas.toFixed(2)}x` : 'sem ROAS'
      const cpaStr  = c.cpl  !== null ? `CPA ${formatCurrency(c.cpl)}` : 'sem CPA'
      const adSetInfo = c.adSetId !== '' && c.adSetName ? ` [Conjunto: ${c.adSetName}]` : ''
      return `• ${c.campaignName}${adSetInfo}: Invest. ${formatCurrency(c.spend)} (${c.spendShare.toFixed(0)}% do budget) | ${roasStr} | ${cpaStr} | ${c.conversions} compras | Receita ${formatCurrency(c.conversionValue)}`
    })
    .join('\n')

  const prompt = `DADOS DO CLIENTE:
- Cliente: ${client.name}${client.industry ? ` (${client.industry})` : ''}
- Meta de ROAS mensal: ${roasMeta !== null ? `${roasMeta.toFixed(2)}x` : 'não definida'}
- ROAS blend da conta (GA4 revenue / Meta spend) este mês: ${blendedRoas !== null ? `${blendedRoas.toFixed(2)}x` : 'sem dados suficientes'}
- Faturamento acumulado no mês (GA4): ${totalRevenue > 0 ? formatCurrency(totalRevenue) : 'sem dados'}
- Investimento Meta Ads acumulado no mês: ${totalSpend > 0 ? formatCurrency(totalSpend) : 'sem dados'}

CAMPANHAS ATIVAS — últimos 7 dias (ordenadas por investimento):
${campaignLines}

TOTAL: ${campaigns.length} campanhas | Invest. total ${formatCurrency(campaigns.reduce((s, c) => s + c.spend, 0))} | Receita atribuída ${formatCurrency(campaigns.reduce((s, c) => s + c.conversionValue, 0))}

---

Gere a análise seguindo EXATAMENTE esta estrutura (sem markdown, use emojis):

🎯 DIAGNÓSTICO GERAL
[2–3 linhas resumindo a situação da conta: ROAS blend vs meta, distribuição de budget, saúde geral]

🚀 OPORTUNIDADES DE ESCALA
[Lista de campanhas com ROAS acima da meta ou alto potencial. Para cada uma: nome, ROAS atual, % do budget, ação recomendada com % de aumento sugerido. Se não houver, diga claramente.]

⚠️ O QUE ESTÁ PUXANDO O ROAS PRA BAIXO
[Lista de campanhas com ROAS baixo consumindo budget relevante. Para cada uma: nome, ROAS, % do budget, impacto na média, ação recomendada (pausar/reduzir/reestruturar). Se não houver, diga claramente.]

🔧 AÇÕES PRIORITÁRIAS (execute nessa ordem)
[Máximo 5 ações numeradas. Cada ação em 1 linha: número + verbo no imperativo + campanha + motivo objetivo]

💡 OBSERVAÇÕES TÉCNICAS
[Máximo 3 pontos. Padrões de CTR, CPM, saturação de audiência, gargalos de conversão detectados nos dados. Só inclua se houver dado relevante.]`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = response.content[0]
    if (content.type !== 'text') return null

    const insightText = content.text

    // Salva como ClientInsight (métrica = CAMPAIGN_ANALYSIS)
    await prisma.clientInsight.create({
      data: {
        clientId,
        content: insightText,
        metric: 'CAMPAIGN_ANALYSIS',
      },
    })

    return insightText
  } catch (err) {
    console.error(`[CampaignInsights] Erro ao gerar análise para ${clientId}:`, err)
    return null
  }
}
