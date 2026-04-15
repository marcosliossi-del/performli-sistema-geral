import { prisma } from '@/lib/prisma'

function statusLabel(status: string | null): string {
  if (status === 'OTIMO')   return 'ÓTIMO ✅'
  if (status === 'REGULAR') return 'REGULAR ⚠️'
  if (status === 'RUIM')    return 'RUIM 🔴'
  return 'Sem dados ⚪'
}

// ── Sazonalidade ──────────────────────────────────────────────────────────────

function getNthWeekday(year: number, month: number, weekday: number, n: number): Date {
  // weekday: 0=Sun, 5=Fri, etc. month: 1-based
  const d = new Date(year, month - 1, 1)
  let count = 0
  while (count < n) {
    if (d.getDay() === weekday) count++
    if (count < n) d.setDate(d.getDate() + 1)
  }
  return d
}

export function getSeasonalityContext(now: Date = new Date()): string {
  const year = now.getFullYear()
  const nextYear = year + 1
  const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(now.getDate() - 7)
  const ninetyDaysOut = new Date(now); ninetyDaysOut.setDate(now.getDate() + 90)

  // Páscoa (hardcoded por complexidade do algoritmo)
  const easterByYear: Record<number, string> = {
    2025: '2025-04-20',
    2026: '2026-04-05',
    2027: '2027-03-28',
    2028: '2028-04-16',
  }
  // Carnaval (Terça-feira)
  const carnavalByYear: Record<number, string> = {
    2025: '2025-03-04',
    2026: '2026-02-17',
    2027: '2027-03-02',
    2028: '2028-02-15',
  }

  const events: { date: Date; name: string; tip: string }[] = []

  function add(dateStr: string | Date, name: string, tip: string) {
    const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
    events.push({ date: d, name, tip })
  }

  // Fixed events — current and next year
  for (const y of [year, nextYear]) {
    add(`${y}-01-01`, 'Ano Novo / Réveillon', 'Delivery e restaurantes em alta; liquidações pós-Natal')
    add(`${y}-02-14`, 'Dia de São Valentim', 'Casais, presentes, delivery romântico')
    add(`${y}-03-08`, 'Dia da Mulher', 'Moda, beleza, cosméticos — ótimo para e-commerce')
    add(`${y}-04-21`, 'Tiradentes', 'Feriado — delivery e lazer sobem, B2B cai')
    add(`${y}-05-01`, 'Dia do Trabalho', 'Feriado — delivery e lazer sobem')
    add(`${y}-06-12`, 'Dia dos Namorados', '2ª maior data do e-commerce — joias, cosméticos, delivery romântico')
    add(`${y}-06-24`, 'São João / Festa Junina', 'Alimentos, delivery, eventos locais')
    add(`${y}-09-07`, 'Independência do Brasil', 'Feriado — liquidações e ações patrióticas')
    add(`${y}-10-12`, 'Dia das Crianças', 'Brinquedos, eletrônicos, roupas infantis')
    add(`${y}-11-02`, 'Finados', 'Feriado — queda de conversão esperada')
    add(`${y}-11-15`, 'Proclamação da República', 'Feriado nacional')
    add(`${y}-12-25`, 'Natal', 'Pico máximo — criativos emocionais, frete grátis, urgência')
    // Dia das Mães — 2º domingo de maio
    add(getNthWeekday(y, 5, 0, 2), 'Dia das Mães', 'MAIOR data do e-commerce — iniciar campanhas 3 semanas antes, emoção + frete grátis')
    // Dia dos Pais — 2º domingo de agosto
    add(getNthWeekday(y, 8, 0, 2), 'Dia dos Pais', 'Eletrônicos, roupas, experiências — alta conversão')
    // Black Friday — 4ª sexta-feira de novembro
    add(getNthWeekday(y, 11, 5, 4), 'Black Friday', 'Maior pico do ano — preparar desde outubro, verba, landing pages, estoque')
    // Carnaval e Páscoa
    if (carnavalByYear[y]) add(carnavalByYear[y], 'Carnaval', 'Delivery e restaurantes sobem muito; e-commerce em queda')
    if (easterByYear[y])   add(easterByYear[y],   'Páscoa',   'Chocolates, delivery — pico 15 dias antes da data')
  }

  const upcoming = events
    .filter(e => e.date >= sevenDaysAgo && e.date <= ninetyDaysOut)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  if (upcoming.length === 0) return ''

  const lines = ['=== SAZONALIDADE — PRÓXIMOS 90 DIAS ===']
  for (const e of upcoming) {
    const diff = Math.round((e.date.getTime() - now.getTime()) / 86400000)
    const dateStr = e.date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    const timing = diff < 0  ? `passou há ${Math.abs(diff)} dias`
                 : diff === 0 ? 'HOJE'
                 : diff <= 7  ? `em ${diff} dia${diff > 1 ? 's' : ''} (!)`
                 : `em ${diff} dias`
    lines.push(`• ${e.name} (${dateStr}) — ${timing}: ${e.tip}`)
  }
  return lines.join('\n')
}

