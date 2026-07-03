/**
 * Churn Radars (FATIA A — onda anti-churn silencioso, Bloco 8 #9/#10/#11/#14)
 *
 * Roda no cron diário. Quatro radares que cobrem sinais de churn que hoje passam
 * batidos porque estão espalhados em tabelas diferentes e ninguém cruza. Cada
 * radar isola falha POR cliente (try/catch), deduplica de forma determinística
 * por tag no body dentro da janela de 7 dias (padrão retention-watchdog) e não
 * cria nenhum AlertType novo — reusa os já registrados na governança.
 *
 *   (#9)  Suporte acumulado — cliente ACTIVE com >= 3 tasks de suporte atrasadas
 *         (isSupport=true, vencidas e não concluídas). Insatisfação somando.
 *   (#10) Investimento caindo — soma de spend das últimas 4 semanas vs as 4
 *         anteriores (janelas não sobrepostas, ancoradas em hoje SP). Queda
 *         >= 25% com base >= 8 semanas de dados → o cliente está reduzindo a
 *         aposta antes de sair.
 *   (#11) Silêncio desacoplado — cliente ACTIVE sem NENHUMA ClientInteraction há
 *         21 dias, independente do score. Complementa o antichurn-monitor (que
 *         só cobre score >= 60); para não duplicar, pula clientes com
 *         churnRiskScore >= 60 na leitura mais recente.
 *   (#14) Inadimplência → churn — fatura Asaas OVERDUE vencida há >= 15 dias
 *         marca Client.possivelChurn=true (mesmo marker do lifecycle, que o
 *         retention-watchdog observa) e alerta para tratar como risco de churn,
 *         não só cobrança.
 *
 * Regras: try/catch POR item; dedupe por tag; AutomationLog ao final; sem
 * chamadas externas (só Postgres); linguagem operacional.
 */

import { prisma } from '@/lib/prisma'
import { saoPauloDateString, startOfTodaySaoPaulo } from '@/lib/utils'
import { statusIdFor } from '@/lib/tasks/statusMap'
import { parseDateInput } from '@/lib/tasks/dateInput'
import { resolveClientOwner } from './owner-resolver'
import type { TaskPriority, SupportCategory } from '@prisma/client'

const DAY_MS = 86_400_000

// Limiares dos radares.
const SUPORTE_MIN_ATRASADAS = 3
const SPEND_QUEDA_PCT = 25
const SPEND_MIN_SEMANAS = 8
const SILENCIO_DIAS = 21
const SILENCIO_SCORE_ALTO = 60 // já coberto pelo antichurn-monitor
const INADIMPLENCIA_DIAS = 15
const MOMENTO_OURO_DIAS = 28 // 4 semanas seguidas em ÓTIMO = conta madura para expandir

// Marcadores de dedupe no body — 1 alerta por cliente por semana por MOTIVO.
const TAG_SUPORTE = '[radar:suporte-acumulado]'
const TAG_SPEND = '[radar:spend-caindo]'
const TAG_SILENCIO = '[radar:silencio-21d]'
const TAG_INADIMPLENCIA = '[radar:inadimplencia-churn]'

type AlertTypeRadar = 'ANTICHURN_ACTION_NEEDED' | 'BUDGET_WARNING'

/** Cria 1 Alert por cliente/semana/motivo (dedupe determinístico por tag). */
async function alertOncePerWeekByTag(
  clientId: string,
  type: AlertTypeRadar,
  title: string,
  body: string,
  tag: string,
  windowStart: Date,
): Promise<boolean> {
  const existing = await prisma.alert.findFirst({
    where: {
      clientId,
      type,
      createdAt: { gte: windowStart },
      body: { contains: tag },
    },
    select: { id: true },
  })
  if (existing) return false
  await prisma.alert.create({
    data: { clientId, type, title, body: `${body} ${tag}` },
  })
  return true
}

