/**
 * Rituais semanais da régua de FEEDBACK NEGATIVO (documento Farol — C.2/C.3 +
 * ritual de terça da CS). Rodam no cron diário, cada um guardado pelo dia da
 * semana em SP. Recriam, dentro do Performli, as pontes que no ClickUp dependiam
 * de memória/disciplina manual da CS:
 *
 *   TERÇA  — runTuesdayNpsRitual : 1 task por CS ativo para preencher o NPS da
 *            semana (atualizar a Ficha de CS de toda a carteira).
 *   SEGUNDA— runMondayFeedbackReset : (a) antes de zerar, registra quem fechou a
 *            semana em risco (Alert + Client.fechouSemanaEmRisco=true); (b) zera
 *            feedbackNegativo de TODOS. Dedupe por dia (não zera 2x no mesmo dia).
 *   SEXTA  — runFridayFeedbackSweep : 1 task por CS ativo com descrição AUTO-
 *            GERADA listando os clientes com 1 e 2 feedbacks e os em War Room
 *            (a consolidação que era manual vira texto pronto).
 *
 * try/catch POR ITEM (cliente/usuário). AutomationLog por execução. AuditLog nas
 * varreduras. Dedupe por idempotencyKey (tasks) e por marcador diário (reset).
 * D-004: toda task nasce com o espelho statusId.
 */

import { prisma } from '@/lib/prisma'
import { statusIdFor } from '@/lib/tasks/statusMap'
import { parseDateInput } from '@/lib/tasks/dateInput'
import { saoPauloDateString } from '@/lib/utils'
import { writeAuditLog } from '@/lib/audit'

/** Cria uma task de AGÊNCIA (sem cliente) idempotente por chave; ignora se já existe. */
async function createUserTaskOnce(opts: {
  idempotencyKey: string
  assignedTo: string
  title: string
  description: string
  dueDate: Date
}): Promise<'created' | 'dupe'> {
  const exists = await prisma.task.findUnique({ where: { idempotencyKey: opts.idempotencyKey }, select: { id: true } })
  if (exists) return 'dupe'
  await prisma.task.create({
    data: {
      title: opts.title,
      description: opts.description,
      type: 'CS',
      priority: 'ALTA',
      status: 'A_FAZER',
      statusId: statusIdFor('A_FAZER'), // espelho FK (D-004)
      origin: 'AUTOMACAO',
      assignedTo: opts.assignedTo,
      requestedAt: new Date(),
      dueDate: opts.dueDate,
      idempotencyKey: opts.idempotencyKey,
      isSupport: true,
      supportDirection: 'NOS_PARA_CLIENTE',
      supportCategory: 'SUCESSO_DO_CLIENTE',
      activities: { create: { actorId: null, action: 'created' } },
    },
  })
  return 'created'
}

async function activeCsUsers(): Promise<{ id: string; name: string }[]> {
  return prisma.user.findMany({ where: { operationalRole: 'CS', active: true }, select: { id: true, name: true } })
}

// ═══ TERÇA — ritual de preenchimento de NPS pela CS ═════════════════════════
export async function runTuesdayNpsRitual(now: Date = new Date()): Promise<{ csUsers: number; created: number; skipped: number; failed: number }> {
  const spDate = saoPauloDateString(now)
  const due = parseDateInput(spDate) // prazo HOJE
  const cs = await activeCsUsers()
  let created = 0, skipped = 0, failed = 0
  for (const u of cs) {
    try {
      const r = await createUserTaskOnce({
        idempotencyKey: `nps-terca:${u.id}:${spDate}`,
        assignedTo: u.id,
        title: 'Preencher NPS da semana — atualizar a ficha de CS de todos os clientes da carteira',
        description: 'Ritual de terça: revisar cada cliente da carteira e atualizar a Ficha de CS (NPS, relacionamento, feedback negativo da semana). O NPS Detrator conta como 1 feedback negativo automaticamente.',
        dueDate: due,
      })
      if (r === 'created') created++
      else skipped++
    } catch (err) {
      failed++
      await prisma.automationLog.create({ data: { assigneeId: u.id, status: 'FALHA', reason: `nps-terca — ${err instanceof Error ? err.message : String(err)}` } }).catch(() => {})
    }
  }
  await prisma.automationLog.create({ data: { status: 'SUCESSO', reason: `nps-terca — ${created} criada(s), ${skipped} já existia(m) (${spDate})` } }).catch(() => {})
  return { csUsers: cs.length, created, skipped, failed }
}

