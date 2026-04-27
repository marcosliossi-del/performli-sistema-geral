/**
 * Weekly Report Generator
 *
 * Gera relatórios semanais automáticos via IA (Claude) para cada cliente ativo,
 * com análise de tráfego (GA4) e performance de e-commerce.
 *
 * Formato: texto corrido, pronto para enviar via WhatsApp/e-mail toda segunda-feira.
 */

import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'
import { GA4Client } from '@/services/ga4/client'
import { getWeekRange, getMonthRange, formatCurrency } from '@/lib/utils'

const anthropic = new Anthropic()

function getLastWeekRange(): { start: Date; end: Date } {
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=Dom, 6=Sab

  // Último sábado completo (se hoje é sábado, pega o anterior)
  const daysToLastSat = dayOfWeek === 6 ? 7 : dayOfWeek + 1
  const lastSat = new Date(today)
  lastSat.setDate(today.getDate() - daysToLastSat)
  lastSat.setHours(23, 59, 59, 999)

  // Domingo dessa mesma semana (6 dias antes do sábado)
  const lastSun = new Date(lastSat)
  lastSun.setDate(lastSat.getDate() - 6)
  lastSun.setHours(0, 0, 0, 0)

  return { start: lastSun, end: lastSat }
}

export async function generateWeeklyReportForClient(
  clientId: string,
  fromStr?: string,
  toStr?: string,
): Promise<string | null> {
  const today = new Date()
  const { start: weekStart } = getWeekRange()
  const { start: monthStart } = getMonthRange(today)
  const defaultRange = getLastWeekRange()
  const lastWeekStart = fromStr ? new Date(fromStr + 'T00:00:00') : defaultRange.start
  const lastWeekEnd   = toStr   ? new Date(toStr   + 'T23:59:59') : defaultRange.end

  const twoWeeksAgo = new Date(lastWeekStart)
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 7)

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      name: true,
      industry: true,
      platformAccounts: {
        where: { platform: 'GA4', active: true },
        select: { externalId: true },
        take: 1,
      },
    },
  })
  if (!client) return null

  const ga4PropertyId = client.platformAccounts[0]?.externalId ?? null

  // Snapshots da semana passada
  const snapInclude = { platformAccount: { select: { platform: true } } } as const

  const [lastWeekSnaps, prevWeekSnaps, monthSnaps, goals] = await Promise.all([
    prisma.metricSnapshot.findMany({
      where: { clientId, date: { gte: lastWeekStart, lte: lastWeekEnd } },
      include: snapInclude,
    }),
    prisma.metricSnapshot.findMany({
      where: { clientId, date: { gte: twoWeeksAgo, lte: new Date(lastWeekStart.getTime() - 1) } },
      include: snapInclude,
    }),
    prisma.metricSnapshot.findMany({
      where: { clientId, date: { gte: monthStart, lte: today } },
      include: snapInclude,
    }),
    prisma.goal.findMany({
      where: {
        clientId,
        period: 'MONTHLY',
        startDate: { lte: today },
        endDate: { gte: monthStart },
      },
    }),
  ])

  function computeMetrics(snaps: typeof lastWeekSnaps) {
    // Filtra por platform — igual ao getClientKPIs em dal.ts para consistência
    const ga4  = snaps.filter((x) => x.platformAccount.platform === 'GA4')
    const meta = snaps.filter((x) => x.platformAccount.platform === 'META_ADS')
    const goog = snaps.filter((x) => x.platformAccount.platform === 'GOOGLE_ADS')
    const ttok = snaps.filter((x) => x.platformAccount.platform === 'TIKTOK_ADS')

    const metaSpend   = meta.reduce((s, x) => s + Number(x.spend ?? 0), 0)
    const googleSpend = goog.reduce((s, x) => s + Number(x.spend ?? 0), 0)
    const tiktokSpend = ttok.reduce((s, x) => s + Number(x.spend ?? 0), 0)
    const spend = metaSpend + googleSpend + tiktokSpend

    // Faturamento e compras sempre via GA4 (fonte de verdade de receita)
    const revenue   = ga4.reduce((s, x) => s + Number(x.conversionValue ?? 0), 0)
    const purchases = ga4.reduce((s, x) => s + (x.conversions ?? 0), 0)
    const sessions  = ga4.reduce((s, x) => s + (x.clicks ?? 0), 0)

    return {
      spend,
      sessions,
      purchases,
      revenue,
      roas: spend > 0 && revenue > 0 ? revenue / spend : null,
      cpa: spend > 0 && purchases > 0 ? spend / purchases : null,
      taxaConversao: sessions > 0 && purchases > 0 ? (purchases / sessions) * 100 : null,
      ticketMedio: purchases > 0 && revenue > 0 ? revenue / purchases : null,
    }
  }

  const lw = computeMetrics(lastWeekSnaps)
  const pw = computeMetrics(prevWeekSnaps)
  const month = computeMetrics(monthSnaps)

  const daysElapsed = today.getDate()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const projecaoMes = daysElapsed > 0 && month.revenue > 0
    ? (month.revenue / daysElapsed) * daysInMonth
    : null

  // Metas mensais
  const faturamentoGoal = goals.find((g) => g.metric === 'FATURAMENTO')
  const roasGoal = goals.find((g) => g.metric === 'ROAS')
  const spendGoal = goals.find((g) => g.metric === 'SPEND' || g.metric === 'INVESTMENT')

  const pctChange = (curr: number, prev: number) =>
    prev > 0 ? ((curr - prev) / prev) * 100 : null

  // Busca top produtos da semana via GA4 Data API direta
  let topProductsStr = 'dados de produto não disponíveis (GA4 não configurado ou sem dados)'
  if (ga4PropertyId) {
    try {
      const ga4 = new GA4Client()
      const since = lastWeekStart.toISOString().split('T')[0]
      const until = lastWeekEnd.toISOString().split('T')[0]
      const items = await ga4.getItemReport(ga4PropertyId, since, until, 5)

      if (items.length > 0) {
        topProductsStr = items
          .map((item, i) => {
            const rev = parseFloat(item.itemRevenue)
            const qty = parseInt(item.itemsPurchased)
            const name = item.itemName === '(not set)' ? 'Produto sem nome' : item.itemName
            const cat = item.itemCategory && item.itemCategory !== '(not set)' ? ` [${item.itemCategory}]` : ''
            return `${i + 1}. ${name}${cat} — ${formatCurrency(rev)} (${qty} un.)`
          })
          .join('\n')
      } else {
        topProductsStr = 'nenhuma venda de produto registrada no período'
      }
    } catch {
      topProductsStr = 'dados de produto indisponíveis no momento'
    }
  }

  const roasMetaStr = roasGoal
    ? `${Number(roasGoal.targetValue).toFixed(2)}x`
    : 'não definida'

  const faturamentoMetaStr = faturamentoGoal
    ? formatCurrency(Number(faturamentoGoal.targetValue))
    : 'não definida'

  const rwRevChange = pctChange(lw.revenue, pw.revenue)
  const rwPurchasesChange = pctChange(lw.purchases, pw.purchases)
  const rwSessionsChange = pctChange(lw.sessions, pw.sessions)

  // Avalia se resultado está acima ou abaixo da meta de ROAS
  const roasAboveMeta =
    lw.roas !== null && roasGoal
      ? lw.roas >= Number(roasGoal.targetValue)
      : null

  const periodoStr = `${lastWeekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} a ${lastWeekEnd.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`

  const prompt = `Você é o assistente de tráfego pago e performance da Arkza, especializado em e-commerces.
Gere um relatório semanal curto, direto e consultivo para ser enviado via WhatsApp ao cliente. Sem markdown, use apenas emojis como marcadores, frases curtas e linha em branco entre blocos.

🗓️ DADOS DO CLIENTE:
- Nome: ${client.name}
- Período: ${periodoStr}
- ROAS meta: ${roasMetaStr}
- Meta de faturamento mensal: ${faturamentoMetaStr}
- Investimento em mídia na semana: ${lw.spend > 0 ? formatCurrency(lw.spend) : 'sem dados'}
- Faturamento (GA4) semana: ${lw.revenue > 0 ? formatCurrency(lw.revenue) : 'sem dados'}${rwRevChange !== null ? ` (${rwRevChange > 0 ? '+' : ''}${rwRevChange.toFixed(1)}% vs semana anterior)` : ''}
- Compras semana: ${lw.purchases > 0 ? lw.purchases.toLocaleString('pt-BR') : 'sem dados'}${rwPurchasesChange !== null ? ` (${rwPurchasesChange > 0 ? '+' : ''}${rwPurchasesChange.toFixed(1)}% vs semana anterior)` : ''}
- Sessões (GA4) semana: ${lw.sessions > 0 ? lw.sessions.toLocaleString('pt-BR') : 'sem dados'}${rwSessionsChange !== null ? ` (${rwSessionsChange > 0 ? '+' : ''}${rwSessionsChange.toFixed(1)}% vs semana anterior)` : ''}
- ROAS realizado semana: ${lw.roas !== null ? `${lw.roas.toFixed(2)}x` : 'sem dados'}
- Taxa de conversão semana: ${lw.taxaConversao !== null ? `${lw.taxaConversao.toFixed(2)}%` : 'sem dados'}
- Ticket médio semana: ${lw.ticketMedio !== null ? formatCurrency(lw.ticketMedio) : 'sem dados'}
- Faturamento acumulado no mês: ${month.revenue > 0 ? formatCurrency(month.revenue) : 'sem dados'} (${daysElapsed} de ${daysInMonth} dias)
- Projeção para fechar o mês: ${projecaoMes !== null ? formatCurrency(projecaoMes) : 'insuficiente'}
- Resultado vs meta ROAS: ${roasAboveMeta === true ? 'ACIMA DA META' : roasAboveMeta === false ? 'ABAIXO DA META' : 'meta não definida'}
- Contexto sazonal: não informado

TOP PRODUTOS DA SEMANA (dados reais do GA4):
${topProductsStr}

📊 ESTRUTURA OBRIGATÓRIA DO RELATÓRIO (siga exatamente):

📊 RELATÓRIO SEMANAL — ${client.name.toUpperCase()}
📅 ${periodoStr}

[1 frase de abertura com tom calibrado:
→ Resultado acima da meta: celebratório
→ Resultado abaixo da meta ou queda: estratégico e tranquilizador
→ Se houver sazonalidade ativa ou recente: mencione em 1 frase que oscilação é natural e já esperada]

📈 Resultados da semana
[Máximo 5 linhas. Traga: faturamento com variação, compras com variação, sessões com variação e ROAS realizado vs meta. Seja direto — número, emoji e 1 adjetivo/contexto curto por linha. Sem explicações longas.]

👗 O que mais vendeu
[Máximo 4 linhas. Liste os produtos ou categorias que lideraram em receita com base nos dados do GA4 acima. Se uma coleção ou categoria dominar claramente, destaque em 1 frase. Nada além disso.]

🚀 Próximos passos
[3 ações curtas, em primeira pessoa do plural. 1 linha cada.]
Vamos [ação #1]
Reforçaremos [ação #2]
Ativaremos [ação #3]

${lw.taxaConversao !== null && lw.taxaConversao < 1 ? `⚠️ INCLUA este bloco pois a taxa de conversão está abaixo de 1%:

