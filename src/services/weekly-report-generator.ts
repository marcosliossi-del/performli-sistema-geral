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
      businessType: true,
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
    const revenue          = ga4.reduce((s, x) => s + Number(x.conversionValue ?? 0), 0)
    const purchases        = ga4.reduce((s, x) => s + (x.conversions      ?? 0), 0)
    const sessions         = ga4.reduce((s, x) => s + (x.clicks           ?? 0), 0)
    const addToCarts       = ga4.reduce((s, x) => s + (x.addToCarts       ?? 0), 0)
    const checkoutsStarted = ga4.reduce((s, x) => s + (x.checkoutsStarted ?? 0), 0)

    return {
      spend,
      sessions,
      purchases,
      revenue,
      addToCarts,
      checkoutsStarted,
      roas:               spend > 0    && revenue   > 0 ? revenue / spend            : null,
      cpa:                spend > 0    && purchases > 0 ? spend / purchases           : null,
      cps:                sessions > 0 && spend     > 0 ? spend / sessions            : null,
      taxaConversao:      sessions > 0 && purchases > 0 ? (purchases / sessions) * 100 : null,
      ticketMedio:        purchases > 0 && revenue  > 0 ? revenue / purchases         : null,
      visitToCart:        sessions > 0 && addToCarts       > 0 ? (addToCarts       / sessions)         * 100 : null,
      cartToCheckout:     addToCarts > 0 && checkoutsStarted > 0 ? (checkoutsStarted / addToCarts)     * 100 : null,
      checkoutToPurchase: checkoutsStarted > 0 && purchases > 0  ? (purchases / checkoutsStarted)      * 100 : null,
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
  const roasGoal   = goals.find((g) => g.metric === 'ROAS')
  const spendGoal  = goals.find((g) => g.metric === 'SPEND' || g.metric === 'INVESTMENT')
  const leadsGoal  = goals.find((g) => g.metric === 'LEADS')
  const cplGoal    = goals.find((g) => g.metric === 'CPL')
  const mensagensGoal = goals.find((g) => g.metric === 'MENSAGENS')

  const pctChange = (curr: number, prev: number) =>
    prev > 0 ? ((curr - prev) / prev) * 100 : null

  // ── LOCAL BUSINESS REPORT ──────────────────────────────────────────────────
  if (client.businessType === 'LOCAL') {
    function computeLocalMetrics(snaps: typeof lastWeekSnaps) {
      const meta = snaps.filter((x) => x.platformAccount.platform === 'META_ADS')
      const spend       = meta.reduce((s, x) => s + Number(x.spend ?? 0), 0)
      const reach       = meta.reduce((s, x) => s + (x.reach ?? 0), 0)
      const impressions = meta.reduce((s, x) => s + (x.impressions ?? 0), 0)
      const mensagens   = meta.reduce((s, x) => s + (x.mensagens ?? 0), 0)
      const landingViews= meta.reduce((s, x) => s + (x.landingPageViews ?? 0), 0)
      const leads       = meta.reduce((s, x) => s + (x.conversions ?? 0), 0)
      const adRevenue   = meta.reduce((s, x) => s + Number(x.conversionValue ?? 0), 0)
      const thruplays   = meta.reduce((s, x) => s + (x.thruplays ?? 0), 0)
      const frequencia  = reach > 0 ? impressions / reach : null
      const cpl         = leads > 0 && spend > 0 ? spend / leads : null
      return { spend, reach, impressions, mensagens, landingViews, leads, adRevenue, thruplays, frequencia, cpl }
    }

    const lwLocal = computeLocalMetrics(lastWeekSnaps)
    const pwLocal = computeLocalMetrics(prevWeekSnaps)
    const mLocal  = computeLocalMetrics(monthSnaps)

    const periodoStr = `${lastWeekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} a ${lastWeekEnd.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
    const daysElapsed = today.getDate()
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()

    const msgChange   = pctChange(lwLocal.mensagens,   pwLocal.mensagens)
    const reachChange = pctChange(lwLocal.reach,        pwLocal.reach)
    const landingChange = pctChange(lwLocal.landingViews, pwLocal.landingViews)

    const spendGoalStr   = spendGoal   ? formatCurrency(Number(spendGoal.targetValue))  : 'não definida'
    const leadsGoalStr   = leadsGoal   ? leadsGoal.targetValue.toString()               : 'não definida'
    const cplGoalStr     = cplGoal     ? formatCurrency(Number(cplGoal.targetValue))    : 'não definida'
    const mensagensGoalStr = mensagensGoal ? mensagensGoal.targetValue.toString()       : 'não definida'

    const pctMesDecorrido = Math.round((daysElapsed / daysInMonth) * 100)
    const leadsNoMes   = mLocal.leads > 0     ? mLocal.leads.toString()           : null
    const mensagensNoMes = mLocal.mensagens > 0 ? mLocal.mensagens.toString()     : null
    const spendNoMes   = mLocal.spend > 0     ? formatCurrency(mLocal.spend)      : null

    // Calibração de tom — espelho exato da lógica do e-commerce
    const leadsNoPrazo = leadsGoal
      ? mLocal.leads >= (Number(leadsGoal.targetValue) / daysInMonth) * daysElapsed * 0.85
      : null
    const mensagensNoPrazo = mensagensGoal
      ? mLocal.mensagens >= (Number(mensagensGoal.targetValue) / daysInMonth) * daysElapsed * 0.85
      : null
    // "No prazo" = qualquer meta principal no ritmo OU mensagens cresceram vs semana anterior
    const mensagensCresceram = (msgChange ?? 0) > 0
    const clienteNoPrazo = leadsNoPrazo === true || mensagensNoPrazo === true || mensagensCresceram

    const localPrompt = `Você é o gestor de tráfego pago da Arkza enviando um resumo semanal para o cliente via WhatsApp.
Escreva como uma pessoa real falaria, com linguagem simples e direta. Sem enrolação, sem cara de relatório corporativo, sem cara de IA.

🗓️ DADOS DO CLIENTE:
- Nome: ${client.name}
- Período: ${periodoStr}
- Pessoas alcançadas: ${lwLocal.reach > 0 ? lwLocal.reach.toLocaleString('pt-BR') : 'sem dados'}${reachChange !== null ? ` (${reachChange > 0 ? '+' : ''}${reachChange.toFixed(0)}% vs semana anterior)` : ''}
- Mensagens recebidas: ${lwLocal.mensagens > 0 ? lwLocal.mensagens.toLocaleString('pt-BR') : 'sem dados'}${msgChange !== null ? ` (${msgChange > 0 ? '+' : ''}${msgChange.toFixed(0)}% vs semana anterior)` : ''}
- Visitas ao perfil: ${lwLocal.landingViews > 0 ? lwLocal.landingViews.toLocaleString('pt-BR') : 'sem dados'}${landingChange !== null ? ` (${landingChange > 0 ? '+' : ''}${landingChange.toFixed(0)}% vs semana anterior)` : ''}
- Investimento: ${lwLocal.spend > 0 ? formatCurrency(lwLocal.spend) : 'sem dados'}
${lwLocal.leads > 0 ? `- Leads gerados: ${lwLocal.leads.toLocaleString('pt-BR')}${lwLocal.cpl !== null ? ` (custo por lead: ${formatCurrency(lwLocal.cpl)})` : ''}` : ''}
${lwLocal.adRevenue > 0 ? `- Vendas via Meta Ads: ${formatCurrency(lwLocal.adRevenue)}` : ''}
- Semana anterior: ${pwLocal.mensagens > 0 ? pwLocal.mensagens.toLocaleString('pt-BR') : 'sem dados'} mensagens / ${pwLocal.reach > 0 ? pwLocal.reach.toLocaleString('pt-BR') : 'sem dados'} pessoas alcançadas
- Acumulado do mês (${daysElapsed} de ${daysInMonth} dias): ${mLocal.mensagens > 0 ? `${mLocal.mensagens.toLocaleString('pt-BR')} mensagens` : ''}${mLocal.leads > 0 ? ` / ${mLocal.leads.toLocaleString('pt-BR')} leads` : ''}${mLocal.spend > 0 ? ` / ${formatCurrency(mLocal.spend)} investidos` : ''}
- Meta de mensagens: ${mensagensGoalStr}
- Meta de leads: ${leadsGoalStr}
- Budget mensal: ${spendGoalStr}
- Cliente no prazo: ${clienteNoPrazo ? 'SIM' : 'NÃO'}

📊 ESTRUTURA DO RELATÓRIO (siga exatamente):

📊 Semana de ${periodoStr}

[1 frase de abertura honesta e curta:
→ Se foi boa semana (mensagens subiram ou cliente no prazo): comemore de forma simples, ex: "Boa semana por aqui!"
→ Se caiu: seja direto e tranquilo, ex: "Semana mais fraca, mas já sabemos o que ajustar."]

📈 O que aconteceu essa semana
[Máximo 5 linhas. Traga alcance, mensagens e visitas ao perfil com os números reais. Escreva como alguém contando os resultados para um amigo: número + o que isso significa em poucas palavras.
${clienteNoPrazo
  ? 'CLIENTE NO PRAZO: pode mencionar o acumulado do mês de forma positiva, ex: "No mês, já chegamos a X mensagens."'
  : 'CLIENTE ABAIXO DO PRAZO: NÃO mencione o acumulado do mês. Foque só nos números da semana. Não gere ansiedade com números negativos.'}]

${lwLocal.leads > 0 || lwLocal.adRevenue > 0 ? `💬 Resultados diretos
[Máximo 3 linhas. Mencione leads gerados ou vendas via anúncio se houver. Ex: "Recebemos X contatos diretos via anúncio." ou "X pessoas iniciaram uma compra pelo cardápio." Tom: mostre o impacto concreto do investimento.]` : 'NÃO inclua o bloco de resultados diretos — sem dados de leads ou vendas nessa semana.'}

📌 O que vem por aí
[3 frases curtas sobre o que a equipe vai fazer na próxima semana. Escreva na primeira pessoa do plural.
${clienteNoPrazo
  ? 'CLIENTE NO PRAZO: ações de manutenção e escala, ex: "Vamos reforçar o que gerou mais mensagens...", "Vamos testar novos criativos..."'
  : 'CLIENTE ABAIXO DO PRAZO: mostre movimento e plano, ex: "Já estamos ajustando os anúncios...", "Vamos testar novas chamadas essa semana...", "Vamos ativar campanhas para quem já interagiu mas não entrou em contato." Transmita que a equipe está agindo.'}]

⚙️ REGRAS OBRIGATÓRIAS:
- Linguagem de conversa, não de relatório
- Frases curtas, no máximo 12 palavras cada
- Zero termos técnicos: sem CPC, CTR, impressões, frequência, cliques no link, funil, conversão
- Não mencionar seguidores
- Nunca use: estratégico, robusto, potencializar, insights, jornada, pilares, desbloquear, transformação, crucial, significativo, abordagem, no cenário atual, no fim do dia
- Nunca use travessão ( — ) no texto
- Nunca culpe fatores externos pelos resultados
- CLIENTE ABAIXO DO PRAZO: transmita movimento e ação. Mostre que a equipe está trabalhando e ajustando. Nunca deixe o cliente ansioso sem resposta
- Tom calibrado: animado se foi boa semana, firme e ativo se foi ruim
- Sem markdown (sem *, #, -)
- Emojis só nos títulos dos blocos, nunca no meio das frases
- Linha em branco entre cada bloco
- Gere apenas o texto final, pronto para enviar no WhatsApp`

    const localResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      messages: [{ role: 'user', content: localPrompt }],
    })

    const localContent = localResponse.content[0]
    if (localContent.type !== 'text') throw new Error('Resposta da IA inválida.')

    const localReportContent = localContent.text

    await prisma.weeklyReport.upsert({
      where: { clientId_weekStart: { clientId, weekStart: lastWeekStart } },
      create: { clientId, weekStart: lastWeekStart, content: localReportContent },
      update: { content: localReportContent, generatedAt: new Date() },
    })

    return localReportContent
  }
  // ── END LOCAL BUSINESS REPORT ──────────────────────────────────────────────

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

  const rwRevChange       = pctChange(lw.revenue,   pw.revenue)
  const rwPurchasesChange = pctChange(lw.purchases, pw.purchases)
  const rwSessionsChange  = pctChange(lw.sessions,  pw.sessions)

  // ── Funnel diagnosis ────────────────────────────────────────────────────────
  // Benchmarks e-commerce (referência do setor)
  const BENCH = { visitToCart: { min: 4, max: 8 }, cartToCheckout: { min: 38, max: 56 }, checkoutToPurchase: { min: 55, max: 82 } }

  function funnelStatus(val: number | null, bench: { min: number; max: number }): 'ok' | 'low' | 'nodata' {
    if (val === null) return 'nodata'
    return val >= bench.min ? 'ok' : 'low'
  }

  // Only treat as "has funnel data" when GA4 actually sent add_to_cart events.
  // Old snapshots have addToCarts=0 which would compute a 0% visit-to-cart rate
  // and falsely trigger the "site confuso" bottleneck diagnosis.
  const hasFunnelData = lw.addToCarts > 0

  // Builds a plain-text funnel block to inject into the AI prompt
  let funnelBlock = ''
  if (hasFunnelData) {
    const lines: string[] = []

    lines.push(`FUNIL DE COMPRA (semana passada, GA4):`)
    lines.push(`- Sessões: ${lw.sessions.toLocaleString('pt-BR')}`)
    lines.push(`- Add to cart: ${lw.addToCarts.toLocaleString('pt-BR')}${lw.visitToCart !== null ? ` (${lw.visitToCart.toFixed(1)}% das sessões, ref 4–8%)` : ''}`)
    lines.push(`- Início checkout: ${lw.checkoutsStarted.toLocaleString('pt-BR')}${lw.cartToCheckout !== null ? ` (${lw.cartToCheckout.toFixed(1)}% dos carrinhos, ref 38–56%)` : ''}`)
    lines.push(`- Compras: ${lw.purchases.toLocaleString('pt-BR')}${lw.checkoutToPurchase !== null ? ` (${lw.checkoutToPurchase.toFixed(1)}% dos checkouts, ref 55–82%)` : ''}`)

    // Changes vs previous week
    if (pw.visitToCart !== null && lw.visitToCart !== null) {
      const delta = lw.visitToCart - pw.visitToCart
      lines.push(`- Taxa visita→carrinho semana anterior: ${pw.visitToCart.toFixed(1)}% (variação: ${delta > 0 ? '+' : ''}${delta.toFixed(1)}pp)`)
    }
    if (pw.cartToCheckout !== null && lw.cartToCheckout !== null) {
      const delta = lw.cartToCheckout - pw.cartToCheckout
      lines.push(`- Taxa carrinho→checkout semana anterior: ${pw.cartToCheckout.toFixed(1)}% (variação: ${delta > 0 ? '+' : ''}${delta.toFixed(1)}pp)`)
    }

    // Specific bottleneck diagnosis
    const vtcStatus  = funnelStatus(lw.visitToCart,        BENCH.visitToCart)
    const ctcStatus  = funnelStatus(lw.cartToCheckout,     BENCH.cartToCheckout)
    const ctpStatus  = funnelStatus(lw.checkoutToPurchase, BENCH.checkoutToPurchase)
    const cpsOk      = lw.cps !== null && lw.cps < 2.0  // CPS abaixo de R$2 = eficiente

    lines.push(``)
    lines.push(`DIAGNÓSTICO DO FUNIL (use isso para gerar o bloco de funil se houver gargalo):`)

    if (vtcStatus === 'low' && cpsOk) {
      lines.push(`⚠️ GARGALO: CPS eficiente (R$${lw.cps!.toFixed(2)}/sessão) mas só ${lw.visitToCart!.toFixed(1)}% das visitas adicionam ao carrinho (ref mín 4%). Visitantes chegam mas não se engajam com os produtos. Possíveis causas: site confuso, imagens ruins, produto sem destaque ou preço fora da expectativa.`)
    } else if (vtcStatus === 'low') {
      lines.push(`⚠️ GARGALO: Taxa de adição ao carrinho baixa (${lw.visitToCart!.toFixed(1)}%, ref mín 4%). Produtos não estão convertendo visitas em intenção de compra. Verificar páginas de produto, galeria de fotos e descrições.`)
    }

    if (ctcStatus === 'low') {
      lines.push(`⚠️ GARGALO: Muitos carrinhos abandonados antes do checkout (${lw.cartToCheckout!.toFixed(1)}%, ref mín 38%). Possíveis causas: frete caro aparecendo ao abrir o carrinho, falta de cupom ou processo de login obrigatório.`)
    }

    if (ctpStatus === 'low') {
      lines.push(`⚠️ GARGALO: Abandonos na finalização da compra (${lw.checkoutToPurchase!.toFixed(1)}% concluem, ref mín 55%). Possíveis causas: problema de pagamento, campos complexos, falta de opção de parcelamento ou insegurança do cliente.`)
    }

    if (vtcStatus === 'ok' && ctcStatus === 'ok' && ctpStatus === 'ok' && lw.taxaConversao !== null && lw.taxaConversao < 1) {
      lines.push(`ℹ️ Funil eficiente em todos os passos mas taxa de conversão geral abaixo de 1% (${lw.taxaConversao.toFixed(2)}%). O gargalo provavelmente é volume de tráfego qualificado, não o site em si.`)
    }

    if (vtcStatus === 'ok' && ctcStatus === 'ok' && ctpStatus === 'ok') {
      lines.push(`✅ Funil saudável — todas as taxas dentro ou acima do benchmark.`)
    }

    funnelBlock = lines.join('\n')
  }

  // Avalia se resultado está acima ou abaixo da meta de ROAS
  const roasAboveMeta =
    lw.roas !== null && roasGoal
      ? lw.roas >= Number(roasGoal.targetValue)
      : null

  const periodoStr = `${lastWeekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} a ${lastWeekEnd.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`

  // Avalia saúde geral do cliente para calibrar o que expor na projeção
  const pacedGoalMes = faturamentoGoal
    ? (Number(faturamentoGoal.targetValue) / daysInMonth) * daysElapsed
    : null
  // "No prazo" = receita acumulada >= 85% do esperado pelo pacing, ou ROAS acima da meta
  const receitaOkVsPacing = pacedGoalMes != null && month.revenue >= pacedGoalMes * 0.85
  const roasOk = roasAboveMeta === true
  const clienteNoPrazo = receitaOkVsPacing || roasOk

  const hasFunnelBottleneck = hasFunnelData && (
    funnelStatus(lw.visitToCart, BENCH.visitToCart) === 'low' ||
    funnelStatus(lw.cartToCheckout, BENCH.cartToCheckout) === 'low' ||
    funnelStatus(lw.checkoutToPurchase, BENCH.checkoutToPurchase) === 'low'
  )

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
- Cliente no prazo (receita vs pacing): ${clienteNoPrazo ? 'SIM' : 'NÃO'}
- Contexto sazonal: não informado

TOP PRODUTOS DA SEMANA (dados reais do GA4):
${topProductsStr}

${hasFunnelData ? funnelBlock : ''}

📊 ESTRUTURA DO RELATÓRIO (siga exatamente):

📊 Semana de ${periodoStr}

[1 frase de abertura honesta e curta:
→ Se foi boa semana: comemore de forma simples, ex: "Foi uma boa semana!"
→ Se ficou abaixo: seja direto e tranquilo, ex: "Semana mais fraca, mas já sabemos o que ajustar."
→ Se houver sazonalidade: 1 frase máximo contextualizando, nada mais]

📈 O que aconteceu essa semana
[Máximo 5 linhas. Traga faturamento, compras, sessões e ROAS. Escreva como alguém contando os números para um amigo: número + o que isso significa em 3 palavras. Sem adjetivos pomposos.
${clienteNoPrazo
  ? 'CLIENTE NO PRAZO: pode mencionar a projeção de fechamento do mês de forma positiva, ex: "No mês, já acumulamos X e a projeção é fechar em torno de Y."'
  : 'CLIENTE ABAIXO DO PRAZO: NÃO mencione a projeção nem o acumulado do mês neste bloco. Foque só nos números da semana. Não projete números negativos, não gere ansiedade.'}]

🛍️ O que mais vendeu
[Máximo 4 linhas. Liste os produtos ou categorias que lideraram. Se uma categoria dominar, diga isso em 1 frase simples. Só o essencial.]

${hasFunnelBottleneck ? `🛒 O que está travando as vendas no site
[OBRIGATÓRIO — há gargalo no funil de compra. Máximo 3 linhas. Use os dados do DIAGNÓSTICO DO FUNIL acima.
Escreva na linguagem do cliente, sem termos técnicos. Ex: "Muita gente visita o site mas menos de 4% adiciona algo ao carrinho. Isso pode indicar que o site está confuso ou os produtos precisam de mais destaque." ou "Boa parte dos carrinhos é abandonada antes de fechar a compra. Vale checar se o frete só aparece no final do processo." ou "Vários clientes chegam ao checkout mas não finalizam. Pode ser problema na etapa de pagamento."
Tom: parceiro apontando algo que a equipe já identificou e vai resolver, não alarmista.]` : `NÃO inclua o bloco de funil pois o funil está saudável ou sem dados suficientes.`}

📌 O que vem por aí
[3 frases curtas sobre o que a equipe vai fazer na próxima semana. Escreva na primeira pessoa do plural.
${clienteNoPrazo
  ? 'CLIENTE NO PRAZO: ações de manutenção e escala, ex: "Vamos reforçar o que funcionou...", "Vamos testar..."'
  : 'CLIENTE ABAIXO DO PRAZO: mostre movimento e plano, ex: "Já estamos ajustando os anúncios...", "Vamos reunir internamente essa semana para rever a estratégia...", "Vamos testar novos criativos...". Transmita que a equipe está agindo, não esperando.'}
${hasFunnelBottleneck ? 'Como há gargalo no funil, inclua 1 ação específica sobre o site, ex: "Vamos revisar o fluxo do carrinho para reduzir o abandono antes do checkout."' : ''}]

${lw.taxaConversao !== null && lw.taxaConversao < 1 && !hasFunnelBottleneck ? `⚠️ INCLUA este bloco — taxa de conversão abaixo de 1% mas sem gargalo específico identificado:

🔎 Um ponto de atenção
[Máximo 3 linhas. Explique em linguagem simples que poucas pessoas que entram no site estão comprando, dê 1 possível motivo prático e 1 sugestão clara. Tom de parceiro, não de alarme.]` : `NÃO inclua o bloco de atenção genérico — ${hasFunnelBottleneck ? 'o bloco de funil já cobre isso' : 'a taxa de conversão está adequada (>=1%)'}.`}

⚙️ REGRAS OBRIGATÓRIAS:
- Linguagem de conversa, não de relatório corporativo
- Frases curtas, no máximo 12 palavras cada
- Zero termos técnicos sem explicação
- Nunca use: estratégico, robusto, potencializar, insights, jornada, pilares, desbloquear, transformação, crucial, significativo, abordagem, conteúdo de valor, sustentável, no cenário atual, no fim do dia, não é sobre X é sobre Y, a chave está em, vamos mergulhar, vamos explorar, vamos destrinchar, isso aqui é ouro, o pulo do gato, a verdade desconfortável
- Nunca use frases vagas sobre produtos: "peças de maior destaque", "apelo visual", "estão destacando bem", "itens com mais saída", "produtos com boa aceitação", "peças que performaram", "categorias que se sobressaíram", "artigos com relevância", "produtos que chamaram atenção". Essas frases não dizem nada ao cliente.
- Ao falar de produtos vá direto ao nome: "O que mais vendeu foi o macacão tule", "Partes de cima tiveram mais saída essa semana", "O vestido X vendeu 18 unidades". Nome do produto ou categoria real, sem adjetivo nenhum antes.
- Nunca use travessão ( — ) no texto
- Nunca culpe o tráfego pelos resultados
- PROJEÇÃO DE FECHAMENTO DO MÊS: só mencione se "Cliente no prazo" for SIM. Se for NÃO, nunca projete nem cite o acumulado do mês de forma que exponha um resultado negativo
- CLIENTE ABAIXO DO PRAZO: o tom deve transmitir movimento e ação da equipe. Mostre que estamos trabalhando, ajustando, reunindo. Nunca deixe o cliente ansioso com números ruins sem resposta
- Tom calibrado pelo resultado: animado se foi bom, firme e ativo se foi ruim
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
