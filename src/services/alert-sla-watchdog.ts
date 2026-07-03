/**
 * Alert SLA Watchdog + Circuit Breaker (Fase 2 — governança de alertas)
 *
 * "Um alerta sem dono e SLA é um badge com push notification." Este serviço dá
 * DENTE ao SLA definido em `ALERT_GOVERNANCE`:
 *
 *  (A) SLA com dente — todo Alert não reconhecido (acknowledgedAt null) cujo
 *      createdAt + slaHours (da governança do tipo) já estourou gera UMA
 *      escalação para o escalationTarget. A escalação é um Alert do tipo
 *      TASK_AUTOMATION com tag `[sla:{alertId}]` no body (dedupe determinístico:
 *      1 escalação por alerta original, para sempre). NUNCA re-escala uma
 *      escalação: candidatos com body contendo '[sla:' ou '[breaker:' são
 *      filtrados fora (sem laço infinito de meta-alertas).
 *
 *  (B) Circuit breaker — por AlertType, conta quantos alerts nasceram em cada um
 *      dos últimos 3 dias completos. Se TODOS os 3 dias passarem do teto diário
 *      (maxPerDayPerOwner, usado aqui como teto GLOBAL do tipo), dispara 1
 *      meta-alerta ao ADMIN: "o alerta X está gritando demais — recalibrar".
 *      Dedupe SEMANAL por tag `[breaker:{tipo}]`. O breaker NÃO suprime alertas
 *      (sem perda de sinal) — só denuncia ruído.
 *
 * Regras: try/catch POR alerta/tipo (falha em um não derruba a rotina);
 * AutomationLog ao final; toda dedupe é por tag no body (determinística).
 */

import { prisma } from '@/lib/prisma'
import { AlertType } from '@prisma/client'
import { ALERT_GOVERNANCE, GOVERNANCE_ROLE_LABELS } from '@/lib/alerts/governance-config'

const DAY_MS = 86_400_000

// Tag de dedupe da escalação de SLA (1 por alerta original).
const slaTag = (alertId: string) => `[sla:${alertId}]`
// Tag de dedupe do meta-alerta do breaker (1 por tipo por semana).
const breakerTag = (type: AlertType) => `[breaker:${type}]`