// ═══ SEGUNDA — zeragem semanal com registro de quem fechou em risco ═════════
export async function runMondayFeedbackReset(now: Date = new Date()): Promise<{ atRisk: number; reset: number; failed: number; skipped: boolean }> {
  const spDate = saoPauloDateString(now)
  const dayStart = new Date(`${spDate}T00:00:00-03:00`)

  // Dedupe por dia: se já rodou hoje, não zera de novo (perderia o marcador).
  const already = await prisma.auditLog.findFirst({
    where: { action: 'feedback.weekly_reset', createdAt: { gte: dayStart } },
    select: { id: true },
  })
  if (already) return { atRisk: 0, reset: 0, failed: 0, skipped: true }

  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, feedbackNegativo: true },
  })

  let atRisk = 0, reset = 0, failed = 0
  for (const c of clients) {
    try {
      const emRisco = c.feedbackNegativo >= 1
      if (emRisco) {
        await prisma.alert.create({
          data: {
            clientId: c.id,
            type: 'ANTICHURN_ACTION_NEEDED',
            title: `${c.name} fechou a semana com ${c.feedbackNegativo} feedback(s) negativo(s)`,
            body: `${c.name} encerrou a semana com ${c.feedbackNegativo} feedback(s) negativo(s) — atenção redobrada nesta semana. Ao primeiro novo sinal, o caso escala direto para o HEAD (régua de margem menor).`,
          },
        })
        atRisk++
      }
      await prisma.client.update({
        where: { id: c.id },
        data: { fechouSemanaEmRisco: emRisco, feedbackNegativo: 0 },
      })
      reset++
    } catch (err) {
      failed++
      await prisma.automationLog.create({ data: { clientId: c.id, status: 'FALHA', reason: `feedback-reset — ${err instanceof Error ? err.message : String(err)}` } }).catch(() => {})
    }
  }

  await writeAuditLog({ actorRole: 'SYSTEM', action: 'feedback.weekly_reset', entityType: 'Client', entityId: 'bulk', metadata: { atRisk, reset, failed, spDate } })
  return { atRisk, reset, failed, skipped: false }
}

// ═══ SEXTA — varredura consolidada dos feedbacks da semana ══════════════════
export async function runFridayFeedbackSweep(now: Date = new Date()): Promise<{ csUsers: number; created: number; skipped: number; failed: number }> {
  const spDate = saoPauloDateString(now)
  const due = parseDateInput(spDate) // prazo HOJE (sexta)

  const [umFb, doisFb, war] = await Promise.all([
    prisma.client.findMany({ where: { status: 'ACTIVE', feedbackNegativo: 1 }, select: { name: true }, orderBy: { name: 'asc' } }),
    prisma.client.findMany({ where: { status: 'ACTIVE', feedbackNegativo: { gte: 2 } }, select: { name: true }, orderBy: { name: 'asc' } }),
    prisma.client.findMany({ where: { status: 'ACTIVE', salaDeGuerra: true }, select: { name: true }, orderBy: { name: 'asc' } }),
  ])

  const linha = (arr: { name: string }[]) => (arr.length ? arr.map((c) => c.name).join(', ') : 'nenhum')
  const description = [
    'Varredura de Sexta — consolidação automática dos feedbacks negativos da semana:',
    '',
    `• 2+ feedbacks (crítico): ${linha(doisFb)}`,
    `• 1 feedback (atenção): ${linha(umFb)}`,
    `• Em War Room: ${linha(war)}`,
    '',
    'Fechar a semana: confirmar tratativa de cada caso com o gestor e registrar no chat do cliente.',
  ].join('\n')

  const cs = await activeCsUsers()
  let created = 0, skipped = 0, failed = 0
  for (const u of cs) {
    try {
      const idempotencyKey = `sweep-sexta:${u.id}:${spDate}`
      const exists = await prisma.task.findUnique({ where: { idempotencyKey }, select: { id: true } })
      if (exists) { skipped++; continue }
      await prisma.task.create({
        data: {
          title: '🔴 Varredura de Sexta — feedbacks negativos da semana',
          description,
          type: 'CS',
          priority: 'ALTA',
          status: 'A_FAZER',
          statusId: statusIdFor('A_FAZER'),
          origin: 'AUTOMACAO',
          assignedTo: u.id,
          requestedAt: new Date(),
          dueDate: due,
          idempotencyKey,
          isSupport: true,
          supportDirection: 'NOS_PARA_CLIENTE',
          supportCategory: 'SUCESSO_DO_CLIENTE',
          activities: { create: { actorId: null, action: 'created' } },
        },
      })
      created++
    } catch (err) {
      failed++
      await prisma.automationLog.create({ data: { assigneeId: u.id, status: 'FALHA', reason: `sweep-sexta — ${err instanceof Error ? err.message : String(err)}` } }).catch(() => {})
    }
  }
  await prisma.automationLog.create({ data: { status: 'SUCESSO', reason: `sweep-sexta — ${created} criada(s), ${skipped} já existia(m) (${spDate})` } }).catch(() => {})
  return { csUsers: cs.length, created, skipped, failed }
}
