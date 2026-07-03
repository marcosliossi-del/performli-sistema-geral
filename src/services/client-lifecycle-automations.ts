/**
 * Automações de CICLO DE VIDA DO CLIENTE (CSX)
 *
 * Recria, dentro do Performli, as automações que o dono mantinha no ClickUp em
 * torno do Resultado semanal e da Ficha de CS (NPS / feedback negativo). Esta
 * implementação segue os PRINTS reais das automações do ClickUp (spec A1..A6);
 * ela substitui qualquer inferência anterior. São disparadas por DOIS eventos
 * de domínio, via hooks best-effort:
 *
 *   onResultadoChanged  — chamado pelo resultado-engine após gravar o resultado
 *                         da semana (segunda). Dispara A2, A5, A6 (A4 é do engine).
 *   onFichaCsUpdated    — chamado pela action da Ficha de CS após salvar (terça).
 *                         Dispara A1, A3.
 *
 * TODAS as regras com:
 *   - dedupe semanal via idempotencyKey `auto:{regra}:{clientId}:{weekKey}`
 *     (tasks) ou checagem de Alert existente na semana;
 *   - try/catch POR REGRA (uma regra que falha não derruba as outras nem o
 *     evento de origem);
 *   - AutomationLog por execução e AuditLog nas mutações sensíveis;
 *   - D-004: toda task nasce com o espelho statusId (statusIdFor).
 *
 * NÃO duplica o que warroom-escalation / warroom-monitor / critical-account-
 * detector já fazem, nem a task de plano de ação (Otimização) que o resultado-
 * engine já cria na queda para RUIM/PÉSSIMO — essa task É a "documentar plano de
 * ação" da spec A2(b); aqui só criamos as tasks complementares (a) e (c).
 *
 * DESCARTADO da inferência anterior: o gatilho combinado "resultado ruim + NPS
 * detrator → War Room". Os prints mostram que a entrada em War Room é pela QUEDA
 * do resultado sozinha (A2). NÃO há mais regra combinada.
 *
 * Nenhuma chamada externa aqui (sem timeout necessário) — só Postgres.
 */

import { prisma } from '@/lib/prisma'
import { statusIdFor } from '@/lib/tasks/statusMap'
import { parseDateInput } from '@/lib/tasks/dateInput'
import { getWeekRange, saoPauloDateString, startOfTodaySaoPaulo } from '@/lib/utils'
import { resolveClientOwner } from './owner-resolver'
import { writeAuditLog } from '@/lib/audit'
import type { ClientResultado, TaskPriority, SupportCategory } from '@prisma/client'

// ── Conjuntos e ordenação de qualidade (melhor → pior) ───────────────────────
const RUINS: ReadonlySet<ClientResultado> = new Set<ClientResultado>(['RUIM', 'PESSIMO'])
const BONS: ReadonlySet<ClientResultado> = new Set<ClientResultado>(['BOM', 'OTIMO'])
const RANK: Record<ClientResultado, number> = { OTIMO: 0, BOM: 1, REGULAR: 2, RUIM: 3, PESSIMO: 4 }

const label: Record<ClientResultado, string> = {
  OTIMO: 'ÓTIMO', BOM: 'BOM', REGULAR: 'REGULAR', RUIM: 'RUIM', PESSIMO: 'PÉSSIMO',
}

// ── Helpers de tempo (fuso America/Sao_Paulo) ────────────────────────────────

/** Chave da semana atual (YYYY-MM-DD do domingo) no fuso SP — base do dedupe. */
function weekKeyNow(now: Date = new Date()): string {
  return getWeekRange(startOfTodaySaoPaulo(now)).start.toISOString().slice(0, 10)
}

/** Data-parede SP de hoje + n dias corridos, como Date de prazo (meio-dia UTC). */
function spDatePlus(days: number, now: Date = new Date()): Date {
  const anchor = new Date(`${saoPauloDateString(now)}T12:00:00Z`)
  const target = new Date(anchor.getTime() + days * 86_400_000)
  return parseDateInput(target.toISOString().slice(0, 10))
}

// ── Helpers de escrita ───────────────────────────────────────────────────────

type Outcome = 'created' | 'dupe'

/**
 * Cria uma task de automação com dedupe semanal por idempotencyKey. Segue o
 * padrão do resultado-engine/recurClone: espelho statusId (D-004), origin
 * AUTOMACAO, TaskActivity 'created', AutomationLog por execução.
 */
