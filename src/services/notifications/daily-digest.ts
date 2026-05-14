/**
 * Daily Digest WhatsApp
 *
 * Resumo diário da agência enviado às 08:30 BRT/São Paulo.
 * Formato: visão geral + breakdown por gestor + seção de atenção (streak longo).
 */

import { prisma } from '@/lib/prisma'
import { broadcastWhatsApp } from '@/lib/whatsapp'
import { getMonthRange, getWeekRange } from '@/lib/utils'

function emoji(status: string | null) {
  if (status === 'OTIMO')   return '✅'
  if (status === 'REGULAR') return '⚠️'
  if (status === 'RUIM')    return '🔴'
  return '⚪'
}

// Rule-based insight for worst RUIM metric on a client
const METRIC_INSIGHT: Record<string, { reason: string; action: string }> = {
  ROAS:          { reason: 'ROAS abaixo da meta',           action: 'revisar campanhas de menor retorno' },
  FATURAMENTO:   { reason: 'faturamento abaixo da meta',    action: 'analisar produtos e promoções ativas' },
  TICKET_MEDIO:  { reason: 'ticket médio caiu',             action: 'investigar mix de produtos vendidos' },
  TAXA_CONVERSAO:{ reason: 'taxa de conversão baixa',       action: 'revisar landing pages e anúncios' },
  CONVERSIONS:   { reason: 'conversões abaixo da meta',     action: 'verificar funil de vendas' },
  LEADS:         { reason: 'geração de leads baixa',        action: 'revisar criativos e formulários de captação' },
  MENSAGENS:     { reason: 'volume de mensagens baixo',     action: 'revisar segmentação e criativos' },
  SEGUIDORES:    { reason: 'crescimento de seguidores lento', action: 'revisar estratégia de conteúdo' },
  CPL:           { reason: 'CPL acima da meta',             action: 'otimizar anúncios de captação' },
  CPA:           { reason: 'CPA acima da meta',             action: 'revisar campanhas de conversão' },
  CAC:           { reason: 'CAC acima da meta',             action: 'rever estratégia de aquisição' },
  CTR:           { reason: 'CTR baixo',                     action: 'testar novos criativos' },
  INVESTMENT:    { reason: 'investimento acima do orçamento', action: 'ajustar limite de gastos' },
  SPEND:         { reason: 'budget acima do limite',        action: 'ajustar limite de gastos' },
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

function worstRuimMetric(scores: HealthScoreRow[]): string | null {
  const ruim = scores.filter((s) => s.status === 'RUIM')
  if (ruim.length === 0) return null
  ruim.sort((a, b) => {
    const pa = typeof a.achievementPct === 'number' ? a.achievementPct : a.achievementPct.toNumber()
    const pb = typeof b.achievementPct === 'number' ? b.achievementPct : b.achievementPct.toNumber()
    return pa - pb
  })
  return ruim[0].metric
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
  return `${ordinal}`
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
  const fetchFrom = monthStart < weekStart ? monthStart : weekStart
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)

  // Fetch all active clients with ALL health scores for the period + primary manager + streak
  // IMPORTANT: fetch ALL scores (no take: 1) — status is derived using worst-case logic
  // to match the dashboard. A single take:1 (most recent) would return OTIMO even if
  // another metric for the same client is RUIM.
  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      healthScores: {
        where:   { periodStart: { gte: fetchFrom } },
        orderBy: { calculatedAt: 'desc' },
        select: {
          status: true,
          period: true,
          periodStart: true,
          metric: true,
          achievementPct: true,
          actualValue: true,
          targetValue: true,
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

  // Critical alerts from last 24h (unread)
  const criticalAlerts = await prisma.alert.findMany({
    where: {
      type:      { in: ['STATUS_DROPPED_TO_RUIM', 'BUDGET_EXHAUSTED', 'SYNC_FAILED'] },
      read:      false,
      createdAt: { gte: yesterday },
    },
    select: { title: true },
    take: 10,
  })

  // ── Aggregate totals ───────────────────────────────────────────────────────
  let otimo = 0, regular = 0, ruim = 0, semDados = 0

  type ClientRow = {
    name: string
    status: string | null
    managerName: string
    managerId: string
    streakDays: number
    worstMetric: string | null
    activeScores: HealthScoreRow[]
  }

  const rows: ClientRow[] = clients.map((c) => {
    // Mirror dashboard logic: prefer current-week WEEKLY scores, fall back to MONTHLY.
    // Then derive overall status as worst-case (RUIM beats REGULAR beats OTIMO).
    const weeklyScores  = c.healthScores.filter((s) => s.period === 'WEEKLY'  && s.periodStart >= weekStart)
    const monthlyScores = c.healthScores.filter((s) => s.period === 'MONTHLY' && s.periodStart >= monthStart)
    const scores = weeklyScores.length > 0 ? weeklyScores : monthlyScores

    const status: string | null =
      scores.length === 0
        ? null
        : scores.some((s) => s.status === 'RUIM')
        ? 'RUIM'
        : scores.some((s) => s.status === 'REGULAR')
        ? 'REGULAR'
        : 'OTIMO'

    const assignment = c.assignments[0]?.user
    if (status === 'OTIMO')        otimo++
    else if (status === 'REGULAR') regular++
    else if (status === 'RUIM')    ruim++
    else                           semDados++
    return {
      name:         c.name,
      status,
      managerName:  assignment?.name ?? 'Sem Gestor',
      managerId:    assignment?.id   ?? '__none__',
      streakDays:   c.statusStreak?.days ?? 1,
      worstMetric:  worstRuimMetric(scores as HealthScoreRow[]),
      activeScores: scores as HealthScoreRow[],
    }
  })

  // ── Group by manager ───────────────────────────────────────────────────────
  const managerOrder: string[] = []
  const byManager = new Map<string, { name: string; clients: ClientRow[] }>()

  for (const row of rows) {
    if (!byManager.has(row.managerId)) {
      managerOrder.push(row.managerId)
      byManager.set(row.managerId, { name: row.managerName, clients: [] })
    }
    byManager.get(row.managerId)!.clients.push(row)
  }

  // Sort each manager's clients: RUIM → REGULAR → OTIMO → sem dados
  // Within same status, longer streaks first (most urgent on top)
  for (const entry of byManager.values()) {
    entry.clients.sort((a, b) => {
      const statusDiff = statusOrder(a.status) - statusOrder(b.status)
      if (statusDiff !== 0) return statusDiff
      return b.streakDays - a.streakDays
    })
  }

  // Sort manager order: most critical clients first, then by total streak weight
  managerOrder.sort((a, b) => {
    const aClients = byManager.get(a)!.clients
    const bClients = byManager.get(b)!.clients
    const aRuim = aClients.filter((c) => c.status === 'RUIM').length
    const bRuim = bClients.filter((c) => c.status === 'RUIM').length
    if (aRuim !== bRuim) return bRuim - aRuim
    const aRuimDays = aClients.filter((c) => c.status === 'RUIM').reduce((s, c) => s + c.streakDays, 0)
    const bRuimDays = bClients.filter((c) => c.status === 'RUIM').reduce((s, c) => s + c.streakDays, 0)
    return bRuimDays - aRuimDays
  })

  // ── Clients requiring attention (long streaks below target) ───────────────
  // RUIM ≥ 3 days OR REGULAR ≥ 7 days
  const atencao = rows
    .filter((c) =>
      (c.status === 'RUIM' && c.streakDays >= 3) ||
      (c.status === 'REGULAR' && c.streakDays >= 7)
    )
    .sort((a, b) => {
      // Critical (RUIM) before regular; within same status, longer streak first
      const statusDiff = statusOrder(a.status) - statusOrder(b.status)
      if (statusDiff !== 0) return statusDiff
      return b.streakDays - a.streakDays
    })

  // ── Managers with multiple stuck clients (gestores travados) ──────────────
  const gestoresTravados = managerOrder
    .map((id) => {
      const { name, clients: mClients } = byManager.get(id)!
      const ruimLongos    = mClients.filter((c) => c.status === 'RUIM'    && c.streakDays >= 3).length
      const regularLongos = mClients.filter((c) => c.status === 'REGULAR' && c.streakDays >= 7).length
      return { name, ruimLongos, regularLongos, total: ruimLongos + regularLongos }
    })
    .filter((g) => g.total >= 2)
    .sort((a, b) => b.ruimLongos - a.ruimLongos || b.total - a.total)

  // ── Build message ──────────────────────────────────────────────────────────
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
  const lines: string[] = []

  lines.push(`*📊 Performli — Resumo Diário*`)
  lines.push(`_${dateStr}_`)
  lines.push('')
  lines.push(`*Saúde Geral da Agência*`)
  lines.push(`✅ Ótimo: *${otimo}*  ⚠️ Regular: *${regular}*  🔴 Ruim: *${ruim}*  ⚪ Sem dados: *${semDados}*`)
  lines.push(`Total: *${clients.length}* clientes ativos`)

  // ── Breakdown por gestor ───────────────────────────────────────────────────
  lines.push('')
  lines.push('─────────────────────')

  for (const managerId of managerOrder) {
    const { name, clients: mClients } = byManager.get(managerId)!
    const mRuim    = mClients.filter((c) => c.status === 'RUIM').length
    const mRegular = mClients.filter((c) => c.status === 'REGULAR').length
    const mOtimo   = mClients.filter((c) => c.status === 'OTIMO').length

    lines.push('')
    lines.push(`*👤 ${name}* — ${mClients.length} cliente${mClients.length !== 1 ? 's' : ''}  (✅${mOtimo} ⚠️${mRegular} 🔴${mRuim})`)

    for (const c of mClients) {
      let line = `${emoji(c.status)} ${c.name}`
      if (c.status === 'RUIM' || c.status === 'REGULAR') {
        line += ` — _${streakLabel(c.status, c.streakDays)}_`
      } else if (c.status === 'OTIMO' && c.streakDays >= 5) {
        line += ` — _${streakLabel(c.status, c.streakDays)}_`
      }
      lines.push(line)
      // Show insight for RUIM clients with streak ≥ 3 days
      if (c.status === 'RUIM' && c.streakDays >= 3 && c.worstMetric) {
        const insight = METRIC_INSIGHT[c.worstMetric]
        if (insight) {
          lines.push(`   ↳ _Motivo principal: ${insight.reason}_ — ${insight.action}`)
        }
      }
    }
  }

  // ── Seção de atenção: risco de churn ──────────────────────────────────────
  if (atencao.length > 0) {
    lines.push('')
    lines.push('─────────────────────')
    lines.push(`*⚠️ Em Atenção — Risco de Churn*`)
    for (const c of atencao) {
      lines.push(`${emoji(c.status)} ${c.name} — *${streakLabel(c.status, c.streakDays)}* — gestor ${c.managerName}`)
      if (c.status === 'RUIM' && c.worstMetric) {
        const insight = METRIC_INSIGHT[c.worstMetric]
        if (insight) {
          lines.push(`   ↳ _${insight.reason}_ — ${insight.action}`)
        }
      }
    }
  }

  // ── Gestores travados ──────────────────────────────────────────────────────
  if (gestoresTravados.length > 0) {
    lines.push('')
    lines.push(`*🔒 Gestores com contas travadas*`)
    for (const g of gestoresTravados) {
      const detalhes: string[] = []
      if (g.ruimLongos > 0)    detalhes.push(`🔴${g.ruimLongos} crítico${g.ruimLongos > 1 ? 's' : ''} ≥3d`)
      if (g.regularLongos > 0) detalhes.push(`⚠️${g.regularLongos} regular${g.regularLongos > 1 ? 's' : ''} ≥7d`)
      lines.push(`👤 ${g.name} — ${detalhes.join('  ')}`)
    }
  }

  // ── Alertas críticos ───────────────────────────────────────────────────────
  if (criticalAlerts.length > 0) {
    lines.push('')
    lines.push('─────────────────────')
    lines.push(`*🚨 Alertas Críticos (últimas 24h)*`)
    for (const a of criticalAlerts) {
      lines.push(`• ${a.title}`)
    }
  }

  lines.push('')
  lines.push(`_Acesse o painel para mais detalhes._`)

  const message = lines.join('\n')
  const sent = await broadcastWhatsApp(message, true)
  return { sent, skipped: false }
}
