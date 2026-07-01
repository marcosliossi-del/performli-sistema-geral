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
import { getClientKPIs } from '@/lib/dal'
import { buildReportPrompt, type ReportCheckin } from '@/services/report-prompts'

const anthropic = new Anthropic()

/**
 * Busca o check-in mais recente do cliente para uma janela de datas e mapeia
 * as 6 respostas para o formato usado pelo prompt oficial. Se não houver
 * check-in preenchido, retorna um objeto vazio (o prompt trata a ausência).
 */
async function fetchCheckin(clientId: string, from: Date, to: Date): Promise<ReportCheckin> {
  const c = await prisma.clientWeeklyCheckin.findFirst({
    where: { clientId, weekStart: { gte: from, lte: to } },
    orderBy: { weekStart: 'desc' },
    select: {
      problema: true,
      oQueFoiFeito: true,
      resultadoSemana: true,
      proximosPassos: true,
      pedidosCliente: true,
      novosSeguidores: true,
    },
  })
  if (!c) return {}
  return {
    problema:       c.problema,
    acoes:          c.oQueFoiFeito,
    resultado:      c.resultadoSemana,
    planoProximo:   c.proximosPassos,
    pedidosCliente: c.pedidosCliente,
    novosSeguidores: c.novosSeguidores,
  }
}

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
  const roasGoal        = goals.find((g) => g.metric === 'ROAS')
  const spendGoal       = goals.find((g) => g.metric === 'SPEND' || g.metric === 'INVESTMENT')
  const leadsGoal       = goals.find((g) => g.metric === 'LEADS')
  const cplGoal         = goals.find((g) => g.metric === 'CPL')
  const mensagensGoal   = goals.find((g) => g.metric === 'MENSAGENS')
  const conversionsGoal = goals.find((g) => g.metric === 'CONVERSIONS')

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
      const adRevenue   = meta.reduce((s, x) => s + Number(x.conversionValue ?? 0), 0)
      const thruplays   = meta.reduce((s, x) => s + (x.thruplays ?? 0), 0)
      const frequencia  = reach > 0 ? impressions / reach : null
      // WhatsApp campaigns store results in mensagens, not conversions — use as fallback
      const metaConvRaw = meta.reduce((s, x) => s + (x.conversions ?? 0), 0)
      const leads       = metaConvRaw > 0 ? metaConvRaw : mensagens
      const cpl         = leads > 0 && spend > 0 ? spend / leads : null
      return { spend, reach, impressions, mensagens, landingViews, leads, adRevenue, thruplays, frequencia, cpl }
    }

    const lwLocal = computeLocalMetrics(lastWeekSnaps)
    const pwLocal = computeLocalMetrics(prevWeekSnaps)
    const mLocal  = computeLocalMetrics(monthSnaps)

    const periodoStr  = `${lastWeekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} a ${lastWeekEnd.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
    const daysElapsed = today.getDate()
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()

    const msgChange     = pctChange(lwLocal.mensagens,   pwLocal.mensagens)
    const reachChange   = pctChange(lwLocal.reach,        pwLocal.reach)
    const landingChange = pctChange(lwLocal.landingViews, pwLocal.landingViews)
    const leadsChange   = pctChange(lwLocal.leads,        pwLocal.leads)
    const revenueChange = pctChange(lwLocal.adRevenue,    pwLocal.adRevenue)

    // ── Detect goal profile (what this client actually cares about) ──────────
    const isRestaurantMode = !!(conversionsGoal || faturamentoGoal)
    const hasLeadsGoal     = !!leadsGoal
    const hasMensagensGoal = !!mensagensGoal

    let objetivoPrincipal: string
    if (isRestaurantMode)      objetivoPrincipal = 'vendas e pedidos via anúncio (tipo restaurante/delivery)'
    else if (hasLeadsGoal)     objetivoPrincipal = 'geração de leads e cadastros'
    else if (hasMensagensGoal) objetivoPrincipal = 'geração de mensagens e contatos'
    else                        objetivoPrincipal = 'alcance e engajamento geral'

    // ── Calibração de tom ────────────────────────────────────────────────────
    const leadsNoPrazo = leadsGoal
      ? mLocal.leads >= (Number(leadsGoal.targetValue) / daysInMonth) * daysElapsed * 0.85
      : null
    const mensagensNoPrazo = mensagensGoal
      ? mLocal.mensagens >= (Number(mensagensGoal.targetValue) / daysInMonth) * daysElapsed * 0.85
      : null
    const conversionsNoPrazo = conversionsGoal
      ? mLocal.leads >= (Number(conversionsGoal.targetValue) / daysInMonth) * daysElapsed * 0.85
      : null
    const faturamentoNoPrazo = faturamentoGoal && isRestaurantMode
      ? mLocal.adRevenue >= (Number(faturamentoGoal.targetValue) / daysInMonth) * daysElapsed * 0.85
      : null
    const mensagensCresceram = (msgChange ?? 0) > 0
    const clienteNoPrazo = conversionsNoPrazo === true || faturamentoNoPrazo === true ||
                           leadsNoPrazo === true || mensagensNoPrazo === true || mensagensCresceram

    // ── Goal strings ─────────────────────────────────────────────────────────
    const spendGoalStr     = spendGoal       ? formatCurrency(Number(spendGoal.targetValue))       : 'não definido'
    const leadsGoalStr     = leadsGoal       ? leadsGoal.targetValue.toString()                    : null
    const cplGoalStr       = cplGoal         ? formatCurrency(Number(cplGoal.targetValue))         : null
    const mensagensGoalStr = mensagensGoal   ? mensagensGoal.targetValue.toString()                : null
    const convGoalStr      = conversionsGoal ? conversionsGoal.targetValue.toString()              : null
    const fatGoalStr       = faturamentoGoal && isRestaurantMode
                             ? formatCurrency(Number(faturamentoGoal.targetValue))                 : null

    // ── Dynamic data block (highlight what the client measures first) ────────
    let dadosPrimarios: string
    if (isRestaurantMode) {
      dadosPrimarios = [
        `- Pedidos via anúncio: ${lwLocal.leads > 0 ? lwLocal.leads.toLocaleString('pt-BR') : 'sem dados'}${leadsChange !== null ? ` (${leadsChange > 0 ? '+' : ''}${leadsChange.toFixed(0)}% vs semana anterior)` : ''}`,
        lwLocal.adRevenue > 0 ? `- Faturamento via anúncio: ${formatCurrency(lwLocal.adRevenue)}${revenueChange !== null ? ` (${revenueChange > 0 ? '+' : ''}${revenueChange.toFixed(0)}% vs semana anterior)` : ''}` : '',
        `- Pessoas alcançadas: ${lwLocal.reach > 0 ? lwLocal.reach.toLocaleString('pt-BR') : 'sem dados'}${reachChange !== null ? ` (${reachChange > 0 ? '+' : ''}${reachChange.toFixed(0)}% vs semana anterior)` : ''}`,
        `- Investimento: ${lwLocal.spend > 0 ? formatCurrency(lwLocal.spend) : 'sem dados'}`,
        convGoalStr ? `- Meta de pedidos: ${convGoalStr}/mês` : '',
        fatGoalStr  ? `- Meta de faturamento: ${fatGoalStr}/mês` : '',
        `- Budget mensal: ${spendGoalStr}`,
      ].filter(Boolean).join('\n')
    } else if (hasLeadsGoal) {
      dadosPrimarios = [
        `- Leads gerados: ${lwLocal.leads > 0 ? `${lwLocal.leads.toLocaleString('pt-BR')}${lwLocal.cpl !== null ? ` (custo por lead: ${formatCurrency(lwLocal.cpl)})` : ''}` : 'sem dados'}${leadsChange !== null ? ` (${leadsChange > 0 ? '+' : ''}${leadsChange.toFixed(0)}% vs semana anterior)` : ''}`,
        `- Pessoas alcançadas: ${lwLocal.reach > 0 ? lwLocal.reach.toLocaleString('pt-BR') : 'sem dados'}${reachChange !== null ? ` (${reachChange > 0 ? '+' : ''}${reachChange.toFixed(0)}% vs semana anterior)` : ''}`,
        `- Visitas ao perfil: ${lwLocal.landingViews > 0 ? lwLocal.landingViews.toLocaleString('pt-BR') : 'sem dados'}`,
        `- Investimento: ${lwLocal.spend > 0 ? formatCurrency(lwLocal.spend) : 'sem dados'}`,
        leadsGoalStr ? `- Meta de leads: ${leadsGoalStr}/mês` : '',
        cplGoalStr   ? `- Meta de CPL: ${cplGoalStr}` : '',
        `- Budget mensal: ${spendGoalStr}`,
      ].filter(Boolean).join('\n')
    } else {
      dadosPrimarios = [
        `- Mensagens recebidas: ${lwLocal.mensagens > 0 ? lwLocal.mensagens.toLocaleString('pt-BR') : 'sem dados'}${msgChange !== null ? ` (${msgChange > 0 ? '+' : ''}${msgChange.toFixed(0)}% vs semana anterior)` : ''}`,
        `- Pessoas alcançadas: ${lwLocal.reach > 0 ? lwLocal.reach.toLocaleString('pt-BR') : 'sem dados'}${reachChange !== null ? ` (${reachChange > 0 ? '+' : ''}${reachChange.toFixed(0)}% vs semana anterior)` : ''}`,
        `- Visitas ao perfil: ${lwLocal.landingViews > 0 ? lwLocal.landingViews.toLocaleString('pt-BR') : 'sem dados'}${landingChange !== null ? ` (${landingChange > 0 ? '+' : ''}${landingChange.toFixed(0)}% vs semana anterior)` : ''}`,
        `- Investimento: ${lwLocal.spend > 0 ? formatCurrency(lwLocal.spend) : 'sem dados'}`,
        mensagensGoalStr ? `- Meta de mensagens: ${mensagensGoalStr}/mês` : '',
        `- Budget mensal: ${spendGoalStr}`,
      ].filter(Boolean).join('\n')
    }

    const semanaAnteriorStr = isRestaurantMode
      ? `${pwLocal.leads > 0 ? pwLocal.leads.toLocaleString('pt-BR') + ' pedidos' : 'sem dados'} / ${pwLocal.reach > 0 ? pwLocal.reach.toLocaleString('pt-BR') : 'sem dados'} alcançadas`
      : hasLeadsGoal
        ? `${pwLocal.leads > 0 ? pwLocal.leads.toLocaleString('pt-BR') : 'sem dados'} leads / ${pwLocal.reach > 0 ? pwLocal.reach.toLocaleString('pt-BR') : 'sem dados'} alcançadas`
        : `${pwLocal.mensagens > 0 ? pwLocal.mensagens.toLocaleString('pt-BR') : 'sem dados'} mensagens / ${pwLocal.reach > 0 ? pwLocal.reach.toLocaleString('pt-BR') : 'sem dados'} alcançadas`

    const acumuladoMesStr = isRestaurantMode
      ? [mLocal.leads > 0 ? `${mLocal.leads.toLocaleString('pt-BR')} pedidos` : '', mLocal.adRevenue > 0 ? formatCurrency(mLocal.adRevenue) + ' faturados' : '', mLocal.spend > 0 ? formatCurrency(mLocal.spend) + ' investidos' : ''].filter(Boolean).join(' / ')
      : hasLeadsGoal
        ? [mLocal.leads > 0 ? `${mLocal.leads.toLocaleString('pt-BR')} leads` : '', mLocal.spend > 0 ? formatCurrency(mLocal.spend) + ' investidos' : ''].filter(Boolean).join(' / ')
        : [mLocal.mensagens > 0 ? `${mLocal.mensagens.toLocaleString('pt-BR')} mensagens` : '', mLocal.leads > 0 ? `${mLocal.leads.toLocaleString('pt-BR')} leads` : '', mLocal.spend > 0 ? formatCurrency(mLocal.spend) + ' investidos' : ''].filter(Boolean).join(' / ')

    const dadosSistema = [
      `OBJETIVO PRINCIPAL DESTE CLIENTE: ${objetivoPrincipal}`,
      ``,
      `Semana atual:`,
      dadosPrimarios,
      ``,
      `Semana anterior (comparativo): ${semanaAnteriorStr}`,
      `Acumulado do mês (${daysElapsed} de ${daysInMonth} dias): ${acumuladoMesStr || 'sem dados'}`,
      `Cliente no prazo (vs meta/pacing): ${clienteNoPrazo ? 'SIM' : 'NÃO'}`,
    ].join('\n')

    const localCheckin = await fetchCheckin(clientId, lastWeekStart, lastWeekEnd)

    const localPrompt = buildReportPrompt({
      businessType: client.businessType ?? 'LOCAL',
      period: 'weekly',
      clientName: client.name,
      periodLabel: periodoStr,
      checkin: localCheckin,
      dadosSistema,
    })

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

  // Faturamento/ROAS/compras/ticket vêm da MESMA função do painel (getClientKPIs),
  // na mesma janela da semana, para nunca divergir do dashboard.
  const kpi = await getClientKPIs(
    clientId,
    toLocalDateStr(lastWeekStart),
    toLocalDateStr(lastWeekEnd),
  )

  const dadosSistema = [
    `Origem: mesma base do painel da agência (faturamento, compras, ROAS e ticket médio via GA4, MetricSnapshot.conversionValue; investimento somado das contas de mídia).`,
    ``,
    `Metas:`,
    `- ROAS meta: ${roasMetaStr}`,
    `- Meta de faturamento mensal: ${faturamentoMetaStr}`,
    ``,
    `Semana atual (mesmos números do painel da agência):`,
    `- Investimento em mídia: ${kpi.investimento > 0 ? formatCurrency(kpi.investimento) : 'sem dados'}`,
    `- Faturamento (GA4): ${kpi.faturamento > 0 ? formatCurrency(kpi.faturamento) : 'sem dados'}${rwRevChange !== null ? ` (${rwRevChange > 0 ? 'alta' : 'queda'} vs semana anterior)` : ''}`,
    `- Compras: ${kpi.compras > 0 ? kpi.compras.toLocaleString('pt-BR') : 'sem dados'}${rwPurchasesChange !== null ? ` (${rwPurchasesChange > 0 ? 'alta' : 'queda'} vs semana anterior)` : ''}`,
    `- Sessões (GA4): ${kpi.sessoes > 0 ? kpi.sessoes.toLocaleString('pt-BR') : 'sem dados'}${rwSessionsChange !== null ? ` (${rwSessionsChange > 0 ? 'alta' : 'queda'} vs semana anterior)` : ''}`,
    `- ROAS realizado: ${kpi.roas !== null ? `${kpi.roas.toFixed(2)}x` : 'sem dados'}`,
    `- Taxa de conversão: ${kpi.taxaConversao !== null ? `${kpi.taxaConversao.toFixed(2)}%` : 'sem dados'}`,
    `- Ticket médio: ${kpi.ticketMedio !== null ? formatCurrency(kpi.ticketMedio) : 'sem dados'}`,
    `- Custo por sessão: ${kpi.cps !== null ? formatCurrency(kpi.cps) : 'sem dados'}`,
    ``,
    `Contexto do mês:`,
    `- Faturamento acumulado: ${month.revenue > 0 ? formatCurrency(month.revenue) : 'sem dados'} (${daysElapsed} de ${daysInMonth} dias)`,
    `- Projeção para fechar o mês: ${projecaoMes !== null ? formatCurrency(projecaoMes) : 'insuficiente'}`,
    `- Resultado vs meta ROAS: ${roasAboveMeta === true ? 'ACIMA DA META' : roasAboveMeta === false ? 'ABAIXO DA META' : 'meta não definida'}`,
    `- Cliente no prazo (receita vs pacing): ${clienteNoPrazo ? 'SIM' : 'NÃO'}`,
    `  (Se o cliente NÃO está no prazo, não exponha projeção nem acumulado do mês de forma negativa.)`,
    ``,
    `Top produtos da semana (GA4):`,
    topProductsStr,
    hasFunnelData ? `\n${funnelBlock}` : '',
  ].join('\n')

  const checkin = await fetchCheckin(clientId, lastWeekStart, lastWeekEnd)

  const prompt = buildReportPrompt({
    businessType: client.businessType ?? 'ECOMMERCE',
    period: 'weekly',
    clientName: client.name,
    periodLabel: periodoStr,
    checkin,
    dadosSistema,
  })

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

export async function generateMonthlyReportForClient(
  clientId: string,
  year?: number,
  month?: number, // 0-indexed
): Promise<string | null> {
  const today = new Date()
  // Default: last completed month
  const targetYear  = year  ?? (today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear())
  const targetMonth = month ?? (today.getMonth() === 0 ? 11 : today.getMonth() - 1)

  const monthStart = new Date(targetYear, targetMonth, 1)
  const monthEnd   = new Date(targetYear, targetMonth + 1, 0)

  // Previous month for comparison
  const prevMonthStart = new Date(targetYear, targetMonth - 1, 1)
  const prevMonthEnd   = new Date(targetYear, targetMonth, 0)

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

  const snapInclude = { platformAccount: { select: { platform: true } } } as const

  const [currSnaps, prevSnaps, goals] = await Promise.all([
    prisma.metricSnapshot.findMany({
      where: { clientId, date: { gte: monthStart, lte: monthEnd } },
      include: snapInclude,
    }),
    prisma.metricSnapshot.findMany({
      where: { clientId, date: { gte: prevMonthStart, lte: prevMonthEnd } },
      include: snapInclude,
    }),
    prisma.goal.findMany({
      where: { clientId, period: 'MONTHLY', startDate: { lte: monthEnd }, endDate: { gte: monthStart } },
    }),
  ])

  const monthLabel = monthStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const pctChange = (curr: number, prev: number) =>
    prev > 0 ? ((curr - prev) / prev) * 100 : null

  // ── LOCAL ─────────────────────────────────────────────────────────────────
  if (client.businessType === 'LOCAL') {
    function computeLocal(snaps: typeof currSnaps) {
      const meta = snaps.filter((x) => x.platformAccount.platform === 'META_ADS')
      const spend       = meta.reduce((s, x) => s + Number(x.spend ?? 0), 0)
      const reach       = meta.reduce((s, x) => s + (x.reach ?? 0), 0)
      const mensagens   = meta.reduce((s, x) => s + (x.mensagens ?? 0), 0)
      const landingViews= meta.reduce((s, x) => s + (x.landingPageViews ?? 0), 0)
      const adRevenue   = meta.reduce((s, x) => s + Number(x.conversionValue ?? 0), 0)
      // WhatsApp campaigns store results in mensagens, not conversions — use as fallback
      const metaConvRaw = meta.reduce((s, x) => s + (x.conversions ?? 0), 0)
      const leads       = metaConvRaw > 0 ? metaConvRaw : mensagens
      const cpl         = leads > 0 && spend > 0 ? spend / leads : null
      return { spend, reach, mensagens, landingViews, leads, adRevenue, cpl }
    }

    const curr = computeLocal(currSnaps)
    const prev = computeLocal(prevSnaps)

    const leadsGoalM      = goals.find((g) => g.metric === 'LEADS')
    const mensagensGoalM  = goals.find((g) => g.metric === 'MENSAGENS')
    const spendGoalM      = goals.find((g) => g.metric === 'SPEND' || g.metric === 'INVESTMENT')
    const cplGoalM        = goals.find((g) => g.metric === 'CPL')
    const conversionsGoalM= goals.find((g) => g.metric === 'CONVERSIONS')
    const faturamentoGoalM= goals.find((g) => g.metric === 'FATURAMENTO')

    // ── Detect client goal profile ───────────────────────────────────────────
    const isRestaurantMode = !!(conversionsGoalM || faturamentoGoalM)
    const hasLeadsGoalM    = !!leadsGoalM
    const hasMensagensGoalM= !!mensagensGoalM

    let objetivoPrincipal: string
    if (isRestaurantMode)       objetivoPrincipal = 'vendas e pedidos via anúncio (tipo restaurante/delivery)'
    else if (hasLeadsGoalM)     objetivoPrincipal = 'geração de leads e cadastros'
    else if (hasMensagensGoalM) objetivoPrincipal = 'geração de mensagens e contatos'
    else                         objetivoPrincipal = 'alcance e engajamento geral'

    // ── Achievement percentages (only for metrics with goals) ────────────────
    const leadsAchieved     = leadsGoalM     ? Math.round((curr.leads     / Number(leadsGoalM.targetValue))     * 100) : null
    const mensagensAchieved = mensagensGoalM ? Math.round((curr.mensagens / Number(mensagensGoalM.targetValue)) * 100) : null
    const convAchieved      = conversionsGoalM ? Math.round((curr.leads   / Number(conversionsGoalM.targetValue)) * 100) : null
    const fatAchieved       = faturamentoGoalM && curr.adRevenue > 0
                              ? Math.round((curr.adRevenue / Number(faturamentoGoalM.targetValue)) * 100) : null

    const msgChange    = pctChange(curr.mensagens,   prev.mensagens)
    const reachChange  = pctChange(curr.reach,        prev.reach)
    const landingChange= pctChange(curr.landingViews, prev.landingViews)
    const leadsChgM    = pctChange(curr.leads,        prev.leads)
    const revenueChgM  = pctChange(curr.adRevenue,    prev.adRevenue)

    // ── Tom do mês ───────────────────────────────────────────────────────────
    const foiBomMes = isRestaurantMode
      ? (convAchieved ?? 0) >= 90 || (fatAchieved ?? 0) >= 90 || (revenueChgM ?? 0) >= 0
      : hasLeadsGoalM
        ? (leadsAchieved ?? 0) >= 90 || (leadsChgM ?? 0) >= 0
        : (msgChange ?? 0) >= 0 || (mensagensAchieved ?? 0) >= 90

    // ── Dynamic data block ───────────────────────────────────────────────────
    let dadosPrimarios: string
    if (isRestaurantMode) {
      dadosPrimarios = [
        `- Pedidos via anúncio: ${curr.leads > 0 ? curr.leads.toLocaleString('pt-BR') : 'sem dados'}${leadsChgM !== null ? ` (${leadsChgM > 0 ? '+' : ''}${leadsChgM.toFixed(0)}% vs mês anterior)` : ''}`,
        curr.adRevenue > 0 ? `- Faturamento via anúncio: ${formatCurrency(curr.adRevenue)}${revenueChgM !== null ? ` (${revenueChgM > 0 ? '+' : ''}${revenueChgM.toFixed(0)}% vs mês anterior)` : ''}` : '',
        `- Pessoas alcançadas: ${curr.reach > 0 ? curr.reach.toLocaleString('pt-BR') : 'sem dados'}${reachChange !== null ? ` (${reachChange > 0 ? '+' : ''}${reachChange.toFixed(0)}% vs mês anterior)` : ''}`,
        `- Investimento total: ${curr.spend > 0 ? formatCurrency(curr.spend) : 'sem dados'}`,
        conversionsGoalM ? `- Meta de pedidos: ${conversionsGoalM.targetValue} (atingido: ${convAchieved ?? '—'}%)` : '',
        faturamentoGoalM ? `- Meta de faturamento: ${formatCurrency(Number(faturamentoGoalM.targetValue))} (atingido: ${fatAchieved ?? '—'}%)` : '',
        spendGoalM ? `- Budget: ${formatCurrency(Number(spendGoalM.targetValue))}` : '',
      ].filter(Boolean).join('\n')
    } else if (hasLeadsGoalM) {
      dadosPrimarios = [
        `- Leads gerados: ${curr.leads > 0 ? `${curr.leads.toLocaleString('pt-BR')}${curr.cpl !== null ? ` (custo por lead: ${formatCurrency(curr.cpl)})` : ''}` : 'sem dados'}${leadsChgM !== null ? ` (${leadsChgM > 0 ? '+' : ''}${leadsChgM.toFixed(0)}% vs mês anterior)` : ''}`,
        `- Pessoas alcançadas: ${curr.reach > 0 ? curr.reach.toLocaleString('pt-BR') : 'sem dados'}${reachChange !== null ? ` (${reachChange > 0 ? '+' : ''}${reachChange.toFixed(0)}% vs mês anterior)` : ''}`,
        `- Visitas ao perfil: ${curr.landingViews > 0 ? curr.landingViews.toLocaleString('pt-BR') : 'sem dados'}`,
        `- Investimento total: ${curr.spend > 0 ? formatCurrency(curr.spend) : 'sem dados'}`,
        leadsGoalM ? `- Meta de leads: ${leadsGoalM.targetValue} (atingido: ${leadsAchieved ?? '—'}%)` : '',
        cplGoalM   ? `- Meta de CPL: ${formatCurrency(Number(cplGoalM.targetValue))}` : '',
        spendGoalM ? `- Budget: ${formatCurrency(Number(spendGoalM.targetValue))}` : '',
      ].filter(Boolean).join('\n')
    } else {
      dadosPrimarios = [
        `- Mensagens recebidas: ${curr.mensagens > 0 ? curr.mensagens.toLocaleString('pt-BR') : 'sem dados'}${msgChange !== null ? ` (${msgChange > 0 ? '+' : ''}${msgChange.toFixed(0)}% vs mês anterior)` : ''}`,
        `- Pessoas alcançadas: ${curr.reach > 0 ? curr.reach.toLocaleString('pt-BR') : 'sem dados'}${reachChange !== null ? ` (${reachChange > 0 ? '+' : ''}${reachChange.toFixed(0)}% vs mês anterior)` : ''}`,
        `- Visitas ao perfil: ${curr.landingViews > 0 ? curr.landingViews.toLocaleString('pt-BR') : 'sem dados'}${landingChange !== null ? ` (${landingChange > 0 ? '+' : ''}${landingChange.toFixed(0)}% vs mês anterior)` : ''}`,
        `- Investimento total: ${curr.spend > 0 ? formatCurrency(curr.spend) : 'sem dados'}`,
        mensagensGoalM ? `- Meta de mensagens: ${mensagensGoalM.targetValue} (atingido: ${mensagensAchieved ?? '—'}%)` : '',
        curr.leads > 0 ? `- Leads gerados: ${curr.leads.toLocaleString('pt-BR')}${curr.cpl !== null ? ` (CPL: ${formatCurrency(curr.cpl)})` : ''}` : '',
        spendGoalM ? `- Budget: ${formatCurrency(Number(spendGoalM.targetValue))}` : '',
      ].filter(Boolean).join('\n')
    }

    const prevComparativo = isRestaurantMode
      ? `- Pedidos: ${prev.leads > 0 ? prev.leads.toLocaleString('pt-BR') : 'sem dados'}\n- Alcance: ${prev.reach > 0 ? prev.reach.toLocaleString('pt-BR') : 'sem dados'}\n- Investimento: ${prev.spend > 0 ? formatCurrency(prev.spend) : 'sem dados'}`
      : hasLeadsGoalM
        ? `- Leads: ${prev.leads > 0 ? prev.leads.toLocaleString('pt-BR') : 'sem dados'}\n- Alcance: ${prev.reach > 0 ? prev.reach.toLocaleString('pt-BR') : 'sem dados'}\n- Investimento: ${prev.spend > 0 ? formatCurrency(prev.spend) : 'sem dados'}`
        : `- Mensagens: ${prev.mensagens > 0 ? prev.mensagens.toLocaleString('pt-BR') : 'sem dados'}\n- Alcance: ${prev.reach > 0 ? prev.reach.toLocaleString('pt-BR') : 'sem dados'}\n- Investimento: ${prev.spend > 0 ? formatCurrency(prev.spend) : 'sem dados'}`

    const dadosSistema = [
      `OBJETIVO PRINCIPAL DESTE CLIENTE: ${objetivoPrincipal}`,
      `Origem: mesma base do painel da agência (métricas de mídia via MetricSnapshot).`,
      ``,
      `Mês atual:`,
      dadosPrimarios,
      ``,
      `Mês anterior (comparativo):`,
      prevComparativo,
      ``,
      `Foi bom mês (vs meta/mês anterior): ${foiBomMes ? 'SIM' : 'NÃO'}`,
    ].join('\n')

    const localCheckin = await fetchCheckin(clientId, monthStart, monthEnd)

    const localMonthlyPrompt = buildReportPrompt({
      businessType: client.businessType ?? 'LOCAL',
      period: 'monthly',
      clientName: client.name,
      periodLabel: monthLabel,
      checkin: localCheckin,
      dadosSistema,
    })

    const localMonthlyResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      messages: [{ role: 'user', content: localMonthlyPrompt }],
    })

    const localMonthlyContent = localMonthlyResponse.content[0]
    if (localMonthlyContent.type !== 'text') throw new Error('Resposta da IA inválida.')

    const reportContent = localMonthlyContent.text

    await prisma.monthlyReport.upsert({
      where: { clientId_monthStart: { clientId, monthStart } },
      create: { clientId, monthStart, content: reportContent },
      update: { content: reportContent, generatedAt: new Date() },
    })

    return reportContent
  }

  // ── ECOMMERCE ─────────────────────────────────────────────────────────────
  function computeEcom(snaps: typeof currSnaps) {
    const ga4  = snaps.filter((x) => x.platformAccount.platform === 'GA4')
    const ads  = snaps.filter((x) => x.platformAccount.platform !== 'GA4')
    const spend    = ads.reduce((s, x) => s + Number(x.spend ?? 0), 0)
    const revenue  = ga4.reduce((s, x) => s + Number(x.conversionValue ?? 0), 0)
    const purchases= ga4.reduce((s, x) => s + (x.conversions ?? 0), 0)
    const sessions = ga4.reduce((s, x) => s + (x.clicks ?? 0), 0)
    return {
      spend, revenue, purchases, sessions,
      roas:        spend > 0 && revenue   > 0 ? revenue / spend        : null,
      cpa:         spend > 0 && purchases > 0 ? spend / purchases      : null,
      ticketMedio: purchases > 0 && revenue > 0 ? revenue / purchases  : null,
      taxaConversao: sessions > 0 && purchases > 0 ? (purchases / sessions) * 100 : null,
    }
  }

  const curr = computeEcom(currSnaps)
  const prev = computeEcom(prevSnaps)

  const faturamentoGoal = goals.find((g) => g.metric === 'FATURAMENTO')
  const roasGoal        = goals.find((g) => g.metric === 'ROAS')
  const spendGoal       = goals.find((g) => g.metric === 'SPEND' || g.metric === 'INVESTMENT')

  const fatAchieved  = faturamentoGoal && curr.revenue > 0
    ? Math.round((curr.revenue / Number(faturamentoGoal.targetValue)) * 100) : null
  const roasAchieved = roasGoal && curr.roas !== null
    ? curr.roas >= Number(roasGoal.targetValue) : null

  const revChange  = pctChange(curr.revenue,   prev.revenue)
  const purcChange = pctChange(curr.purchases, prev.purchases)

  const foiBomMes = (fatAchieved ?? 0) >= 90 || roasAchieved === true || (revChange ?? 0) >= 0

  const ga4PropertyId = client.platformAccounts[0]?.externalId ?? null
  let topProductsStr = 'dados de produto não disponíveis'
  if (ga4PropertyId) {
    try {
      const ga4Client = new GA4Client()
      const since = toLocalDateStr(monthStart)
      const until = toLocalDateStr(monthEnd)
      const items = await ga4Client.getItemReport(ga4PropertyId, since, until, 5)
      if (items.length > 0) {
        topProductsStr = items.map((item, i) => {
          const rev = parseFloat(item.itemRevenue)
          const qty = parseInt(item.itemsPurchased)
          const name = item.itemName === '(not set)' ? 'Produto sem nome' : item.itemName
          return `${i + 1}. ${name} — ${formatCurrency(rev)} (${qty} un.)`
        }).join('\n')
      } else {
        topProductsStr = 'nenhuma venda de produto registrada no mês'
      }
    } catch {
      topProductsStr = 'dados de produto indisponíveis no momento'
    }
  }

  // Mesmos números do painel (getClientKPIs), na janela do mês fechado.
  const kpi = await getClientKPIs(
    clientId,
    toLocalDateStr(monthStart),
    toLocalDateStr(monthEnd),
  )

  const dadosSistema = [
    `Origem: mesma base do painel da agência (faturamento, compras, ROAS e ticket médio via GA4, MetricSnapshot.conversionValue; investimento somado das contas de mídia).`,
    ``,
    `Mês atual:`,
    `- Investimento: ${kpi.investimento > 0 ? formatCurrency(kpi.investimento) : 'sem dados'}`,
    `- Faturamento (GA4): ${kpi.faturamento > 0 ? formatCurrency(kpi.faturamento) : 'sem dados'}${revChange !== null ? ` (${revChange > 0 ? 'alta' : 'queda'} vs mês anterior)` : ''}`,
    `- Compras: ${kpi.compras > 0 ? kpi.compras.toLocaleString('pt-BR') : 'sem dados'}${purcChange !== null ? ` (${purcChange > 0 ? 'alta' : 'queda'} vs mês anterior)` : ''}`,
    `- Sessões (GA4): ${kpi.sessoes > 0 ? kpi.sessoes.toLocaleString('pt-BR') : 'sem dados'}`,
    `- ROAS: ${kpi.roas !== null ? `${kpi.roas.toFixed(2)}x` : 'sem dados'}`,
    `- Ticket médio: ${kpi.ticketMedio !== null ? formatCurrency(kpi.ticketMedio) : 'sem dados'}`,
    ``,
    `Metas:`,
    `- Meta faturamento: ${faturamentoGoal ? `${formatCurrency(Number(faturamentoGoal.targetValue))} (atingido: ${fatAchieved ?? '—'}%)` : 'não definida'}`,
    `- Meta ROAS: ${roasGoal ? `${Number(roasGoal.targetValue).toFixed(2)}x (${roasAchieved === true ? 'ATINGIDA' : 'não atingida'})` : 'não definida'}`,
    `- Budget: ${spendGoal ? formatCurrency(Number(spendGoal.targetValue)) : 'não definido'}`,
    ``,
    `Foi bom mês (vs meta/mês anterior): ${foiBomMes ? 'SIM' : 'NÃO'}`,
    ``,
    `Top produtos do mês (GA4):`,
    topProductsStr,
  ].join('\n')

  const checkin = await fetchCheckin(clientId, monthStart, monthEnd)

  const ecomMonthlyPrompt = buildReportPrompt({
    businessType: client.businessType ?? 'ECOMMERCE',
    period: 'monthly',
    clientName: client.name,
    periodLabel: monthLabel,
    checkin,
    dadosSistema,
  })

  const ecomResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{ role: 'user', content: ecomMonthlyPrompt }],
  })

  const ecomContent = ecomResponse.content[0]
  if (ecomContent.type !== 'text') throw new Error('Resposta da IA inválida.')

  const reportContent = ecomContent.text

  await prisma.monthlyReport.upsert({
    where: { clientId_monthStart: { clientId, monthStart } },
    create: { clientId, monthStart, content: reportContent },
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
    // Resiliência: falha em um cliente não pode quebrar a rotina inteira.
    try {
      const report = await generateWeeklyReportForClient(client.id)
      if (report) reportsGenerated++
    } catch (err) {
      console.error(`[generateAllWeeklyReports] falha no cliente ${client.id}:`, err)
    }
  }

  return { clientsProcessed: clients.length, reportsGenerated }
}
