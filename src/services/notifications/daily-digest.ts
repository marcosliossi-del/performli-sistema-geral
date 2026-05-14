/**
 * Daily Digest WhatsApp
 *
 * Envia múltiplos blocos separados por gestor, ordenados do mais crítico ao melhor.
 * Cada bloco inclui insights baseados no histórico real do cliente (queda vs. média histórica).
 */

import { prisma } from '@/lib/prisma'
import { broadcastWhatsApp } from '@/lib/whatsapp'
import { getMonthRange, getWeekRange } from '@/lib/utils'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function emoji(status: string | null) {
  if (status === 'OTIMO')   return '✅'
  if (status === 'REGULAR') return '⚠️'
  if (status === 'RUIM')    return '🔴'
  return '⚪'
}

function statusOrder(status: string | null): number {
  if (status === 'RUIM')    return 0
  if (status === 'REGULAR') return 1
  if (status === 'OTIMO')   return 2
  return 3
}

function streakLabel(status: string | null, days: number): string {
  const ordinal = `${days}º dia`
  if (status === 'RUIM')    return `${ordinal} em estado crítico`
  if (status === 'REGULAR') return `${ordinal} em estado regular`
  if (status === 'OTIMO')   return `${ordinal} em ótimo estado`
  return ordinal
}

function toNum(v: { toNumber: () => number } | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'number' ? v : v.toNumber()
}

// Insight baseado no histórico real do cliente vs. meta
// histDrop: quando caiu vs. histórico do próprio cliente (mais específico)
// belowGoal: quando só está abaixo da meta (sem histórico suficiente)
const METRIC_CONTEXT: Record<string, { histDrop: string; belowGoal: string; action: string }> = {
  TICKET_MEDIO:  {
    histDrop:  'ticket médio caiu vs. histórico do cliente',
    belowGoal: 'ticket médio abaixo da meta',
    action:    'reveja produtos anunciados — possível grade quebrada ou falta de estoque',
  },
  ROAS: {
    histDrop:  'ROAS caiu vs. média histórica do cliente',
    belowGoal: 'ROAS abaixo da meta',
    action:    'revisar campanhas de menor retorno e criativos ativos',
  },
  FATURAMENTO: {
    histDrop:  'faturamento abaixo do padrão histórico do cliente',
    belowGoal: 'faturamento abaixo da meta do mês',
    action:    'analisar produtos mais vendidos e promoções ativas',
  },
  TAXA_CONVERSAO: {
    histDrop:  'taxa de conversão caiu vs. histórico do cliente',
    belowGoal: 'taxa de conversão abaixo da meta',
    action:    'revisar landing pages, checkout e anúncios de fundo de funil',
  },
  CONVERSIONS: {
    histDrop:  'volume de conversões abaixo do padrão histórico',
    belowGoal: 'conversões abaixo da meta',
    action:    'verificar funil de vendas e campanhas de conversão',
  },
  LEADS: {
    histDrop:  'geração de leads abaixo do histórico do cliente',
    belowGoal: 'leads abaixo da meta',
    action:    'revisar formulários, criativos e segmentação de captação',
  },
  MENSAGENS: {
    histDrop:  'volume de mensagens abaixo do padrão histórico',
    belowGoal: 'mensagens abaixo da meta',
    action:    'revisar segmentação, criativos e botão de WhatsApp nos anúncios',
  },
  SEGUIDORES: {
    histDrop:  'crescimento de seguidores abaixo do histórico',
    belowGoal: 'crescimento de seguidores abaixo da meta',
    action:    'revisar estratégia de conteúdo e frequência de posts',
  },
  CPL: {
    histDrop:  'CPL acima do histórico do cliente',
    belowGoal: 'CPL acima da meta',
    action:    'otimizar criativos de captação e testar novos públicos',
  },
  CPA: {
    histDrop:  'CPA acima do histórico do cliente',
    belowGoal: 'CPA acima da meta',
    action:    'revisar campanhas de conversão — testar públicos diferentes',
  },
  CAC: {
    histDrop:  'CAC acima do histórico do cliente',
    belowGoal: 'CAC acima da meta',
    action:    'rever estratégia de aquisição — incentivar recompras',
  },
  CTR: {
    histDrop:  'CTR caiu vs. histórico do cliente',
    belowGoal: 'CTR abaixo da meta',
    action:    'testar novos criativos — audiência pode estar saturada com os atuais',
  },
  INVESTMENT: {
    histDrop:  'investimento acima do padrão histórico',
    belowGoal: 'investimento acima do orçamento',
    action:    'ajustar limite de gastos das campanhas',
  },
  SPEND: {
    histDrop:  'budget acima do padrão histórico',
    belowGoal: 'budget acima do limite',
    action:    'ajustar limite de gastos das campanhas',
  },
}

