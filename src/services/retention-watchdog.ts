/**
 * Retention Watchdog (#6 — a retenção do HEAD não morre em silêncio)
 *
 * Roda no cron diário. Cobre o "não-evento": quando a task de retenção do HEAD
 * (escalacao-2fb / escalacao-reincidencia) vence sem ação, ou quando um cliente
 * é marcado como possível churn e ninguém registra contato. Antes, esses sinais
 * ficavam presos num Alert isolado (ou em nada) e o cliente cancelava.
 *
 * Dois radares:
 *   (a) task `auto:escalacao-2fb:%` / `auto:escalacao-reincidencia:%` vencida e
 *       não concluída → Alert ANTICHURN_ACTION_NEEDED por cliente + broadcast
 *       WhatsApp best-effort ao grupo interno (mesmo canal da war-room-escalation).
 *   (b) cliente com possivelChurn=true há > 7 dias sem NENHUMA ClientInteraction
 *       desde a marcação → Alert ANTICHURN_ACTION_NEEDED.
 *   (c) ficha de CS apodrecida (#7): cliente ATIVO com fichaCsUpdatedAt nulo ou
 *       > 14 dias → Alert nominal; > 30 dias → escalação (o farol está MENTINDO
 *       — NPS/relacionamento exibidos são de semanas atrás).
 *
 * Regras: try/catch POR cliente (falha em um não derruba os demais); dedupe de
 * 1 Alert por cliente por semana por MOTIVO (marcador no body dentro da janela
 * de 7 dias); toda chamada externa (WhatsApp) com try/catch, best-effort.
 */

import { prisma } from '@/lib/prisma'
import { broadcastWhatsApp } from '@/lib/whatsapp'

const POSSIVEL_CHURN_STALE_DAYS = 7
const DEDUP_DAYS = 7
const FICHA_STALE_DAYS = 14
const FICHA_ESCALATION_DAYS = 30

// Marcadores no body — permitem deduplicar por MOTIVO mesmo compartilhando o
// type ANTICHURN_ACTION_NEEDED (padrão determinístico de dedupe por janela).
const TAG_ESCALACAO = '[watchdog:escalacao-retencao]'
const TAG_SILENCIO = '[watchdog:possivel-churn-silencioso]'
const TAG_FICHA = '[watchdog:ficha-cs-apodrecida]'
const TAG_FICHA_ESCALADA = '[watchdog:ficha-cs-escalada]'

async function alertOncePerWeekByTag(
  clientId: string,
  title: string,
  body: string,
  tag: string,
  windowStart: Date,
): Promise<boolean> {
  const existing = await prisma.alert.findFirst({
    where: {
      clientId,
      type: 'ANTICHURN_ACTION_NEEDED',
      createdAt: { gte: windowStart },
      body: { contains: tag },
    },
    select: { id: true },
  })
  if (existing) return false
  await prisma.alert.create({
    data: { clientId, type: 'ANTICHURN_ACTION_NEEDED', title, body: `${body} ${tag}` },
  })
  return true
}

