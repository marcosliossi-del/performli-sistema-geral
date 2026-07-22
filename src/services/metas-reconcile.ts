import { prisma } from '@/lib/prisma'
import { computeMetasFromBudget } from '@/lib/metas/budget'
import { parseDateInput } from '@/lib/tasks/dateInput'
import { writeAuditLog } from '@/lib/audit'
import { MetricType } from '@prisma/client'

/**
 * RECONCILIAÇÃO METAS ⇄ CLIENTES (decisão Marcos 2026-07-22, DADO AMARRADO §0).
 *
 * "Deixe exatamente iguais nas duas telas; o dado mais correto é o da aba
 * Clientes — preenchido por último." Ou seja: os campos de budget-por-plataforma
 * e roasMinimo da ficha do cliente são a VERDADE de hoje e devem sobrescrever as
 * Goals MONTHLY do MÊS CORRENTE, regenerando-as pelo MESMO fluxo do updateClient
 * (computeMetasFromBudget → upsert por clientId_metric_period_startDate).
 *
 * Escopo:
 *  - E-commerce e locais/B2B são tratados igual AQUI: só regeramos SPEND /
 *    FATURAMENTO / ROAS a partir do budget+roasMinimo da ficha. Métrica principal,
 *    CPL/CPA de locais NÃO têm campo espelho no Client → NÃO são tocados (ficam
 *    como o Marcos definiu na grade de /agency/metas).
 *  - Só clientes com budget informado (soma dos canais > 0). Sem budget → nada a
 *    reconciliar (não gravamos SPEND=0).
 *
 * Robustez (CLAUDE.md #7): try/catch por cliente — falha em um não derruba os
 * demais. AuditLog agregado no fim (#8).
 */

function num(v: { toString(): string } | null | undefined): number | null {
  if (v == null) return null
  const n = Number(v.toString())
  return Number.isFinite(n) ? n : null
}

export async function reconcileMonthlyGoalsFromBudget(actor?: {
  actorId?: string | null
  actorRole?: string | null
}): Promise<{
  reconciled: number
  skipped: number
  failed: number
}> {
  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      investimentoMeta: true,
      investimentoGoogle: true,
      investimentoTiktok: true,
      roasMinimo: true,
    },
  })

  // Janela do mês corrente (mesma convenção do updateClient: meio-dia UTC).
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const gy = now.getUTCFullYear()
  const gm = now.getUTCMonth() // 0-based
  const lastDay = new Date(Date.UTC(gy, gm + 1, 0)).getUTCDate()
  const goalStart = parseDateInput(`${gy}-${pad(gm + 1)}-01`)
  const goalEnd = parseDateInput(`${gy}-${pad(gm + 1)}-${pad(lastDay)}`)

  let reconciled = 0
  let skipped = 0
  let failed = 0

  for (const c of clients) {
    try {
      const metas = computeMetasFromBudget({
        investimentoMeta: num(c.investimentoMeta),
        investimentoGoogle: num(c.investimentoGoogle),
        investimentoTiktok: num(c.investimentoTiktok),
        roasMinimo: num(c.roasMinimo),
      })

      // Sem budget → nada a reconciliar (não gravamos SPEND=0).
      if (metas.spendGoal == null || !(metas.spendGoal > 0)) {
        skipped++
        continue
      }

      const derivadas: Array<{ metric: MetricType; value: number | null }> = [
        { metric: 'SPEND', value: metas.spendGoal },
        { metric: 'FATURAMENTO', value: metas.faturamentoGoal },
        { metric: 'ROAS', value: metas.roasGoal },
      ]

      for (const d of derivadas) {
        if (d.value == null || !(d.value > 0)) continue
        await prisma.goal.upsert({
          where: {
            clientId_metric_period_startDate: {
              clientId: c.id,
              metric: d.metric,
              period: 'MONTHLY',
              startDate: goalStart,
            },
          },
          update: { targetValue: d.value, endDate: goalEnd },
          create: {
            clientId: c.id,
            metric: d.metric,
            period: 'MONTHLY',
            targetValue: d.value,
            startDate: goalStart,
            endDate: goalEnd,
          },
        })
      }

      // Cache do faturamento esperado coerente com a derivação.
      if (metas.faturamentoGoal != null) {
        await prisma.client.update({
          where: { id: c.id },
          data: { faturamentoEsperado: metas.faturamentoGoal },
        })
      }

      reconciled++
    } catch (err) {
      failed++
      console.error(`[metas-reconcile] falha ao reconciliar cliente ${c.id}:`, err)
    }
  }

  await writeAuditLog({
    actorId: actor?.actorId ?? null,
    actorRole: actor?.actorRole ?? null,
    action: 'goals.reconcile_from_budget',
    entityType: 'Goal',
    entityId: 'bulk',
    metadata: { reconciled, skipped, failed, mes: `${gy}-${pad(gm + 1)}` },
  })

  return { reconciled, skipped, failed }
}