type HealthScoreRow = {
  status: string
  period: string
  periodStart: Date
  metric: string
  achievementPct: { toNumber: () => number } | number
  actualValue: { toNumber: () => number } | number
  targetValue: { toNumber: () => number } | number
}

function worstRuimScore(scores: HealthScoreRow[]): HealthScoreRow | null {
  const ruim = scores.filter((s) => s.status === 'RUIM')
  if (ruim.length === 0) return null
  return ruim.sort((a, b) => toNum(a.achievementPct) - toNum(b.achievementPct))[0]
}

// Gera a linha de insight para um cliente RUIM.
// histAvg: média histórica de achievementPct das últimas semanas (pode ser null se sem histórico)
function buildInsightLine(
  worstScore: HealthScoreRow,
  histAvg: number | null,
): string | null {
  const ctx = METRIC_CONTEXT[worstScore.metric]
  if (!ctx) return null

  const currentPct = toNum(worstScore.achievementPct)

  if (histAvg !== null && histAvg > 10) {
    // Queda vs. histórico: se atual é 15%+ abaixo da média histórica
    const drop = Math.round(((histAvg - currentPct) / histAvg) * 100)
    if (drop >= 15) {
      return `   ↳ ${ctx.histDrop} (${drop}% abaixo da média) — ${ctx.action}`
    }
  }

  // Sem queda expressiva vs. histórico, mas ainda abaixo da meta
  return `   ↳ ${ctx.belowGoal} (${Math.round(currentPct)}% da meta) — ${ctx.action}`
}