export async function runRetentionWatchdog(): Promise<{
  escalacaoChecked: number
  escalacaoAlerts: number
  silencioChecked: number
  silencioAlerts: number
  fichaChecked: number
  fichaAlerts: number
  whatsappSent: number
  failed: number
}> {
  const now = Date.now()
  const windowStart = new Date(now - DEDUP_DAYS * 86_400_000)

  let escalacaoAlerts = 0
  let silencioAlerts = 0
  let fichaAlerts = 0
  let whatsappSent = 0
  let failed = 0

  // ── (a) Tasks de escalação de retenção do HEAD vencidas e não concluídas ────
  const overdueEscalations = await prisma.task.findMany({
    where: {
      status: { notIn: ['CONCLUIDO', 'CANCELADO'] },
      dueDate: { lt: new Date(now) },
      clientId: { not: null },
      OR: [
        { idempotencyKey: { startsWith: 'auto:escalacao-2fb:' } },
        { idempotencyKey: { startsWith: 'auto:escalacao-reincidencia:' } },
      ],
    },
    select: {
      id: true,
      clientId: true,
      dueDate: true,
      client: { select: { name: true } },
    },
  })

  for (const t of overdueEscalations) {
    if (!t.clientId) continue
    try {
      const dias = t.dueDate ? Math.max(1, Math.floor((now - new Date(t.dueDate).getTime()) / 86_400_000)) : 1
      const nome = t.client?.name ?? 'cliente'
      const created = await alertOncePerWeekByTag(
        t.clientId,
        `Escalação de retenção vencida há ${dias} dias — o HEAD ainda não agiu: ${nome}`,
        `A escalação de retenção venceu há ${dias} dias e o HEAD ainda não agiu — o cliente pode cancelar. Assumir o contato hoje e registrar o plano de retenção.`,
        TAG_ESCALACAO,
        windowStart,
      )
      if (created) {
        escalacaoAlerts++
        // WhatsApp best-effort ao grupo interno (mesmo canal da war-room-escalation).
        try {
          const ok = await broadcastWhatsApp(
            [
              `🔴 *Escalação de retenção vencida*`,
              ``,
              `*Cliente:* ${nome}`,
              `*Vencida há:* ${dias} dias`,
              ``,
              `O HEAD ainda não agiu — o cliente pode cancelar. Assumir o contato hoje.`,
            ].join('\n'),
            false,
          )
          whatsappSent += ok
        } catch (waErr) {
          console.error('[retention-watchdog] WhatsApp falhou:', waErr)
        }
      }
    } catch (err) {
      failed++
      console.error(`[retention-watchdog] falha na escalação da task ${t.id}:`, err)
    }
  }

  // ── (b) Clientes marcados como possível churn e sem contato desde a marcação ─
  const churnClients = await prisma.client.findMany({
    where: { possivelChurn: true },
    select: { id: true, name: true },
  })

  for (const c of churnClients) {
    try {
      // "Desde quando": AuditLog action 'lifecycle.possivel_churn' mais recente.
      // Sem AuditLog → considera 7 dias (dispara).
      const mark = await prisma.auditLog.findFirst({
        where: { clientId: c.id, action: 'lifecycle.possivel_churn' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      })
      const markedAt = mark?.createdAt
        ? new Date(mark.createdAt)
        : new Date(now - POSSIVEL_CHURN_STALE_DAYS * 86_400_000)

      const dias = Math.floor((now - markedAt.getTime()) / 86_400_000)
      if (dias < POSSIVEL_CHURN_STALE_DAYS) continue

      // Nenhuma ClientInteraction desde a marcação?
      const contato = await prisma.clientInteraction.findFirst({
        where: { clientId: c.id, createdAt: { gte: markedAt } },
        select: { id: true },
      })
      if (contato) continue

      const created = await alertOncePerWeekByTag(
        c.id,
        `Possível churn há ${dias} dias e ninguém registrou contato: ${c.name}`,
        `Cliente marcado como possível churn há ${dias} dias e ninguém registrou contato desde então. Fazer o contato de retenção hoje e registrar a interação.`,
        TAG_SILENCIO,
        windowStart,
      )
      if (created) silencioAlerts++
    } catch (err) {
      failed++
      console.error(`[retention-watchdog] falha no cliente ${c.id}:`, err)
    }
  }

  // ── (c) Ficha de CS apodrecida (#7): o farol mente quando a ficha é velha ────
  const fichaClients = await prisma.client.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { fichaCsUpdatedAt: null },
        { fichaCsUpdatedAt: { lt: new Date(now - FICHA_STALE_DAYS * 86_400_000) } },
      ],
    },
    select: { id: true, name: true, fichaCsUpdatedAt: true },
  })

  for (const c of fichaClients) {
    try {
      const dias = c.fichaCsUpdatedAt
        ? Math.floor((now - new Date(c.fichaCsUpdatedAt).getTime()) / 86_400_000)
        : null
      const desde = dias === null ? 'nunca foi preenchida' : `não é atualizada há ${dias} dias`
      const escalada = dias === null || dias >= FICHA_ESCALATION_DAYS

      const created = escalada
        ? await alertOncePerWeekByTag(
            c.id,
            `Ficha de CS ${dias === null ? 'nunca preenchida' : `parada há ${dias} dias`} — escalar: ${c.name}`,
            `A ficha de CS deste cliente ${desde}. NPS, relacionamento e curva exibidos nas telas estão desatualizados — o farol pode estar mentindo. Atualizar a ficha HOJE; sem atualização, o risco de churn deste cliente é invisível.`,
            TAG_FICHA_ESCALADA,
            windowStart,
          )
        : await alertOncePerWeekByTag(
            c.id,
            `Ficha de CS parada há ${dias} dias: ${c.name}`,
            `A ficha de CS deste cliente ${desde}. Atualizar NPS, relacionamento e feedback desta semana para o farol refletir a realidade.`,
            TAG_FICHA,
            windowStart,
          )
      if (created) fichaAlerts++
    } catch (err) {
      failed++
      console.error(`[retention-watchdog] falha na ficha do cliente ${c.id}:`, err)
    }
  }

  await prisma.automationLog
    .create({
      data: {
        status: 'SUCESSO',
        reason: `retention-watchdog — escalações ${escalacaoAlerts} alertas / possível churn silencioso ${silencioAlerts} alertas / ficha apodrecida ${fichaAlerts} alertas`,
      },
    })
    .catch(() => {})

  return {
    escalacaoChecked: overdueEscalations.length,
    escalacaoAlerts,
    silencioChecked: churnClients.length,
    silencioAlerts,
    fichaChecked: fichaClients.length,
    fichaAlerts,
    whatsappSent,
    failed,
  }
}
