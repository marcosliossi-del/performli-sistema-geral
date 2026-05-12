/**
 * Weekly Report Generator
 *
 * Gera relatórios semanais automáticos via IA (Claude) para cada cliente ativo,
 * com análise de tráfego (GA4) e performance de e-commerce.
 *
 * Semana: domingo → sábado (alinhado com getWeekRange de utils.ts).
 * Formato: texto corrido, pronto para enviar via WhatsApp/e-mail todo domingo.
 */

import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'
import { GA4Client } from '@/services/ga4/client'
import { getWeekRange, getMonthRange, formatCurrency } from '@/lib/utils'

const anthropic = new Anthropic()

/** Formata Date como 'YYYY-MM-DD' no fuso local (evita conversão UTC do toISOString). */
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function generateWeeklyReportForClient(
  clientId: string,
  fromStr?: string,
  toStr?: string,
): Promise<string | null> {
  const today = new Date()
  const { start: monthStart } = getMonthRange(today)

  // Semana passada completa (Dom-Sab) — usa getWeekRange 7 dias atrás
  const lastWeekAnchor = new Date(today.getTime() - 7 * 86_400_000)
  const defaultRange   = getWeekRange(lastWeekAnchor)
  const lastWeekStart  = fromStr ? new Date(fromStr + 'T00:00:00') : defaultRange.start
  const lastWeekEnd    = toStr   ? new Date(toStr   + 'T23:59:59') : defaultRange.end

  // Semana retrasada (Dom-Sab anterior) para comparativo
  const prevWeekAnchor = new Date(today.getTime() - 14 * 86_400_000)
  const { start: prevWeekStart, end: prevWeekEnd } = getWeekRange(prevWeekAnchor)

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
      where: { clientId, date: { gte: prevWeekStart, lte: prevWeekEnd } },
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
      const since = toLocalDateStr(lastWeekStart)
      const until = toLocalDateStr(lastWeekEnd)
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

  const prompt = `Você é o gestor de tráfego pago da Arkza enviando um resumo semanal para o cliente via WhatsApp.
Escreva como uma pessoa real falaria, com linguagem simples e direta. Sem enrolação, sem cara de relatório corporativo, sem cara de IA.

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

📊 ESTRUTURA DO RELATÓRIO (siga exatamente):

📊 Semana de ${periodoStr}

[1 frase de abertura honesta e curta:
→ Se foi boa semana: comemore de forma simples, ex: "Foi uma boa semana!"
→ Se ficou abaixo: seja direto e tranquilo, ex: "Semana mais fraca, mas já sabemos o que ajustar."
→ Se houver sazonalidade: 1 frase máximo contextualizando, nada mais]

📈 O que aconteceu essa semana
[Máximo 5 linhas. Traga faturamento, compras, sessões e ROAS. Escreva como alguém contando os números para um amigo: número + o que isso significa em 3 palavras. Sem adjetivos pomposos.]

🛍️ O que mais vendeu
[Máximo 4 linhas. Liste os produtos ou categorias que lideraram. Se uma categoria dominar, diga isso em 1 frase simples. Só o essencial.]

📌 O que vem por aí
[3 frases curtas sobre o que a equipe vai fazer na próxima semana. Escreva na primeira pessoa do plural, como "Vamos testar...", "Vamos reforçar...", "Vamos ajustar...". Nada vago.]

${lw.taxaConversao !== null && lw.taxaConversao < 1 ? `⚠️ INCLUA este bloco — taxa de conversão abaixo de 1%:

🔎 Um ponto de atenção
[Máximo 3 linhas. Explique em linguagem simples que poucas pessoas que entram no site estão comprando, dê 1 possível motivo prático e 1 sugestão clara. Tom de parceiro, não de alarme.]` : `NÃO inclua o bloco de atenção pois a taxa de conversão está adequada (>=1%).`}

⚙️ REGRAS OBRIGATÓRIAS:
- Linguagem de conversa, não de relatório corporativo
- Frases curtas, no máximo 12 palavras cada
- Zero termos técnicos sem explicação
- Nunca use: estratégico, robusto, potencializar, insights, jornada, pilares, desbloquear, transformação, crucial, significativo, abordagem, conteúdo de valor, sustentável, no cenário atual, no fim do dia, não é sobre X é sobre Y, a chave está em, vamos mergulhar, vamos explorar, vamos destrinchar, isso aqui é ouro, o pulo do gato, a verdade desconfortável
- Nunca use travessão ( — ) no texto
- Nunca culpe o tráfego pelos resultados
- Tom calibrado pelo resultado: alegre se foi bom, calmo e objetivo se foi ruim
- Sem markdown (sem *, #, -)
- Use emojis só nos títulos dos blocos, não no meio das frases
- Linha em branco entre cada bloco
- Gere apenas o texto final, pronto para enviar no WhatsApp`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Resposta da IA inválida.')

  const reportContent = content.text

  await prisma.weeklyReport.upsert({
    where: { clientId_weekStart: { clientId, weekStart: lastWeekStart } },
    create: { clientId, weekStart: lastWeekStart, content: reportContent },
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