// ── Contexto do cliente ───────────────────────────────────────────────────────

export async function getClientAIContext(clientId: string): Promise<string> {
  const now          = new Date()
  const thirtyAgo    = new Date(now); thirtyAgo.setDate(now.getDate() - 30)
  const eightWeeksAgo = new Date(now); eightWeeksAgo.setDate(now.getDate() - 56)
  const twoWeeksAgo  = new Date(now); twoWeeksAgo.setDate(now.getDate() - 14)

  const [client, healthScores, metricSnaps, campaignSnaps, weeklyReports, alerts, operations, churnRisk] =
    await Promise.all([
      prisma.client.findUnique({
        where: { id: clientId },
        include: {
          assignments: {
            where: { isPrimary: true },
            include: { user: { select: { name: true } } },
            take: 1,
          },
          goals: { orderBy: { startDate: 'desc' }, take: 10 },
          interactions: {
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: { user: { select: { name: true } } },
          },
        },
      }),
      prisma.healthScore.findMany({
        where: { clientId, periodStart: { gte: eightWeeksAgo } },
        orderBy: { periodStart: 'desc' },
      }),
      prisma.metricSnapshot.findMany({
        where: { clientId, date: { gte: thirtyAgo } },
        include: { platformAccount: { select: { platform: true } } },
      }),
      prisma.campaignSnapshot.findMany({
        where: { clientId, date: { gte: thirtyAgo } },
        take: 200,
      }),
      prisma.weeklyReport.findMany({
        where: { clientId },
        orderBy: { weekStart: 'desc' },
        take: 2,
      }),
      prisma.alert.findMany({
        where: { clientId, createdAt: { gte: twoWeeksAgo } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.operation.findMany({
        where: { clientId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { user: { select: { name: true } } },
      }),
      prisma.churnRiskScore.findFirst({
        where: { clientId },
        orderBy: { weekStart: 'desc' },
      }),
    ])

  if (!client) return ''

  const L: string[] = []
  const push = (...s: string[]) => L.push(...s)

  push(`=== CONTEXTO DO CLIENTE: ${client.name.toUpperCase()} ===`, '')

  // ── Informações gerais ─────────────────────────────────────────────────────
  push('📋 INFORMAÇÕES GERAIS')
  if (client.industry)      push(`- Segmento: ${client.industry}`)
  push(`- Status: ${client.status}`)
  if (client.contractValue) push(`- Contrato: R$ ${Number(client.contractValue).toLocaleString('pt-BR')}/mês`)
  if (client.tags?.length)  push(`- Tags: ${client.tags.join(', ')}`)
  if (client.notes)         push(`- Notas: ${client.notes.slice(0, 300)}`)
  const manager = client.assignments[0]?.user?.name
  if (manager) push(`- Gestor principal: ${manager}`)

  // ── Metas ─────────────────────────────────────────────────────────────────
  if (client.goals.length > 0) {
    push('', '🎯 METAS CADASTRADAS')
    for (const g of client.goals.slice(0, 6)) {
      const period  = g.period === 'MONTHLY' ? 'mensal' : 'semanal'
      const endDate = g.endDate.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })
      push(`- ${g.metric}: meta ${Number(g.targetValue).toFixed(2)} (${period}, até ${endDate})`)
    }
  }

  // ── Saúde por métrica ──────────────────────────────────────────────────────
  if (healthScores.length > 0) {
    push('', '💊 SAÚDE — ÚLTIMAS 8 SEMANAS')
    const byKey = new Map<string, typeof healthScores>()
    for (const hs of healthScores) {
      const k = `${hs.metric}_${hs.period}`
      if (!byKey.has(k)) byKey.set(k, [])
      byKey.get(k)!.push(hs)
    }
    for (const scores of byKey.values()) {
      const sorted = scores.sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime())
      const cur    = sorted[0]
      const trend  = sorted.slice(0, 5).map(s =>
        s.status === 'OTIMO' ? '✅' : s.status === 'REGULAR' ? '⚠️' : s.status === 'RUIM' ? '🔴' : '⚪'
      ).join(' → ')
      push(
        `- ${cur.metric} (${cur.period}): ${statusLabel(cur.status)} — atingimento ${Number(cur.achievementPct).toFixed(1)}%` +
        ` (real: ${Number(cur.actualValue).toFixed(2)} / meta: ${Number(cur.targetValue).toFixed(2)})`,
        `  Tendência: ${trend}`,
      )
    }
  }

  // ── Métricas agregadas por plataforma (30 dias) ───────────────────────────
  if (metricSnaps.length > 0) {
    push('', '📊 PERFORMANCE ÚLTIMOS 30 DIAS (por plataforma)')
    type PAgg = { spend: number; impressions: number; clicks: number; conversions: number; conversionValue: number; newUsers: number }
    const byPlatform = new Map<string, PAgg>()
    for (const s of metricSnaps) {
      const p = s.platformAccount.platform
      if (!byPlatform.has(p)) byPlatform.set(p, { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0, newUsers: 0 })
      const agg = byPlatform.get(p)!
      agg.spend          += Number(s.spend          ?? 0)
      agg.impressions    += s.impressions            ?? 0
      agg.clicks         += s.clicks                 ?? 0
      agg.conversions    += s.conversions            ?? 0
      agg.conversionValue += Number(s.conversionValue ?? 0)
      agg.newUsers       += s.newUsers               ?? 0
    }
    for (const [platform, agg] of byPlatform) {
      push(``, `[${platform}]`)
      if (agg.spend > 0)       push(`  Investimento: R$ ${agg.spend.toFixed(2)}`)
      if (agg.conversions > 0) {
        push(`  Conversões: ${agg.conversions}`)
        if (agg.conversionValue > 0 && agg.spend > 0) {
          push(`  Receita atribuída: R$ ${agg.conversionValue.toFixed(2)} | ROAS: ${(agg.conversionValue / agg.spend).toFixed(2)}x`)
        }
        if (agg.spend > 0) push(`  CPA médio: R$ ${(agg.spend / agg.conversions).toFixed(2)}`)
      }
      if (platform === 'GA4') {
        if (agg.clicks   > 0) push(`  Sessões: ${agg.clicks.toLocaleString()}`)
        if (agg.newUsers > 0) push(`  Novos usuários: ${agg.newUsers.toLocaleString()}`)
        if (agg.conversions > 0 && agg.clicks > 0)
          push(`  Taxa de conversão: ${((agg.conversions / agg.clicks) * 100).toFixed(2)}%`)
        if (agg.conversionValue > 0 && agg.conversions > 0)
          push(`  Ticket médio: R$ ${(agg.conversionValue / agg.conversions).toFixed(2)}`)
      } else {
        if (agg.impressions > 0) {
          const ctr = agg.clicks > 0 ? ((agg.clicks / agg.impressions) * 100).toFixed(2) : 'N/D'
          push(`  Impressões: ${agg.impressions.toLocaleString()} | CTR: ${ctr}%`)
          if (agg.spend > 0) push(`  CPM: R$ ${((agg.spend / agg.impressions) * 1000).toFixed(2)}`)
        }
        if (agg.spend > 0 && agg.clicks > 0) push(`  CPC: R$ ${(agg.spend / agg.clicks).toFixed(2)}`)
      }
    }
  }

  // ── Top campanhas ──────────────────────────────────────────────────────────
  if (campaignSnaps.length > 0) {
    push('', '📣 TOP CAMPANHAS — ÚLTIMOS 30 DIAS')
    type CAgg = { name: string; platform: string; spend: number; conversions: number; conversionValue: number }
    const byCampaign = new Map<string, CAgg>()
    for (const c of campaignSnaps) {
      const k = `${c.campaignId}_${c.platform}`
      if (!byCampaign.has(k)) byCampaign.set(k, { name: c.campaignName, platform: c.platform, spend: 0, conversions: 0, conversionValue: 0 })
      const agg = byCampaign.get(k)!
      agg.spend          += Number(c.spend          ?? 0)
      agg.conversions    += c.conversions            ?? 0
      agg.conversionValue += Number(c.conversionValue ?? 0)
    }
    const sorted = [...byCampaign.values()].sort((a, b) => b.spend - a.spend).slice(0, 5)
    for (const c of sorted) {
      const roas = c.spend > 0 && c.conversionValue > 0 ? ` | ROAS: ${(c.conversionValue / c.spend).toFixed(2)}x` : ''
      const conv = c.conversions > 0 ? ` | ${c.conversions} conv.` : ''
      push(`- [${c.platform}] ${c.name}: R$ ${c.spend.toFixed(2)}${conv}${roas}`)
    }
  }

  // ── Relatórios semanais ────────────────────────────────────────────────────
  if (weeklyReports.length > 0) {
    push('', '📝 RELATÓRIOS SEMANAIS RECENTES')
    for (const r of weeklyReports) {
      const weekStr = r.weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      push(``, `[Semana de ${weekStr}]`, r.content.slice(0, 700) + (r.content.length > 700 ? '...' : ''))
    }
  }

  // ── Alertas recentes ───────────────────────────────────────────────────────
  if (alerts.length > 0) {
    push('', '🚨 ALERTAS RECENTES (últimas 2 semanas)')
    for (const a of alerts) {
      push(`- ${a.createdAt.toLocaleDateString('pt-BR')}: [${a.type}] ${a.title}`)
    }
  }

  // ── Operações/notas ────────────────────────────────────────────────────────
  if (operations.length > 0) {
    push('', '🔧 OPERAÇÕES E NOTAS RECENTES')
    for (const op of operations) {
      push(`- ${op.createdAt.toLocaleDateString('pt-BR')} (${op.user.name}): ${op.subject} — ${op.done.slice(0, 200)}`)
    }
  }

  // ── Interações CRM ────────────────────────────────────────────────────────
  if (client.interactions.length > 0) {
    push('', '💬 INTERAÇÕES CRM RECENTES')
    for (const i of client.interactions) {
      push(`- ${i.createdAt.toLocaleDateString('pt-BR')} [${i.type}] (${i.user.name}): ${i.description.slice(0, 200)}`)
    }
  }

  // ── Risco de churn ─────────────────────────────────────────────────────────
  if (churnRisk) {
    push('', '⚠️ RISCO DE CHURN')
    const riskLabel = churnRisk.score >= 70 ? 'ALTO 🔴' : churnRisk.score >= 40 ? 'MÉDIO ⚠️' : 'BAIXO ✅'
    const f = churnRisk.factors as Record<string, unknown>
    push(`- Score: ${churnRisk.score}/100 — ${riskLabel}`)
    if (f?.consecutiveRuimWeeks) push(`- Semanas consecutivas em RUIM: ${f.consecutiveRuimWeeks}`)
    if (f?.avgAchievementPct != null) push(`- Atingimento médio atual: ${f.avgAchievementPct}%`)
    if (f?.trend != null) push(`- Tendência vs. semana anterior: ${Number(f.trend) > 0 ? '+' : ''}${f.trend}%`)
  }

  push('', '=== FIM DO CONTEXTO DO CLIENTE ===')
  return L.join('\n')
}