/** 'YYYY-MM-DD' de um Date (UTC — suficiente para bucketização de contagem). */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function runAlertSlaWatchdog(): Promise<{
  slaChecked: number
  slaEscalated: number
  breakerTypesChecked: number
  breakerFired: number
  failed: number
}> {
  const now = Date.now()
  let slaChecked = 0
  let slaEscalated = 0
  let breakerFired = 0
  let failed = 0

  // ── (A) SLA com dente ───────────────────────────────────────────────────────
  for (const type of Object.keys(ALERT_GOVERNANCE) as AlertType[]) {
    const gov = ALERT_GOVERNANCE[type]
    const cutoff = new Date(now - gov.slaHours * 3_600_000)

    // Candidatos: não reconhecidos, com SLA estourado e que NÃO sejam eles
    // mesmos escalações/meta-alertas (nunca re-escalar — filtro por tag no body).
    const candidates = await prisma.alert.findMany({
      where: {
        type,
        acknowledgedAt: null,
        createdAt: { lt: cutoff },
        NOT: [{ body: { contains: '[sla:' } }, { body: { contains: '[breaker:' } }],
      },
      select: {
        id: true,
        clientId: true,
        title: true,
        createdAt: true,
        client: { select: { name: true } },
      },
    })

    for (const a of candidates) {
      slaChecked++
      try {
        // Dedupe determinístico: já existe escalação para este alerta?
        const already = await prisma.alert.findFirst({
          where: { type: 'TASK_AUTOMATION', body: { contains: slaTag(a.id) } },
          select: { id: true },
        })
        if (already) continue

        const horas = Math.max(gov.slaHours, Math.floor((now - new Date(a.createdAt).getTime()) / 3_600_000))
        const donoLabel = GOVERNANCE_ROLE_LABELS[gov.ownerRole]
        const alvoLabel = GOVERNANCE_ROLE_LABELS[gov.escalationTarget]

        await prisma.alert.create({
          data: {
            clientId: a.clientId,
            type: 'TASK_AUTOMATION',
            title: `SLA de alerta estourado: ${a.client?.name ?? 'cliente'} — ninguém reconheceu em ${gov.slaHours}h`,
            body:
              `O alerta "${a.title}" está aberto há ${horas}h sem ninguém reconhecer ` +
              `(dono: ${donoLabel}, SLA ${gov.slaHours}h). Assumir agora ou repassar. ` +
              `Escalado para ${alvoLabel}. ${slaTag(a.id)}`,
          },
        })
        slaEscalated++
      } catch (err) {
        failed++
        console.error(`[alert-sla-watchdog] falha ao escalar alerta ${a.id}:`, err)
      }
    }
  }

  // ── (B) Circuit breaker ─────────────────────────────────────────────────────
  // Janela: últimos 3 dias COMPLETOS (ontem, anteontem, retrasado). Hoje é
  // parcial e ficaria de fora para não gerar falso positivo/negativo.
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const windowStart = new Date(todayStart.getTime() - 3 * DAY_MS)
  const last3Keys = [1, 2, 3].map((n) => dayKey(new Date(todayStart.getTime() - n * DAY_MS)))
  const weekAgo = new Date(now - 7 * DAY_MS)

  for (const type of Object.keys(ALERT_GOVERNANCE) as AlertType[]) {
    // Meta-alertas/escalações não entram na contagem do breaker.
    if (type === 'TASK_AUTOMATION') continue
    const gov = ALERT_GOVERNANCE[type]
    try {
      const recent = await prisma.alert.findMany({
        where: { type, createdAt: { gte: windowStart, lt: todayStart } },
        select: { createdAt: true, clientId: true },
      })

      const perDay = new Map<string, number>()
      let anchorClientId: string | null = null
      for (const r of recent) {
        const k = dayKey(new Date(r.createdAt))
        perDay.set(k, (perDay.get(k) ?? 0) + 1)
        anchorClientId = r.clientId // determinístico: último cliente do tipo
      }

      // Estourou o teto nos 3 dias completos consecutivos?
      const gritando = last3Keys.every((k) => (perDay.get(k) ?? 0) > gov.maxPerDayPerOwner)
      if (!gritando || !anchorClientId) continue

      // Dedupe semanal do meta-alerta por tipo.
      const dup = await prisma.alert.findFirst({
        where: { type: 'TASK_AUTOMATION', createdAt: { gte: weekAgo }, body: { contains: breakerTag(type) } },
        select: { id: true },
      })
      if (dup) continue

      const totais = last3Keys.map((k) => perDay.get(k) ?? 0).join(', ')
      await prisma.alert.create({
        data: {
          clientId: anchorClientId,
          type: 'TASK_AUTOMATION',
          title: `O alerta ${type} está gritando demais — recalibrar limiar`,
          body:
            `O tipo de alerta ${type} passou do teto diário saudável ` +
            `(${gov.maxPerDayPerOwner}/dia) nos últimos 3 dias seguidos (${totais}). ` +
            `Quando tudo é alerta, nada é alerta: revisar o limiar que gera este tipo ` +
            `antes que o time pare de olhar. ${breakerTag(type)}`,
        },
      })
      breakerFired++
    } catch (err) {
      failed++
      console.error(`[alert-sla-watchdog] falha no breaker do tipo ${type}:`, err)
    }
  }

  await prisma.automationLog
    .create({
      data: {
        status: 'SUCESSO',
        reason: `alert-sla-watchdog — SLA escaladas ${slaEscalated} / breaker disparado ${breakerFired} / falhas ${failed}`,
      },
    })
    .catch(() => {})

  return {
    slaChecked,
    slaEscalated,
    breakerTypesChecked: Object.keys(ALERT_GOVERNANCE).length - 1,
    breakerFired,
    failed,
  }
}
