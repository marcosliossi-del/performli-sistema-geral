/**
 * Inadimplência Checker (FIN-19)
 *
 * Roda no cron diário. Duas verificações:
 *  1. Faturas vencidas: nos marcos da régua (D+3/D+7/D+15/D+30) gera alerta
 *     INVOICE_OVERDUE com a ação correspondente. Dedup por cliente (2 dias).
 *  2. Cliente ativo sem cobrança: ACTIVE sem assinatura ACTIVE no Asaas →
 *     alerta CLIENT_WITHOUT_BILLING. Dedup por cliente (6 dias).
 *
 * try/catch POR item — falha em um não aborta os demais.
 */

import { prisma } from '@/lib/prisma'
import { reguaStep } from '@/lib/dal'

const REGUA_THRESHOLDS = [3, 7, 15, 30]

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
      if (!REGUA_THRESHOLDS.includes(days)) continue
      if (await hasRecentAlert(client.id, 'INVOICE_OVERDUE', 2)) continue

      await prisma.alert.create({
        data: {
          clientId: client.id,
          type: 'INVOICE_OVERDUE',
          title: `Fatura vencida há ${days} dias: ${client.name}`,
          body: `${brl(Number(p.value))} em aberto há ${days} dias. Ação: ${reguaStep(days)}.`,
        },
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
