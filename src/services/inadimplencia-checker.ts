/**
 * Inadimplência Checker (FIN-19)
 *
 * Roda no cron diário. Duas verificações:
 *  1. Faturas vencidas: nos marcos da régua (D+3/D+7/D+15/D+30) gera alerta
 *     INVOICE_OVERDUE com a ação correspondente.
 *  2. Cliente ativo sem cobrança: ACTIVE sem assinatura ACTIVE no Asaas →
 *     alerta CLIENT_WITHOUT_BILLING. Dedup por cliente (6 dias).
 *
 * Idempotência da régua (fix de confiabilidade):
 *  - Cada marco (3/7/15/30) dispara por LIMIAR (diasAtraso >= marco), não por dia
 *    exato. Assim, se o cron pular um dia, o marco não é perdido.
 *  - Cada disparo é registrado em AuditLog (action='fin19.regua', entityId=paymentId,
 *    metadata.threshold). Antes de disparar, verificamos se já existe registro para
 *    aquela fatura naquele marco → nunca dispara duas vezes (mesmo se o cron rodar 2x).
 *  - Em cada execução, só disparamos o MAIOR marco já atingido e ainda não disparado,
 *    e registramos os marcos inferiores atingidos como já cobertos (backfill), para
 *    não gerar enxurrada de alertas retroativos.
 *
 * try/catch POR item — falha em um não aborta os demais.
 */

import { prisma } from '@/lib/prisma'
import { reguaStep } from '@/lib/dal'

const REGUA_THRESHOLDS = [3, 7, 15, 30]
const REGUA_ACTION = 'fin19.regua'

/** Marcos da régua já disparados para uma fatura (via AuditLog). */
async function marcosJaDisparados(paymentId: string): Promise<Set<number>> {
  const rows = await prisma.auditLog.findMany({
    where: { action: REGUA_ACTION, entityType: 'AsaasPayment', entityId: paymentId },
    select: { metadata: true },
  })
  const set = new Set<number>()
  for (const r of rows) {
    const t = (r.metadata as { threshold?: number } | null)?.threshold
    if (typeof t === 'number') set.add(t)
  }
  return set
}

function brl(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

async function hasRecentAlert(
  clientId: string,
  type: 'INVOICE_OVERDUE' | 'CLIENT_WITHOUT_BILLING',
  days: number,
): Promise<boolean> {
  const found = await prisma.alert.findFirst({
    where: { clientId, type, createdAt: { gte: new Date(Date.now() - days * 86_400_000) } },
    select: { id: true },
  })
  return !!found
}

export async function checkInadimplencia(): Promise<{
  overdueChecked: number
  overdueAlerts: number
  withoutBillingAlerts: number
}> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // ── 1. Faturas vencidas nos marcos da régua ──────────────────────────────
  const overdue = await prisma.asaasPayment.findMany({
    where: { status: 'OVERDUE', dueDate: { lte: today } },
    select: {
      id: true,
      value: true,
      dueDate: true,
      customer: { select: { client: { select: { id: true, name: true } } } },
    },
  })

  let overdueAlerts = 0
  for (const p of overdue) {
    try {
      const client = p.customer?.client
      if (!client) continue // sem cliente vinculado não há a quem alertar

      const days = Math.floor((today.getTime() - new Date(p.dueDate).getTime()) / 86_400_000)

      // Marcos atingidos por LIMIAR (>=), não por dia exato: nenhum é perdido se
      // o cron pular um dia.
      const atingidos = REGUA_THRESHOLDS.filter((t) => days >= t)
      if (atingidos.length === 0) continue

      const jaDisparados = await marcosJaDisparados(p.id)
      const pendentes = atingidos.filter((t) => !jaDisparados.has(t))
      if (pendentes.length === 0) continue // idempotência: nada novo a disparar

      // Só o MAIOR marco pendente vira alerta operacional (o mais relevante);
      // os menores atingidos são registrados como cobertos (backfill) para não
      // ressurgirem como alertas retroativos em execuções futuras.
      const marco = Math.max(...pendentes)

      await prisma.alert.create({
        data: {
          clientId: client.id,
          type: 'INVOICE_OVERDUE',
          title: `Fatura vencida há ${days} dias: ${client.name}`,
          body: `${brl(Number(p.value))} em aberto há ${days} dias. Ação: ${reguaStep(marco)}.`,
        },
      })

      // Log/idempotência: registra TODOS os marcos pendentes atingidos como
      // disparados para esta fatura (o marco escolhido + os menores cobertos).
      await prisma.auditLog.createMany({
        data: pendentes.map((t) => ({
          action: REGUA_ACTION,
          entityType: 'AsaasPayment',
          entityId: p.id,
          clientId: client.id,
          metadata: { threshold: t, daysOverdue: days, alerted: t === marco },
        })),
      })
      overdueAlerts++
    } catch (err) {
      console.error(`[inadimplencia] falha na fatura ${p.id}:`, err)
    }
  }

  // ── 2. Clientes ativos sem cobrança ativa ────────────────────────────────
  const semCobranca = await prisma.client.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { asaasCustomer: null },
        { asaasCustomer: { subscriptions: { none: { status: 'ACTIVE' } } } },
      ],
    },
    select: { id: true, name: true },
  })

  let withoutBillingAlerts = 0
  for (const c of semCobranca) {
    try {
      if (await hasRecentAlert(c.id, 'CLIENT_WITHOUT_BILLING', 6)) continue
      await prisma.alert.create({
        data: {
          clientId: c.id,
          type: 'CLIENT_WITHOUT_BILLING',
          title: `Cliente ativo sem cobrança: ${c.name}`,
          body: `${c.name} está ativo mas não tem assinatura ativa no Asaas. Receita pode estar sendo perdida silenciosamente.`,
        },
      })
      withoutBillingAlerts++
    } catch (err) {
      console.error(`[inadimplencia] falha no cliente ${c.id}:`, err)
    }
  }

  return {
    overdueChecked: overdue.length,
    overdueAlerts,
    withoutBillingAlerts,
  }
}
