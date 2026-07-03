/**
 * Projeção automática de metas (dia 1 de cada mês) — o motor.
 *
 * "Arkza em processo, não em memória": no primeiro dia do mês o sistema projeta
 * sozinho a meta-resultado de cada cliente ativo, a partir do que foi realizado
 * e da meta do mês anterior, aplicando o crescimento do tipo de negócio.
 *
 * Regras (helper puro `@/lib/metas/projection`, decididas com o dono, 2026-07):
 *  - E-commerce: métrica-resultado = FATURAMENTO (Σ conversionValue GA4 do mês
 *    fechado). Crescimento +15%.
 *  - Local: métrica-resultado = métrica da Goal MONTHLY não-taxa mais recente do
 *    cliente (LEADS/MENSAGENS/CONVERSIONS), medida na plataforma de ANÚNCIO.
 *    Crescimento +20%.
 *  - Base do realizado: YoY (mesmo mês do ano anterior) se houver 12+ meses de
 *    histórico; senão MoM (mês anterior).
 *  - Taxas (ROAS/CPL/CPA/CTR…) NÃO crescem — carregam o valor do mês anterior.
 *  - Budget é MANTIDO (não recalcula); ROAS mínimo é derivado do faturamento-alvo.
 *
 * Idempotente por mês (upsert das Goals pela chave única; Alert deduplicado).
 * try/catch por cliente (CLAUDE.md #7): um cliente não derruba os outros.
 */

import { prisma } from '@/lib/prisma'
import { MetricType, Platform } from '@prisma/client'
import { getMonthRange } from '@/lib/utils'
import { parseDateInput } from '@/lib/tasks/dateInput'
import { writeAuditLog } from '@/lib/audit'
import { RATE_METRICS } from '@/services/weekly-goals-sync'
import {
  projetarAlvo,
  roasEsperado,
  investimentoTotal,
  CRESCIMENTO_ECOMMERCE,
  CRESCIMENTO_LOCAL,
} from '@/lib/metas/projection'

// AlertType usado: não há tipo específico de "metas projetadas". Reusamos o mais
// próximo (automação de rotina) — SINALIZADO ao guardião p/ eventual novo enum.
const ALERT_TYPE_PROJECAO = 'TASK_AUTOMATION' as const

// Plataformas de ANÚNCIO (para métricas-resultado de negócio local).
const AD_PLATFORMS: Platform[] = ['META_ADS', 'GOOGLE_ADS', 'TIKTOK_ADS']