async function createAutoTask(opts: {
  rule: string
  clientId: string
  assignedTo: string
  title: string
  description: string
  priority: TaskPriority
  dueDate: Date
  weekKey: string
  isSupport?: boolean
  supportCategory?: SupportCategory
  checklist?: { label: string; required: boolean; order: number }[]
  popId?: string
}): Promise<Outcome> {
  const idempotencyKey = `auto:${opts.rule}:${opts.clientId}:${opts.weekKey}`
  const exists = await prisma.task.findUnique({ where: { idempotencyKey }, select: { id: true } })
  if (exists) {
    await prisma.automationLog.create({
      data: { clientId: opts.clientId, status: 'DUPLICIDADE_EVITADA', reason: `${opts.rule} — task já criada nesta semana (${opts.weekKey})` },
    })
    return 'dupe'
  }

  const now = new Date()
  const task = await prisma.task.create({
    data: {
      title: opts.title,
      description: opts.description,
      type: 'DEMANDA_INTERNA',
      priority: opts.priority,
      status: 'A_FAZER',
      statusId: statusIdFor('A_FAZER'), // espelho FK (D-004)
      origin: 'AUTOMACAO',
      clientId: opts.clientId,
      assignedTo: opts.assignedTo,
      areaId: 'area_trafego',
      popId: opts.popId ?? null,
      requestedAt: now,
      dueDate: opts.dueDate,
      idempotencyKey,
      ...(opts.isSupport
        ? { isSupport: true, supportDirection: 'NOS_PARA_CLIENTE', supportCategory: opts.supportCategory ?? null }
        : {}),
      ...(opts.checklist ? { checklist: { create: opts.checklist } } : {}),
      activities: { create: { actorId: null, action: 'created' } },
    },
    select: { id: true },
  })

  await prisma.automationLog.create({
    data: { clientId: opts.clientId, createdTaskId: task.id, assigneeId: opts.assignedTo, status: 'SUCESSO', reason: `${opts.rule} — task criada (${opts.weekKey})` },
  })
  return 'created'
}

/** Publica uma mensagem do SISTEMA no canal interno do cliente (autor = HEAD). */
async function postSystemChatMessage(clientId: string, authorUserId: string | null, content: string): Promise<void> {
  if (!authorUserId) return // sem autor válido (nem HEAD) → não força FK inválida
  const chat = await prisma.clientChat.upsert({
    where: { clientId },
    create: { clientId },
    update: {},
    select: { id: true },
  })
  await prisma.clientChatMessage.create({ data: { chatId: chat.id, userId: authorUserId, content } })
}

type AlertKind = 'ANTICHURN_ACTION_NEEDED' | 'STATUS_DROPPED_TO_RUIM' | 'STATUS_IMPROVED_TO_OTIMO'

/** Cria Alert apenas se não houver um do mesmo tipo para o cliente nesta semana. */
async function createAlertOncePerWeek(clientId: string, type: AlertKind, title: string, body: string, weekStart: Date): Promise<void> {
  const found = await prisma.alert.findFirst({ where: { clientId, type, createdAt: { gte: weekStart } }, select: { id: true } })
  if (found) return
  await prisma.alert.create({ data: { clientId, type, title, body } })
}

async function logRuleFailure(rule: string, clientId: string, err: unknown): Promise<void> {
  await prisma.automationLog
    .create({ data: { clientId, status: 'FALHA', reason: `${rule} — ${err instanceof Error ? err.message : String(err)}` } })
    .catch(() => {})
}

// ── Resolução de responsáveis ────────────────────────────────────────────────

type ClientOwners = { gestorId: string | null; assignments: { userId: string }[] }

