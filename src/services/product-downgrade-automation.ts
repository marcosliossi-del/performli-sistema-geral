/**
 * Automação de DOWNGRADE DE PRODUTO (Fase 3 anti-churn)
 *
 * "Cliente que remove um produto contratado está testando a saída com uma perna
 * só." Quando um produto some da ficha (`Client.produtos`), a remoção é um sinal
 * de churn silencioso: raramente vem acompanhada de aviso, e some sem que
 * ninguém acione a CS. Este hook, disparado pela action de edição de produtos
 * APÓS o diff, transforma cada REMOÇÃO em ação rastreável:
 *
 *   (a) Alert ANTICHURN_ACTION_NEEDED (dono CS, SLA 24h pela governança) —
 *       dedupe por produto na semana via tag [downgrade:{slug}] no título.
 *   (b) Task CRÍTICA para a CS entender o motivo HOJE (+1 dia), com evidência
 *       obrigatória; dedupe por idempotencyKey semanal por produto.
 *
 * ADIÇÃO de produto NÃO dispara nada aqui (só vira histórico em
 * ClientProductChange). Reusa o AlertType ANTICHURN_ACTION_NEEDED (já governado,
 * SLA 24h) — nenhum AlertType novo é criado.
 *
 * best-effort: TUDO sob try/catch por produto — uma falha do gatilho NUNCA
 * derruba o save da action de edição (a fonte da verdade dos produtos já foi
 * gravada antes desta chamada). Sem chamadas externas (só Postgres).
 */

import { prisma } from '@/lib/prisma'
import { statusIdFor } from '@/lib/tasks/statusMap'
import { parseDateInput } from '@/lib/tasks/dateInput'
import { slugify, getWeekRange, saoPauloDateString, startOfTodaySaoPaulo } from '@/lib/utils'
import { resolveClientOwner } from './owner-resolver'
import { writeAuditLog } from '@/lib/audit'

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

type ClientForDowngrade = {
  id: string
  name: string
  csId: string | null
  gestorId: string | null
  assignments: { userId: string }[]
}

/** CS do cliente, com fallback ao dono canônico (gestor → assignment → HEAD). */
async function resolveCs(c: ClientForDowngrade): Promise<string | null> {
  if (c.csId) return c.csId
  return (await resolveClientOwner({ gestorId: c.gestorId, assignments: c.assignments })).assigneeId
}

/**
 * Dispara o pacote de downgrade para CADA produto removido. Chamado pela action
 * de edição de produtos depois de já ter gravado Client.produtos e as linhas de
 * ClientProductChange. `removed` são os rótulos exatos dos produtos retirados.
 */
export async function onProductsDowngraded(
  clientId: string,
  removed: string[],
): Promise<void> {
  if (removed.length === 0) return

  const now = new Date()
  const weekKey = weekKeyNow(now)
  const { start: weekStart } = getWeekRange(startOfTodaySaoPaulo(now))

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true, name: true, csId: true, gestorId: true,
      assignments: { where: { isPrimary: true }, take: 1, select: { userId: true } },
    },
  })
  if (!client) return

  for (const produto of removed) {
    try {
      const produtoSlug = slugify(produto)
      const tag = `[downgrade:${produtoSlug}]`
      const csId = await resolveCs(client)

      // (a) Alert — dedupe por PRODUTO na semana (tag no título). Reusa o tipo
      //     governado ANTICHURN_ACTION_NEEDED (dono CS, SLA 24h).
      const jaAlertado = await prisma.alert.findFirst({
        where: {
          clientId: client.id,
          type: 'ANTICHURN_ACTION_NEEDED',
          title: { contains: tag },
          createdAt: { gte: weekStart },
        },
        select: { id: true },
      })
      if (!jaAlertado) {
        await prisma.alert.create({
          data: {
            clientId: client.id,
            type: 'ANTICHURN_ACTION_NEEDED',
            title: `${tag} Downgrade: ${client.name} removeu ${produto} — entender o motivo HOJE`,
            body: `O cliente ${client.name} deixou de contratar "${produto}". Remover um produto costuma ser o primeiro passo silencioso de saída. A CS precisa falar com o cliente HOJE, entender o motivo e registrar o combinado antes que vire cancelamento total.`,
          },
        })
      }

      // (b) Task CRÍTICA para a CS — dedupe semanal por produto via idempotencyKey.
      if (csId) {
        const idempotencyKey = `auto:downgrade:${client.id}:${produtoSlug}:${weekKey}`
        const exists = await prisma.task.findUnique({ where: { idempotencyKey }, select: { id: true } })
        if (!exists) {
          const task = await prisma.task.create({
            data: {
              title: `Entender motivo do downgrade de ${produto} — ${client.name}`,
              description: `O cliente removeu o produto "${produto}" da carteira. Falar com o cliente HOJE, entender o motivo real da retirada, avaliar risco de churn total e registrar o combinado (reverter, reter ou encaminhar retenção).`,
              type: 'DEMANDA_INTERNA',
              priority: 'CRITICA',
              status: 'A_FAZER',
              statusId: statusIdFor('A_FAZER'),
              origin: 'AUTOMACAO',
              clientId: client.id,
              assignedTo: csId,
              areaId: 'area_trafego',
              popId: 'pop_csx_13',
              requestedAt: now,
              dueDate: spDatePlus(1, now),
              requiresEvidence: true,
              idempotencyKey,
              isSupport: true,
              supportDirection: 'NOS_PARA_CLIENTE',
              supportCategory: 'SUCESSO_DO_CLIENTE',
              activities: { create: { actorId: null, action: 'created' } },
            },
            select: { id: true },
          })
          await prisma.automationLog.create({
            data: { clientId: client.id, createdTaskId: task.id, assigneeId: csId, status: 'SUCESSO', reason: `downgrade — task de retenção criada para "${produto}" (${weekKey})` },
          })
        } else {
          await prisma.automationLog.create({
            data: { clientId: client.id, status: 'DUPLICIDADE_EVITADA', reason: `downgrade — task de "${produto}" já criada nesta semana (${weekKey})` },
          })
        }
      }

      await writeAuditLog({
        actorRole: 'SYSTEM',
        action: 'lifecycle.product_downgrade',
        entityType: 'Client',
        entityId: client.id,
        clientId: client.id,
        metadata: { produto, weekKey },
      })
    } catch (err) {
      await prisma.automationLog
        .create({ data: { clientId: client.id, status: 'FALHA', reason: `downgrade "${produto}" — ${err instanceof Error ? err.message : String(err)}` } })
        .catch(() => {})
    }
  }
}