/** Range [start,end] de um mês (year, monthIndex 0-11), fim inclusivo 23:59:59. */
function monthRangeOf(year: number, monthIndex: number): { start: Date; end: Date } {
  const start = new Date(year, monthIndex, 1)
  const end = new Date(year, monthIndex + 1, 0)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

/**
 * Soma o realizado de uma métrica-resultado num intervalo, a partir dos
 * MetricSnapshot das plataformas do cliente.
 */
async function somarRealizado(
  clientId: string,
  metric: MetricType,
  range: { start: Date; end: Date },
): Promise<number> {
  // FATURAMENTO vem do GA4 (conversionValue). Demais, das plataformas de anúncio.
  const platforms: Platform[] = metric === 'FATURAMENTO' ? ['GA4'] : AD_PLATFORMS

  const snapshots = await prisma.metricSnapshot.findMany({
    where: {
      clientId,
      date: { gte: range.start, lte: range.end },
      platformAccount: { platform: { in: platforms } },
    },
    select: { conversionValue: true, conversions: true, mensagens: true },
  })

  let total = 0
  for (const s of snapshots) {
    if (metric === 'FATURAMENTO') total += s.conversionValue ? Number(s.conversionValue) : 0
    else if (metric === 'MENSAGENS') total += s.mensagens ?? 0
    else total += s.conversions ?? 0 // CONVERSIONS / LEADS → eventos de conversão
  }
  return total
}

export async function projetarMetasDoMes(): Promise<{
  processados: number
  projetados: number
  pulados: number
  falhas: number
}> {
  const now = new Date()
  const novoMes = getMonthRange(now)

  // startDate/endDate CANÔNICOS da Goal do mês — MESMA convenção da UI
  // (parseDateInput → meio-dia UTC, D-006). Se a projeção gravasse 00:00Z
  // (getMonthRange), a chave @@unique NÃO colidiria com a meta criada à mão e
  // duplicaria a Goal do mês. `novoMes` continua sendo usado só como JANELA de
  // tempo (ex.: dedup de alerta), não como startDate da Goal.
  const pad = (n: number) => String(n).padStart(2, '0')
  const gy = now.getUTCFullYear()
  const gm = now.getUTCMonth() // 0-based
  const lastDay = new Date(Date.UTC(gy, gm + 1, 0)).getUTCDate()
  const goalStart = parseDateInput(`${gy}-${pad(gm + 1)}-01`)
  const goalEnd = parseDateInput(`${gy}-${pad(gm + 1)}-${pad(lastDay)}`)

  // Mês anterior (MoM).
  const prevRef = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const mesAnterior = monthRangeOf(prevRef.getFullYear(), prevRef.getMonth())
  // Mesmo mês do ano anterior (YoY).
  const yoyRef = new Date(now.getFullYear() - 1, now.getMonth(), 1)
  const mesYoY = monthRangeOf(yoyRef.getFullYear(), yoyRef.getMonth())

  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      businessType: true,
      investimentoMeta: true,
      investimentoGoogle: true,
      investimentoTiktok: true,
    },
  })

  let processados = 0
  let projetados = 0
  let pulados = 0
  let falhas = 0

  for (const c of clients) {
    processados++
    try {
      // B2B mede como NEGÓCIO LOCAL (decisão do dono, 2026-07: "b2b se mede como
      // local, os nossos buscam leads"). Logo: métrica-resultado não-taxa medida
      // na plataforma de ANÚNCIO, crescimento +20% e SEM gravar
      // faturamentoEsperado/roasMinimo. Só ECOMMERCE segue faturamento GA4.
      const isLocal = c.businessType === 'LOCAL' || c.businessType === 'B2B'

      // ── Métrica-resultado do cliente ─────────────────────────────────────
      let metricaResultado: MetricType
      if (!isLocal) {
        metricaResultado = 'FATURAMENTO'
      } else {
        const naoTaxa = await prisma.goal.findFirst({
          where: {
            clientId: c.id,
            period: 'MONTHLY',
            metric: { notIn: Array.from(RATE_METRICS) },
          },
          orderBy: { startDate: 'desc' },
          select: { metric: true },
        })
        if (!naoTaxa) { pulados++; continue } // sem métrica-resultado definida
        metricaResultado = naoTaxa.metric
      }

      // ── Base do realizado: YoY se houver 12+ meses de histórico, senão MoM ─
      const primeiroSnap = await prisma.metricSnapshot.findFirst({
        where: { clientId: c.id },
        orderBy: { date: 'asc' },
        select: { date: true },
      })
      const dozeMesesAtras = new Date(now.getFullYear(), now.getMonth() - 12, 1)
      const temHistoricoYoY = !!primeiroSnap && primeiroSnap.date <= dozeMesesAtras
      const baseRange = temHistoricoYoY ? mesYoY : mesAnterior

      const realizado = await somarRealizado(c.id, metricaResultado, baseRange)

      // ── Meta anterior (métrica-resultado, mês anterior) ──────────────────
      const metaAnteriorGoal = await prisma.goal.findFirst({
        where: {
          clientId: c.id,
          metric: metricaResultado,
          period: 'MONTHLY',
          startDate: { lte: mesAnterior.end },
          endDate: { gte: mesAnterior.start },
        },
        orderBy: { startDate: 'desc' },
        select: { targetValue: true },
      })
      const metaAnterior = metaAnteriorGoal ? Number(metaAnteriorGoal.targetValue) : 0

      // ── Alvo projetado ───────────────────────────────────────────────────
      const crescimento = isLocal ? CRESCIMENTO_LOCAL : CRESCIMENTO_ECOMMERCE
      const alvo = projetarAlvo(realizado, metaAnterior, crescimento)

      if (!(alvo > 0)) { pulados++; continue } // sem base ⇒ nada a projetar

      await prisma.goal.upsert({
        where: {
          clientId_metric_period_startDate: {
            clientId: c.id,
            metric: metricaResultado,
            period: 'MONTHLY',
            startDate: goalStart,
          },
        },
        update: { targetValue: alvo, endDate: goalEnd },
        create: {
          clientId: c.id,
          metric: metricaResultado,
          period: 'MONTHLY',
          targetValue: alvo,
          startDate: goalStart,
          endDate: goalEnd,
        },
      })

      // ── E-commerce: cache de faturamento + ROAS mínimo derivado ──────────
      if (!isLocal) {
        const invTotal = investimentoTotal(
          c.investimentoMeta ? Number(c.investimentoMeta) : null,
          c.investimentoGoogle ? Number(c.investimentoGoogle) : null,
          c.investimentoTiktok ? Number(c.investimentoTiktok) : null,
        )
        const roasMin = roasEsperado(alvo, invTotal)
        await prisma.client.update({
          where: { id: c.id },
          data: {
            faturamentoEsperado: alvo,
            ...(roasMin !== null ? { roasMinimo: roasMin } : {}),
          },
        })
      }

      // ── Taxas NÃO crescem: carrega o valor do mês anterior p/ o novo mês ──
      const taxasAnteriores = await prisma.goal.findMany({
        where: {
          clientId: c.id,
          period: 'MONTHLY',
          metric: { in: Array.from(RATE_METRICS) },
          startDate: { lte: mesAnterior.end },
          endDate: { gte: mesAnterior.start },
        },
        select: { metric: true, targetValue: true },
      })
      for (const t of taxasAnteriores) {
        const val = Number(t.targetValue)
        if (!(val > 0)) continue
        await prisma.goal.upsert({
          where: {
            clientId_metric_period_startDate: {
              clientId: c.id,
              metric: t.metric,
              period: 'MONTHLY',
              startDate: goalStart,
            },
          },
          update: { targetValue: val, endDate: goalEnd },
          create: {
            clientId: c.id,
            metric: t.metric,
            period: 'MONTHLY',
            targetValue: val,
            startDate: goalStart,
            endDate: goalEnd,
          },
        })
      }

      // ── Alert (deduplicado por mês) ──────────────────────────────────────
      const jaAlertado = await prisma.alert.findFirst({
        where: {
          clientId: c.id,
          type: ALERT_TYPE_PROJECAO,
          createdAt: { gte: novoMes.start, lte: novoMes.end },
          title: 'Metas do mês projetadas — revisar',
        },
        select: { id: true },
      })
      if (!jaAlertado) {
        await prisma.alert.create({
          data: {
            clientId: c.id,
            type: ALERT_TYPE_PROJECAO,
            title: 'Metas do mês projetadas — revisar',
            body: `As metas de ${c.name} foram projetadas automaticamente para o mês. Revise se o alvo está coerente com a operação e ajuste se necessário.`,
          },
        })
      }

      await writeAuditLog({
        action: 'goals.projetarMes',
        entityType: 'Goal',
        entityId: c.id,
        clientId: c.id,
        metadata: {
          metricaResultado,
          realizado,
          metaAnterior,
          alvo,
          base: temHistoricoYoY ? 'YoY' : 'MoM',
        },
      })

      projetados++
    } catch (err) {
      falhas++
      console.error(`[meta-projection] falha ao projetar cliente ${c.id}:`, err)
    }
  }

  return { processados, projetados, pulados, falhas }
}