async function resolveGestor(c: ClientOwners): Promise<string | null> {
  return (await resolveClientOwner({ gestorId: c.gestorId, assignments: c.assignments })).assigneeId
}
async function resolveHead(): Promise<string | null> {
  // Reusa a precedência canônica forçando o fallback HEAD global.
  return (await resolveClientOwner({ gestorId: null, assignments: [] })).assigneeId
}
/** CS do cliente com fallback para o dono canônico (owner-resolver). */
async function resolveCs(csId: string | null, c: ClientOwners): Promise<string | null> {
  return csId ?? (await resolveGestor(c))
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK 1 — Resultado semanal mudou (chamado pelo resultado-engine)
//          Regras A2 (queda → War Room), A5 (recuperação), A6 (Bom→Ótimo).
//          A4 (Regular → Monitoramento) já é feito pelo engine — não recriado.
// ═══════════════════════════════════════════════════════════════════════════

export async function onResultadoChanged(
  clientId: string,
  anterior: ClientResultado | null,
  novo: ClientResultado | null,
): Promise<void> {
  if (!novo) return
  const now = new Date()
  const weekKey = weekKeyNow(now)
  const { start: weekStart } = getWeekRange(startOfTodaySaoPaulo(now))

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true, name: true, salaDeGuerra: true, csId: true,
      gestorId: true, assignments: { where: { isPrimary: true }, take: 1, select: { userId: true } },
    },
  })
  if (!client) return

  const caiu = anterior != null && RANK[novo] > RANK[anterior]

  // ── A2: queda para RUIM/PÉSSIMO (de qualquer melhor) → WAR ROOM ───────────
  if (RUINS.has(novo) && caiu) {
    try { await enterWarRoom(client, { resultado: novo, manual: false }, weekKey, weekStart, now) }
    catch (err) { await logRuleFailure('A2', client.id, err) }
  }

  // ── A5: recuperação — de {RUIM,PÉSSIMO} para {BOM,ÓTIMO} ──────────────────
  if (anterior != null && RUINS.has(anterior) && BONS.has(novo)) {
    try { await recoverFromWarRoom(client, novo, weekStart) }
    catch (err) { await logRuleFailure('A5', client.id, err) }
  }

  // ── A6: transição específica BOM → ÓTIMO → oportunidade de escala (CS) ─────
  if (anterior === 'BOM' && novo === 'OTIMO') {
    try {
      const csId = await resolveCs(client.csId, client)
      if (csId) {
        await createAutoTask({
          rule: 'oportunidade-escala', clientId: client.id, assignedTo: csId,
          title: `🟩 Identificar oportunidade — ${client.name}`,
          description: 'Resultado da semana subiu de BOM para ÓTIMO. Identificar oportunidade de crescimento/escala com o cliente (upsell, novos produtos, mais verba) e alinhar próximo passo.',
          priority: 'CRITICA', dueDate: spDatePlus(1, now), weekKey,
          isSupport: true, supportCategory: 'SUCESSO_DO_CLIENTE', popId: 'pop_csx_12',
        })
      }
      await prisma.automationLog.create({ data: { clientId: client.id, status: 'SUCESSO', reason: `A6 — oportunidade de escala (Bom→Ótimo) (${weekKey})` } })
    } catch (err) { await logRuleFailure('A6', client.id, err) }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK 2 — Ficha de CS salva (chamado pela action updateFichaCs)
//          Regras A1 (feedback 1→2 + resultado fraco), A3 (1º feedback).
// ═══════════════════════════════════════════════════════════════════════════

export async function onFichaCsUpdated(
  clientId: string,
  change: {
    npsAnterior: string | null
    npsNovo: string | null
    feedbackNegativoAnterior: number
    feedbackNegativoNovo: number
    // D — War Room manual: transição da flag na ficha (opcional; default = sem mudança).
    salaDeGuerraAnterior?: boolean
    salaDeGuerraNovo?: boolean
  },
): Promise<void> {
  const now = new Date()
  const weekKey = weekKeyNow(now)
  const { start: weekStart } = getWeekRange(startOfTodaySaoPaulo(now))

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true, name: true, resultado: true, possivelChurn: true, salaDeGuerra: true,
      csId: true, fechouSemanaEmRisco: true,
      gestorId: true, assignments: { where: { isPrimary: true }, take: 1, select: { userId: true } },
    },
  })
  if (!client) return

  const resultado = client.resultado
  const resultadoFraco = resultado != null && (resultado === 'REGULAR' || RUINS.has(resultado))

  // ── A1: feedback negativo 1 → 2 com resultado ∈ {REGULAR,RUIM,PÉSSIMO} ─────
  if (change.feedbackNegativoAnterior === 1 && change.feedbackNegativoNovo === 2 && resultadoFraco) {
    try {
      const head = await resolveHead()
      if (!client.possivelChurn) {
        await prisma.client.update({ where: { id: client.id }, data: { possivelChurn: true } })
      }
      if (head) {
        await createAutoTask({
          rule: 'escalacao-2fb', clientId: client.id, assignedTo: head,
          title: `🔴 Escalação · 2 feedbacks negativos · consultar CS + gestor — ${client.name}`,
          description: `Cliente com 2 feedbacks negativos na semana e resultado ${resultado ? label[resultado] : '—'}. HEAD deve ligar para o cliente e INTERDITAR o cancelamento: ouvir a insatisfação, consultar CS e gestor, e definir plano de retenção. Registrar o combinado.`,
          priority: 'CRITICA', dueDate: spDatePlus(0, now), weekKey,
          isSupport: true, supportCategory: 'TRAFEGO', popId: 'pop_csx_13',
          checklist: [
            { label: 'Ligar para o cliente e interditar o cancelamento', required: true, order: 0 },
            { label: 'Consultar CS e gestor sobre a causa', required: true, order: 1 },
            { label: 'Definir e registrar o plano de retenção', required: true, order: 2 },
          ],
        })
      }
      await createAlertOncePerWeek(
        client.id, 'ANTICHURN_ACTION_NEEDED', `Risco de churn: ${client.name}`,
        `2 feedbacks negativos na semana + resultado ${resultado ? label[resultado] : '—'}. Escalação de retenção (HOJE) atribuída ao HEAD.`, weekStart,
      )
      await writeAuditLog({ actorRole: 'SYSTEM', action: 'lifecycle.possivel_churn', entityType: 'Client', entityId: client.id, clientId: client.id, metadata: { feedbackNegativo: change.feedbackNegativoNovo, resultado, weekKey } })
      await prisma.automationLog.create({ data: { clientId: client.id, status: 'SUCESSO', reason: `A1 — possível churn / escalação 2 feedbacks (${weekKey})` } })
    } catch (err) { await logRuleFailure('A1', client.id, err) }
  }

  // ── A3: 1º feedback negativo da semana (0 → 1) ────────────────────────────
  if (change.feedbackNegativoAnterior === 0 && change.feedbackNegativoNovo === 1) {
    try {
      const gestorId = await resolveGestor(client)
      const texto = 'Registrar no chat do cliente qual será o seu próximo passo na conta para que a CS possa tratar com o cliente.'
      if (gestorId) {
        await createAutoTask({
          rule: 'primeiro-fb', clientId: client.id, assignedTo: gestorId,
          title: `🟡 1º feedback negativo da semana — ${client.name}`,
          description: texto,
          priority: 'CRITICA', dueDate: spDatePlus(0, now), weekKey,
          isSupport: true, supportCategory: 'TRAFEGO', popId: 'pop_csx_13',
        })
      }
      await postSystemChatMessage(client.id, gestorId ?? await resolveHead(), `${texto} Sinalize com ✅ quando registrar.`)

      // MELHORIA sobre o ClickUp — "margem menor" AUTOMÁTICA: se o cliente fechou
      // a SEMANA PASSADA em risco (>= 1 feedback negativo), o 1º sinal desta
      // semana já é reincidência → escalação direta ao HEAD (no ClickUp isso
      // dependia da memória da CS lembrar do histórico).
      if (client.fechouSemanaEmRisco) {
        const head = await resolveHead()
        if (head) {
          await createAutoTask({
            rule: 'escalacao-reincidencia', clientId: client.id, assignedTo: head,
            title: `🔴 Escalação · reincidência — fechou a semana passada em risco e já deu novo sinal — ${client.name}`,
            description: 'Cliente fechou a semana anterior com feedback negativo e já registrou novo sinal nesta semana. Reincidência: HEAD deve entrar em contato, avaliar retenção e alinhar plano com CS + gestor antes que escale para cancelamento.',
            priority: 'CRITICA', dueDate: spDatePlus(0, now), weekKey,
            isSupport: true, supportCategory: 'TRAFEGO', popId: 'pop_csx_13',
          })
        }
        await createAlertOncePerWeek(
          client.id, 'ANTICHURN_ACTION_NEEDED', `Reincidência de feedback: ${client.name}`,
          'Cliente fechou a semana passada em risco e já deu novo sinal nesta semana. Escalação direta ao HEAD (margem menor).', weekStart,
        )
        await writeAuditLog({ actorRole: 'SYSTEM', action: 'lifecycle.reincidencia_feedback', entityType: 'Client', entityId: client.id, clientId: client.id, metadata: { weekKey } })
      }

      await prisma.automationLog.create({ data: { clientId: client.id, status: 'SUCESSO', reason: `A3 — 1º feedback negativo (${weekKey})` } })
    } catch (err) { await logRuleFailure('A3', client.id, err) }
  }

  // ── D: War Room marcada MANUALMENTE na ficha (false → true) → pacote A2 ────
  if (change.salaDeGuerraAnterior === false && change.salaDeGuerraNovo === true) {
    try { await enterWarRoom(client, { resultado: client.resultado, manual: true }, weekKey, weekStart, now) }
    catch (err) { await logRuleFailure('D', client.id, err) }
  }

  // ── D (inverso): War Room DESMARCADA na ficha (true → false) → saída limpa ──
  // Sem isto, a flag do cliente cai mas o CriticalProtocol fica ATIVADO para
  // sempre e possivelChurn preso em true — estado divergente e falha silenciosa.
  if (change.salaDeGuerraAnterior === true && change.salaDeGuerraNovo === false) {
    try { await closeWarRoomManually(client) }
    catch (err) { await logRuleFailure('D-saida', client.id, err) }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// War Room — entrada pela queda do resultado (A2) e recuperação (A5)
// ═══════════════════════════════════════════════════════════════════════════

type WarRoomClient = ClientOwners & { id: string; name: string; salaDeGuerra: boolean; csId: string | null }

async function enterWarRoom(
  client: WarRoomClient,
  ctx: { resultado: ClientResultado | null; manual: boolean },
  weekKey: string,
  weekStart: Date,
  now: Date,
): Promise<void> {
  const resLabel = ctx.resultado ? label[ctx.resultado] : null
  // 1) Flag da ficha (idempotente). etapa=OTIMIZACAO já é setada pelo engine.
  if (!client.salaDeGuerra) {
    await prisma.client.update({ where: { id: client.id }, data: { salaDeGuerra: true } })
  }

  // 2) Cria/reativa o CriticalProtocol — REUSA o model do fluxo de conta crítica
  //    (mesmo formato do critical-account-detector). Mantém o monitor/escalação
  //    e o encerramento em A5 coerentes. Não duplica se já há protocolo ativo.
  const active = await prisma.criticalProtocol.findFirst({
    where: { clientId: client.id, status: { not: 'ENCERRADO' } },
    select: { id: true },
  })
  const abriuProtocoloAgora = !active
  if (!active) {
    const protocol = await prisma.criticalProtocol.create({
      data: {
        clientId: client.id,
        trigger: 'STATUS_DROPPED_TO_RUIM',
        responsibleId: await resolveGestor(client),
        exitCriteria: 'Resultado voltar para BOM ou ÓTIMO por 1 semana.',
      },
      select: { id: true },
    })
    await writeAuditLog({ actorRole: 'SYSTEM', action: 'warroom.open', entityType: 'CriticalProtocol', entityId: protocol.id, clientId: client.id, metadata: { origem: ctx.manual ? 'marcação manual da CS' : 'queda de resultado', resultado: ctx.resultado, weekKey } })
  }

  const causa = resLabel
    ? `Resultado da semana caiu para ${resLabel}.`
    : 'Conta marcada em War Room pela CS.'

  const gestorId = await resolveGestor(client)
  if (gestorId) {
    // (a) Conta em estado crítico — prazo +1 dia.
    await createAutoTask({
      rule: 'warroom-critico', clientId: client.id, assignedTo: gestorId,
      title: `[WAR ROOM] 🧨 Conta em estado crítico — ${client.name}`,
      description: `${causa} Conta em War Room. Assumir o caso, levantar a causa da queda e iniciar contenção imediata. Cliente entra em acompanhamento DIÁRIO até sair do crítico.`,
      priority: 'CRITICA', dueDate: spDatePlus(1, now), weekKey,
      isSupport: true, supportCategory: 'TRAFEGO', popId: 'pop_war_14',
    })

    // (b) "Documentar plano de ação" = a task de Otimização que o resultado-engine
    //     JÁ cria (idempotencyKey otimizacao:{clientId}:{windowKey}). NÃO é
    //     recriada aqui para não duplicar — ver nota no cabeçalho do arquivo.

    // (c) Acompanhamento — prazo +1 dia (gestor; documentado: CS opcional).
    await createAutoTask({
      rule: 'warroom-acompanhar', clientId: client.id, assignedTo: gestorId,
      title: `🔴 ${client.name} em WAR ROOM → Acompanhar`,
      description: 'Acompanhar diariamente a conta em War Room: execução do plano de ação, evolução das métricas e comunicação com o cliente até sair do crítico.',
      priority: 'CRITICA', dueDate: spDatePlus(1, now), weekKey,
      isSupport: true, supportCategory: 'TRAFEGO', popId: 'pop_war_14',
    })
  }

  // Mensagem no canal interno do cliente (equivalente ao #sala_de_guerra).
  // Inclui a menção ao acompanhamento diário (não há usuário 'Red' no Performli).
  // Dedupe: só posta quando ESTA chamada abriu o protocolo — se A2 e D dispararem
  // na mesma semana, a segunda encontra o protocolo ativo e não repete a mensagem.
  if (abriuProtocoloAgora) {
    await postSystemChatMessage(
      client.id, await resolveHead(),
      `🔴 CLIENTE EM WAR ROOM 🔴 — ${resLabel ? `resultado da semana caiu para ${resLabel}.` : 'marcado manualmente pela CS.'} Tarefas de plano de ação criadas. A conta entra em ACOMPANHAMENTO DIÁRIO até sair do crítico.`,
    )
  }

  await createAlertOncePerWeek(
    client.id, 'STATUS_DROPPED_TO_RUIM', `War Room aberta: ${client.name}`,
    `${causa} Conta em War Room — gestor precisa conter e documentar plano de ação. Acompanhamento diário ativo.`, weekStart,
  )
  await prisma.automationLog.create({ data: { clientId: client.id, status: 'SUCESSO', reason: `${ctx.manual ? 'D' : 'A2'} — War Room aberta${resLabel ? ` (resultado ${resLabel})` : ' (manual)'} (${weekKey})` } })
}

/**
 * Saída MANUAL da War Room (checkbox da ficha desmarcado, true → false).
 * A action já gravou salaDeGuerra=false; aqui encerra o CriticalProtocol ativo
 * (outcome ENCERRADO_NEUTRO — foi decisão da CS, não recuperação de métrica) e
 * limpa possivelChurn, mantendo Client e protocolo sempre coerentes. NÃO fecha
 * as tasks abertas (mesma regra da A5).
 */
async function closeWarRoomManually(client: WarRoomClient): Promise<void> {
  await prisma.client.update({ where: { id: client.id }, data: { possivelChurn: false } })

  const active = await prisma.criticalProtocol.findFirst({
    where: { clientId: client.id, status: { not: 'ENCERRADO' } },
    select: { id: true },
  })
  if (active) {
    await prisma.criticalProtocol.update({
      where: { id: active.id },
      data: { status: 'ENCERRADO', closedAt: new Date(), closedOutcome: 'ENCERRADO_NEUTRO' },
    })
    await writeAuditLog({ actorRole: 'SYSTEM', action: 'warroom.close', entityType: 'CriticalProtocol', entityId: active.id, clientId: client.id, metadata: { motivo: 'encerramento manual pela ficha de CS' } })
  }

  await postSystemChatMessage(
    client.id, await resolveHead(),
    `⚪ War Room encerrada manualmente pela CS — ${client.name}. Protocolo crítico fechado; concluir as tarefas em aberto do plano de recuperação.`,
  )
  await prisma.automationLog.create({ data: { clientId: client.id, status: 'SUCESSO', reason: 'D — War Room encerrada manualmente pela ficha de CS' } })
}

async function recoverFromWarRoom(client: WarRoomClient, novo: ClientResultado, weekStart: Date): Promise<void> {
  // A5: zera OS DOIS flags — sala de guerra e possível churn.
  await prisma.client.update({ where: { id: client.id }, data: { salaDeGuerra: false, possivelChurn: false } })

  const active = await prisma.criticalProtocol.findFirst({
    where: { clientId: client.id, status: { not: 'ENCERRADO' } },
    select: { id: true },
  })
  if (active) {
    await prisma.criticalProtocol.update({
      where: { id: active.id },
      data: { status: 'ENCERRADO', closedAt: new Date(), closedOutcome: 'RESOLVIDO_POSITIVO' },
    })
    await writeAuditLog({ actorRole: 'SYSTEM', action: 'warroom.close', entityType: 'CriticalProtocol', entityId: active.id, clientId: client.id, metadata: { motivo: 'resultado recuperado', resultado: novo } })
  }

  // Alerta informativo (dedupe semanal). Sem task. NÃO fecha tasks abertas.
  await createAlertOncePerWeek(
    client.id, 'STATUS_IMPROVED_TO_OTIMO', `${client.name} saiu do War Room`,
    `Resultado voltou a ${label[novo]}. War Room encerrada e risco de churn removido. Concluir as tarefas em aberto do plano de recuperação.`, weekStart,
  )
  await prisma.automationLog.create({ data: { clientId: client.id, status: 'SUCESSO', reason: `A5 — recuperação / War Room encerrada (resultado ${label[novo]})` } })
}