🔍 Atenção na jornada
[Máximo 4 linhas. Identifique a trava, 1 possível motivo e 1 sugestão prática pro cliente. Tom consultivo e parceiro, nunca alarmista.]` : `NÃO inclua o bloco "Atenção na jornada" pois a taxa de conversão está adequada (≥1%).`}

💜 A Arkza tá com você.
[1 frase curta de fechamento — diferente a cada relatório.]

⚙️ REGRAS:
- Máximo de 3 blocos fixos + 1 condicional
- Cada bloco: no máximo 5 linhas
- Frases curtas, sem termos técnicos
- Nunca culpe o tráfego
- Primeira pessoa do plural nos próximos passos
- Tom emocional calibrado pelo resultado
- Sazonalidade sempre contextualizada em 1 frase, nunca em parágrafo
- Sem markdown (sem *, #, -)
- Use apenas emojis como marcadores visuais
- Linha em branco entre cada bloco
- Gere apenas o texto do relatório, pronto para copiar e enviar no WhatsApp`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Resposta da IA inválida.')

  const reportContent = content.text

  await prisma.weeklyReport.upsert({
    where: { clientId_weekStart: { clientId, weekStart } },
    create: { clientId, weekStart, content: reportContent },
    update: { content: reportContent, generatedAt: new Date() },
  })

  return reportContent
}

export async function generateAllWeeklyReports(): Promise<{
  clientsProcessed: number
  reportsGenerated: number
}> {
  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  })

  let reportsGenerated = 0
  for (const client of clients) {
    const report = await generateWeeklyReportForClient(client.id)
    if (report) reportsGenerated++
  }

  return { clientsProcessed: clients.length, reportsGenerated }
}