// ── Helpers do radar #12 (momento de ouro) ──────────────────────────────────
// Criação de TASK com dedupe determinístico por idempotencyKey — mesmo padrão
// de client-lifecycle-automations.createAutoTask (espelho statusId D-004, origin
// AUTOMACAO, TaskActivity 'created', AutomationLog). Replicado localmente para
// NÃO exportar helpers do arquivo de lifecycle já aprovado (menor risco); a
// direção de dependência segura é churn-radars → lifecycle nunca acontece aqui.

type ClientOwners = { gestorId: string | null; assignments: { userId: string }[] }

/** CS do cliente com fallback para o dono canônico (owner-resolver). */
async function resolveCs(csId: string | null, c: ClientOwners): Promise<string | null> {
  if (csId) return csId
  return (await resolveClientOwner({ gestorId: c.gestorId, assignments: c.assignments })).assigneeId
}

/** Data-parede SP de hoje + n dias corridos, como Date de prazo (meio-dia UTC). */
function spDatePlus(days: number, now: Date): Date {
  const anchor = new Date(`${saoPauloDateString(now)}T12:00:00Z`)
  const target = new Date(anchor.getTime() + days * DAY_MS)
  return parseDateInput(target.toISOString().slice(0, 10))
}

async function createAutoTaskDeduped(opts: {
  rule: string
  clientId: string
  assignedTo: string
  title: string
  description: string
  priority: TaskPriority
  dueDate: Date
  periodKey: string
  supportCategory: SupportCategory
  popId: string
}): Promise<boolean> {
  const idempotencyKey = `auto:${opts.rule}:${opts.clientId}:${opts.periodKey}`
  const exists = await prisma.task.findUnique({ where: { idempotencyKey }, select: { id: true } })
  if (exists) {
    await prisma.automationLog
      .create({
        data: {
          clientId: opts.clientId,
          status: 'DUPLICIDADE_EVITADA',
          reason: `${opts.rule} — task já criada neste período (${opts.periodKey})`,
        },
      })
      .catch(() => {})
    return false
  }
  const now = new Date()
  const task = await prisma.task.create({
    data: {
      title: opts.title,
      description: opts.description,
      type: 'DEMANDA_INTERNA',
      priority: opts.priority,
      status: 'A_FAZER',
      statusId: statusIdFor('A_FAZER'),
      origin: 'AUTOMACAO',
      clientId: opts.clientId,
      assignedTo: opts.assignedTo,
      areaId: 'area_trafego',
      popId: opts.popId,
      requestedAt: now,
      dueDate: opts.dueDate,
      idempotencyKey,
      isSupport: true,
      supportDirection: 'NOS_PARA_CLIENTE',
      supportCategory: opts.supportCategory,
      activities: { create: { actorId: null, action: 'created' } },
    },
    select: { id: true },
  })
  await prisma.automationLog.create({
    data: {
      clientId: opts.clientId,
      createdTaskId: task.id,
      assigneeId: opts.assignedTo,
      status: 'SUCESSO',
      reason: `${opts.rule} — task criada (${opts.periodKey})`,
    },
  })
  return true
}