export async function sendDailyDigest(): Promise<{ sent: number; skipped: boolean }> {
  const instanceId   = process.env.ZAPI_INSTANCE_ID
  const token        = process.env.ZAPI_TOKEN
  const hasRecipient = process.env.WHATSAPP_GROUP_ID || process.env.WHATSAPP_NOTIFY_NUMBERS
  if (!instanceId || !token || !hasRecipient) {
    const missing = [
      !instanceId   && 'ZAPI_INSTANCE_ID',
      !token        && 'ZAPI_TOKEN',
      !hasRecipient && 'WHATSAPP_GROUP_ID (or WHATSAPP_NOTIFY_NUMBERS)',
    ].filter(Boolean).join(', ')
    console.warn(`[daily-digest] Skipped — missing env vars: ${missing}`)
    return { sent: 0, skipped: true }
  }

  const now       = new Date()
  const { start: weekStart }  = getWeekRange()
  const { start: monthStart } = getMonthRange()
  const fetchFrom  = monthStart < weekStart ? monthStart : weekStart
  const yesterday  = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  const sixWeeksAgo = new Date(now.getTime() - 42 * 86_400_000)

  // ── Fetch clients ────────────────────────────────────────────────────────────
  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      healthScores: {
        where:   { periodStart: { gte: fetchFrom } },
        orderBy: { calculatedAt: 'desc' },
        select: {
          status: true, period: true, periodStart: true,
          metric: true, achievementPct: true, actualValue: true, targetValue: true,
        },
      },
      assignments: {
        where: { isPrimary: true },
        select: { user: { select: { id: true, name: true } } },
        take: 1,
      },
      statusStreak: { select: { status: true, days: true } },
    },
    orderBy: { name: 'asc' },
  })

  // ── Historical HealthScores for context (last 6 weeks, WEEKLY, all clients) ──
  const historicalRaw = await prisma.healthScore.findMany({
    where: {
      period:      'WEEKLY',
      periodStart: { gte: sixWeeksAgo, lt: weekStart },
    },
    select: { clientId: true, metric: true, achievementPct: true },
  })

  // Build map: clientId → metric → achievementPct[]
  const histMap = new Map<string, Map<string, number[]>>()
  for (const h of historicalRaw) {
    if (!histMap.has(h.clientId)) histMap.set(h.clientId, new Map())
    const m = histMap.get(h.clientId)!
    if (!m.has(h.metric)) m.set(h.metric, [])
    m.get(h.metric)!.push(toNum(h.achievementPct))
  }

  function getHistAvg(clientId: string, metric: string): number | null {
    const vals = histMap.get(clientId)?.get(metric)
    if (!vals || vals.length < 2) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }

  // ── Critical alerts (last 24h) ───────────────────────────────────────────────
  const criticalAlerts = await prisma.alert.findMany({
    where: {
      type:      { in: ['STATUS_DROPPED_TO_RUIM', 'BUDGET_EXHAUSTED', 'SYNC_FAILED'] },
      read:      false,
      createdAt: { gte: yesterday },
    },
    select: { title: true },
    take: 10,
  })

  // ── Build client rows ────────────────────────────────────────────────────────
  let otimo = 0, regular = 0, ruim = 0, semDados = 0

  type ClientRow = {
    id: string
    name: string
    status: string | null
    managerName: string
    managerId: string
    streakDays: number
    worstScore: HealthScoreRow | null
    activeScores: HealthScoreRow[]
  }

  const rows: ClientRow[] = clients.map((c) => {
    const weeklyScores  = c.healthScores.filter((s) => s.period === 'WEEKLY'  && s.periodStart >= weekStart)
    const monthlyScores = c.healthScores.filter((s) => s.period === 'MONTHLY' && s.periodStart >= monthStart)
    const scores = weeklyScores.length > 0 ? weeklyScores : monthlyScores

    const status: string | null =
      scores.length === 0  ? null :
      scores.some((s) => s.status === 'RUIM')    ? 'RUIM'    :
      scores.some((s) => s.status === 'REGULAR') ? 'REGULAR' : 'OTIMO'

    if (status === 'OTIMO')        otimo++
    else if (status === 'REGULAR') regular++
    else if (status === 'RUIM')    ruim++
    else                           semDados++

    const assignment = c.assignments[0]?.user
    return {
      id:           c.id,
      name:         c.name,
      status,
      managerName:  assignment?.name ?? 'Sem Gestor',
      managerId:    assignment?.id   ?? '__none__',
      streakDays:   c.statusStreak?.days ?? 1,
      worstScore:   worstRuimScore(scores as HealthScoreRow[]),
      activeScores: scores as HealthScoreRow[],
    }
  })

  // ── Group by manager ─────────────────────────────────────────────────────────
  const managerOrder: string[] = []
  const byManager = new Map<string, { name: string; clients: ClientRow[] }>()

  for (const row of rows) {
    if (!byManager.has(row.managerId)) {
      managerOrder.push(row.managerId)
      byManager.set(row.managerId, { name: row.managerName, clients: [] })
    }
    byManager.get(row.managerId)!.clients.push(row)
  }

  // Sort each manager's clients: RUIM → REGULAR → OTIMO (worst streak first within status)
  for (const entry of byManager.values()) {
    entry.clients.sort((a, b) => {
      const d = statusOrder(a.status) - statusOrder(b.status)
      return d !== 0 ? d : b.streakDays - a.streakDays
    })
  }

  // Sort managers: most RUIM clients first, then total RUIM streak weight
  managerOrder.sort((a, b) => {
    const aC = byManager.get(a)!.clients
    const bC = byManager.get(b)!.clients
    const aR = aC.filter((c) => c.status === 'RUIM').length
    const bR = bC.filter((c) => c.status === 'RUIM').length
    if (aR !== bR) return bR - aR
    const aD = aC.filter((c) => c.status === 'RUIM').reduce((s, c) => s + c.streakDays, 0)
    const bD = bC.filter((c) => c.status === 'RUIM').reduce((s, c) => s + c.streakDays, 0)
    return bD - aD
  })

  // ── Send messages ────────────────────────────────────────────────────────────
  let totalSent = 0

  // Message 1: Summary header
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
  const summaryLines = [
    `*📊 Performli — Resumo Diário*`,
    `_${dateStr}_`,
    ``,
    `*Saúde Geral da Agência*`,
    `✅ Ótimo: *${otimo}*  ⚠️ Regular: *${regular}*  🔴 Ruim: *${ruim}*  ⚪ Sem dados: *${semDados}*`,
    `Total: *${clients.length}* clientes ativos`,
    ``,
    `_A seguir, detalhes por gestor — do mais crítico ao melhor._`,
  ]
  totalSent += await broadcastWhatsApp(summaryLines.join('\n'), true)
  await sleep(1500)

  // Messages 2..N: one per manager block
  for (const managerId of managerOrder) {
    const { name, clients: mClients } = byManager.get(managerId)!
    const mRuim    = mClients.filter((c) => c.status === 'RUIM').length
    const mRegular = mClients.filter((c) => c.status === 'REGULAR').length
    const mOtimo   = mClients.filter((c) => c.status === 'OTIMO').length

    const lines: string[] = []
    lines.push(`*👤 ${name}* — ${mClients.length} cliente${mClients.length !== 1 ? 's' : ''}  (✅${mOtimo} ⚠️${mRegular} 🔴${mRuim})`)
    lines.push('')

    for (const c of mClients) {
      // Client status line
      let line = `${emoji(c.status)} *${c.name}*`
      if (c.status === 'RUIM' || c.status === 'REGULAR') {
        line += ` — _${streakLabel(c.status, c.streakDays)}_`
      } else if (c.status === 'OTIMO' && c.streakDays >= 5) {
        line += ` — _${streakLabel(c.status, c.streakDays)}_`
      }
      lines.push(line)

      // Insight for RUIM clients (always, not just ≥3 days, to help from day 1)
      if (c.status === 'RUIM' && c.worstScore) {
        const histAvg = getHistAvg(c.id, c.worstScore.metric)
        const insight = buildInsightLine(c.worstScore, histAvg)
        if (insight) lines.push(insight)
      }
    }

    totalSent += await broadcastWhatsApp(lines.join('\n'), false)
    await sleep(1500)
  }

  // Last message: attention section + alerts (only if relevant)
  const atencao = rows
    .filter((c) => (c.status === 'RUIM' && c.streakDays >= 5) || (c.status === 'REGULAR' && c.streakDays >= 7))
    .sort((a, b) => {
      const d = statusOrder(a.status) - statusOrder(b.status)
      return d !== 0 ? d : b.streakDays - a.streakDays
    })

  const hasExtra = atencao.length > 0 || criticalAlerts.length > 0

  if (hasExtra) {
    const extraLines: string[] = []

    if (atencao.length > 0) {
      extraLines.push(`*⚠️ Atenção — Contas travadas há mais de 5 dias*`)
      for (const c of atencao) {
        extraLines.push(`${emoji(c.status)} *${c.name}* — *${streakLabel(c.status, c.streakDays)}* — gestor ${c.managerName}`)
        if (c.status === 'RUIM' && c.worstScore) {
          const histAvg = getHistAvg(c.id, c.worstScore.metric)
          const insight = buildInsightLine(c.worstScore, histAvg)
          if (insight) extraLines.push(insight)
        }
      }
    }

    if (criticalAlerts.length > 0) {
      if (extraLines.length > 0) extraLines.push('')
      extraLines.push(`*🚨 Alertas Críticos (últimas 24h)*`)
      for (const a of criticalAlerts) {
        extraLines.push(`• ${a.title}`)
      }
    }

    extraLines.push('')
    extraLines.push(`_Acesse o painel para mais detalhes._`)
    totalSent += await broadcastWhatsApp(extraLines.join('\n'), false)
  }

  return { sent: totalSent, skipped: false }
}