export async function runChurnRadars(): Promise<{
  suporteChecked: number
  suporteAlerts: number
  spendChecked: number
  spendAlerts: number
  silencioChecked: number
  silencioAlerts: number
  inadimplenciaChecked: number
  inadimplenciaAlerts: number
  possivelChurnMarcado: number
  momentoOuroChecked: number
  momentoOuroTasks: number
  failed: number
}> {
  const now = Date.now()
  const nowDate = new Date(now)
  const windowStart = new Date(now - 7 * DAY_MS)
  const todaySP = startOfTodaySaoPaulo(nowDate)

  let suporteAlerts = 0
  let spendAlerts = 0
  let silencioAlerts = 0
  let inadimplenciaAlerts = 0
  let possivelChurnMarcado = 0
  let momentoOuroTasks = 0
  let failed = 0

  // ── (#9) Suporte acumulado ──────────────────────────────────────────────────
  // Atraso pelo mesmo critério do retention-watchdog: dueDate < HOJE (SP) e
  // status ainda aberto (não CONCLUIDO/CANCELADO). Cobre também o que ainda não
  // foi transicionado para ATRASADO pelo markOverdueTasks (EM_ANDAMENTO etc).
  const suporteTasks = await prisma.task.findMany({
    where: {
      isSupport: true,
      clientId: { not: null },
      status: { notIn: ['CONCLUIDO', 'CANCELADO'] },
      dueDate: { lt: todaySP },
    },
    select: { clientId: true },
  })
  // Contagem de atrasadas por cliente (groupBy tem quirk de inferência TS).
  const suportePorCliente = new Map<string, number>()
  for (const t of suporteTasks) {
    if (!t.clientId) continue
    suportePorCliente.set(t.clientId, (suportePorCliente.get(t.clientId) ?? 0) + 1)
  }
  const suporteCandidatos = [...suportePorCliente.entries()].filter(
    ([, n]) => n >= SUPORTE_MIN_ATRASADAS,
  )
  let suporteChecked = 0
  for (const [clientId, n] of suporteCandidatos) {
    suporteChecked++
    try {
      const client = await prisma.client.findFirst({
        where: { id: clientId, status: 'ACTIVE' },
        select: { id: true, name: true },
      })
      if (!client) continue // só clientes ativos entram no radar
      const created = await alertOncePerWeekByTag(
        client.id,
        'ANTICHURN_ACTION_NEEDED',
        `Cliente com ${n} demandas de suporte atrasadas: ${client.name}`,
        `${client.name} acumula ${n} demandas de suporte atrasadas — insatisfação acumulando. Priorizar a fila de suporte deste cliente hoje antes que a frustração vire pedido de cancelamento.`,
        TAG_SUPORTE,
        windowStart,
      )
      if (created) suporteAlerts++
    } catch (err) {
      failed++
      console.error(`[churn-radars] falha no suporte do cliente ${clientId}:`, err)
    }
  }

  // ── (#10) Investimento caindo ───────────────────────────────────────────────
  // Janelas não sobrepostas ancoradas em hoje SP: recente [-28d, hoje),
  // anterior [-56d, -28d). Base mínima: 8 semanas (56 dias) de dados.
  const recentStart = new Date(todaySP.getTime() - 28 * DAY_MS)
  const priorStart = new Date(todaySP.getTime() - 56 * DAY_MS)

  const spendClients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true },
  })
  let spendChecked = 0
  for (const c of spendClients) {
    try {
      // Base mínima: existe snapshot em ou antes do início da janela anterior?
      const earliest = await prisma.metricSnapshot.findFirst({
        where: { clientId: c.id },
        orderBy: { date: 'asc' },
        select: { date: true },
      })
      if (!earliest || new Date(earliest.date).getTime() > priorStart.getTime()) continue // < 8 semanas de dados
      spendChecked++

      const [recentAgg, priorAgg] = await Promise.all([
        prisma.metricSnapshot.aggregate({
          where: { clientId: c.id, date: { gte: recentStart, lt: todaySP } },
          _sum: { spend: true },
        }),
        prisma.metricSnapshot.aggregate({
          where: { clientId: c.id, date: { gte: priorStart, lt: recentStart } },
          _sum: { spend: true },
        }),
      ])

      const recentSpend = Number(recentAgg._sum.spend ?? 0)
      const priorSpend = Number(priorAgg._sum.spend ?? 0)
      if (priorSpend <= 0) continue // sem base de comparação

      const quedaPct = ((priorSpend - recentSpend) / priorSpend) * 100
      if (quedaPct < SPEND_QUEDA_PCT) continue

      const pct = Math.round(quedaPct)
      const created = await alertOncePerWeekByTag(
        c.id,
        'BUDGET_WARNING',
        `Investimento caiu ${pct}% vs mês anterior: ${c.name}`,
        `O investimento de ${c.name} caiu ${pct}% nas últimas 4 semanas contra as 4 anteriores. Confirmar com o gestor se foi decisão combinada (ajuste de verba/sazonalidade) ou se o cliente está reduzindo a aposta — nesse caso, tratar antes que a redução vire saída.`,
        TAG_SPEND,
        windowStart,
      )
      if (created) spendAlerts++
    } catch (err) {
      failed++
      console.error(`[churn-radars] falha no spend do cliente ${c.id}:`, err)
    }
  }

  // ── (#11) Silêncio desacoplado ──────────────────────────────────────────────
  // Sem NENHUMA interação há 21 dias, independente do score. Pula quem já é
  // coberto pelo antichurn-monitor (score >= 60 na leitura mais recente).
  // Proteção de onboarding: todo cliente nasce ACTIVE (não há status ONBOARDING),
  // então sem este filtro um cliente criado ONTEM sem interação dispararia
  // "nunca teve contato" no dia 1 — spam garantido. Só entra no radar quem já
  // existe há pelo menos SILENCIO_DIAS.
  const silencioCutoff = new Date(now - SILENCIO_DIAS * DAY_MS)
  const silencioClients = await prisma.client.findMany({
    where: { status: 'ACTIVE', createdAt: { lte: silencioCutoff } },
    select: {
      id: true,
      name: true,
      churnRiskScores: { orderBy: { weekStart: 'desc' }, take: 1, select: { score: true } },
      interactions: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
    },
  })
  let silencioChecked = 0
  for (const c of silencioClients) {
    try {
      const score = c.churnRiskScores[0]?.score ?? 0
      if (score >= SILENCIO_SCORE_ALTO) continue // já coberto pelo antichurn-monitor

      const last = c.interactions[0]?.createdAt
      const daysSince = last ? Math.floor((now - new Date(last).getTime()) / DAY_MS) : null
      const isSilent = daysSince == null || daysSince >= SILENCIO_DIAS
      if (!isSilent) continue
      silencioChecked++

      const label = daysSince == null ? 'nunca teve contato registrado' : `sem nenhum contato registrado há ${daysSince} dias`
      const created = await alertOncePerWeekByTag(
        c.id,
        'ANTICHURN_ACTION_NEEDED',
        `Cliente sem contato registrado: ${c.name}`,
        `${c.name} está ${label}. Um cliente que ninguém toca esquece por que paga — registrar um contato de relacionamento esta semana.`,
        TAG_SILENCIO,
        windowStart,
      )
      if (created) silencioAlerts++
    } catch (err) {
      failed++
      console.error(`[churn-radars] falha no silêncio do cliente ${c.id}:`, err)
    }
  }

  // ── (#14) Inadimplência → churn ─────────────────────────────────────────────
  // Fatura OVERDUE vencida há >= 15 dias: marca possivelChurn (marker do
  // lifecycle) e alerta como risco de churn, não só cobrança.
  const cutoff = new Date(todaySP.getTime() - INADIMPLENCIA_DIAS * DAY_MS)
  const overdue = await prisma.asaasPayment.findMany({
    where: { status: 'OVERDUE', dueDate: { lte: cutoff } },
    select: {
      id: true,
      dueDate: true,
      customer: {
        select: { client: { select: { id: true, name: true, status: true, possivelChurn: true } } },
      },
    },
  })
  // Dedupe por cliente (o mesmo cliente pode ter várias faturas vencidas).
  const inadimplenciaVistos = new Set<string>()
  let inadimplenciaChecked = 0
  for (const p of overdue) {
    const client = p.customer?.client
    if (!client || client.status !== 'ACTIVE') continue
    if (inadimplenciaVistos.has(client.id)) continue
    inadimplenciaVistos.add(client.id)
    inadimplenciaChecked++
    try {
      const dias = Math.floor((todaySP.getTime() - new Date(p.dueDate).getTime()) / DAY_MS)

      // Marca possivelChurn se ainda não estiver marcado (não desmarca aqui — a
      // saída é tratada pela A5/lifecycle). Registra o mesmo marker que o
      // retention-watchdog observa.
      if (!client.possivelChurn) {
        await prisma.client.update({
          where: { id: client.id },
          data: { possivelChurn: true },
        })
        await prisma.auditLog.create({
          data: {
            action: 'lifecycle.possivel_churn',
            entityType: 'Client',
            entityId: client.id,
            clientId: client.id,
            metadata: { origem: 'inadimplencia-15d', diasAtraso: dias },
          },
        })
        possivelChurnMarcado++
      }

      const created = await alertOncePerWeekByTag(
        client.id,
        'ANTICHURN_ACTION_NEEDED',
        `Fatura vencida há ${dias} dias — risco de churn: ${client.name}`,
        `A fatura de ${client.name} está vencida há ${dias} dias — tratar como risco de churn, não só cobrança. Um cliente que deixa de pagar já está de saída na cabeça; o CS precisa entrar junto com o financeiro.`,
        TAG_INADIMPLENCIA,
        windowStart,
      )
      if (created) inadimplenciaAlerts++
    } catch (err) {
      failed++
      console.error(`[churn-radars] falha na inadimplência do cliente ${client.id}:`, err)
    }
  }

  // ── (#12) Momento de ouro — cliente ÓTIMO esquecido ─────────────────────────
  // Conta ACTIVE com streak de status ÓTIMO há >= 28 dias (4 semanas): o cliente
  // está no auge da satisfação e ninguém aproveita para pedir depoimento/case
  // nem propor expansão. Cria 1 task ao CS por MÊS (dedupe por monthKey) — não
  // spammar; um lembrete mensal é a cadência certa para acionar o CS.
  const monthKey = saoPauloDateString(nowDate).slice(0, 7) // YYYY-MM (SP)
  const ouroStreaks = await prisma.clientStatusStreak.findMany({
    where: {
      status: 'OTIMO',
      days: { gte: MOMENTO_OURO_DIAS },
      client: { status: 'ACTIVE' },
    },
    select: {
      days: true,
      client: {
        select: {
          id: true,
          name: true,
          csId: true,
          gestorId: true,
          assignments: { where: { isPrimary: true }, take: 1, select: { userId: true } },
        },
      },
    },
  })
  let momentoOuroChecked = 0
  for (const s of ouroStreaks) {
    const client = s.client
    momentoOuroChecked++
    try {
      const csId = await resolveCs(client.csId, client)
      if (!csId) {
        await prisma.automationLog
          .create({
            data: {
              clientId: client.id,
              status: 'FALHA',
              reason: `momento-ouro — sem CS/dono resolvível para ${client.name}; task não criada`,
            },
          })
          .catch(() => {})
        continue
      }
      const created = await createAutoTaskDeduped({
        rule: 'momento-ouro',
        clientId: client.id,
        assignedTo: csId,
        title: `🟢 Momento de ouro — ${client.name}: pedir depoimento/case e propor expansão`,
        description:
          `${client.name} está em resultado ÓTIMO há ${s.days} dias seguidos — a conta está no auge e é a hora de capitalizar antes que a satisfação esfrie. Ações: (1) pedir um depoimento/avaliação ao cliente; (2) transformar o resultado em case da agência; (3) marcar uma reunião de expansão/upsell (mais verba, novos produtos, novos canais).`,
        priority: 'ALTA',
        dueDate: spDatePlus(5, nowDate),
        periodKey: monthKey,
        supportCategory: 'SUCESSO_DO_CLIENTE',
        popId: 'pop_csx_12',
      })
      if (created) momentoOuroTasks++
    } catch (err) {
      failed++
      console.error(`[churn-radars] falha no momento de ouro do cliente ${client.id}:`, err)
    }
  }

  await prisma.automationLog
    .create({
      data: {
        status: 'SUCESSO',
        reason:
          `churn-radars — suporte ${suporteAlerts} / spend ${spendAlerts} / ` +
          `silêncio ${silencioAlerts} / inadimplência ${inadimplenciaAlerts} ` +
          `(possívelChurn marcado ${possivelChurnMarcado}) / momento-ouro ${momentoOuroTasks} / falhas ${failed}`,
      },
    })
    .catch(() => {})

  return {
    suporteChecked,
    suporteAlerts,
    spendChecked,
    spendAlerts,
    silencioChecked,
    silencioAlerts,
    inadimplenciaChecked,
    inadimplenciaAlerts,
    possivelChurnMarcado,
    momentoOuroChecked,
    momentoOuroTasks,
    failed,
  }
}
