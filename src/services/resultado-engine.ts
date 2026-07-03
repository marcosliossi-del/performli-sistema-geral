/**
 * Motor de Resultado semanal (CSX/OPE).
 *
 * Roda toda segunda-feira via cron. Para cada cliente ECOMMERCE ativo, calcula o
 * ROAS da ÚLTIMA semana (domingo a sábado) a partir do GA4 (faturamento) e do
 * investimento somado das plataformas de anúncio, e deriva:
 *   - Resultado: Ótimo / Bom / Regular / Ruim / Péssimo (vs. ROAS mínimo acordado)
 *   - Etapa: Escala (Ótimo) · Monitoramento (Bom/Regular) · Otimização (Ruim/Péssimo)
 * Quando o Resultado é Ruim/Péssimo, gera um alerta operacional para acompanhamento.
 *
 * Idempotente por janela (Client.resultadoWeek). try/catch por cliente. Toda
 * execução grava AutomationLog (sucesso / falha / duplicidade evitada).
 */

import { prisma } from '@/lib/prisma'
import { getWeekRange } from '@/lib/utils'
import { statusIdFor } from '@/lib/tasks/statusMap'
import { resolveClientOwner } from './owner-resolver'
import { onResultadoChanged } from './client-lifecycle-automations'
import { writeAuditLog } from '@/lib/audit'
import type { ClientResultado, ClientEtapa } from '@prisma/client'

// Precedência do alvo de ROAS: Goal(ROAS) vigente > Client.roasMinimo (ficha).
// NÃO há mais fallback silencioso para 2.0 (S1-008): sem nenhum alvo cadastrado,
// o resultado fica "sem meta ROAS" (AutomationLog) e NÃO é classificado/alertado.

function classify(roas: number, target: number): { resultado: ClientResultado; etapa: ClientEtapa } {
  const ratio = target > 0 ? roas / target : 0
  let resultado: ClientResultado
  if (ratio >= 1.2) resultado = 'OTIMO'
  else if (ratio >= 1.0) resultado = 'BOM'
  else if (ratio >= 0.8) resultado = 'REGULAR'
  else if (ratio >= 0.6) resultado = 'RUIM'
  else resultado = 'PESSIMO'

  const etapa: ClientEtapa =
    resultado === 'OTIMO' ? 'ESCALA'
      : resultado === 'BOM' || resultado === 'REGULAR' ? 'MONITORAMENTO'
        : 'OTIMIZACAO'

  return { resultado, etapa }
}

export async function runResultadoUpdate(opts: { force?: boolean } = {}): Promise<{
  clientsProcessed: number
  updated: number
  skipped: number
  failed: number
  windowKey: string
}> {
  const now = new Date()
  // Última semana fechada (domingo a sábado): a semana que contém "hoje - 7 dias".
  const { start, end } = getWeekRange(new Date(now.getTime() - 7 * 86_400_000))
  const windowKey = start.toISOString().slice(0, 10)

  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE', businessType: 'ECOMMERCE' },
    select: {
      id: true,
      name: true,
      resultado: true, // valor ANTERIOR (para os hooks de ciclo de vida)
      resultadoWeek: true,
      roasMinimo: true, // fallback de alvo quando não há Goal(ROAS) — item 7
      gestorId: true, // dono canônico (precedência S2-016)
      goals: {
        where: { metric: 'ROAS' },
        orderBy: { startDate: 'desc' },
        take: 1,
        select: { targetValue: true },
      },
      assignments: { where: { isPrimary: true }, take: 1, select: { userId: true } },
    },
  })

  let updated = 0
  let skipped = 0
  let failed = 0

  for (const c of clients) {
    try {
      if (!opts.force && c.resultadoWeek === windowKey) {
        await prisma.automationLog.create({
          data: { clientId: c.id, status: 'DUPLICIDADE_EVITADA', reason: `resultado ${windowKey}` },
        })
        skipped++
        continue
      }

      const snaps = await prisma.metricSnapshot.findMany({
        where: { clientId: c.id, date: { gte: start, lte: end } },
        select: {
          spend: true,
          conversionValue: true,
          platformAccount: { select: { platform: true } },
        },
      })

      // Faturamento → sempre GA4 (conversionValue). Investimento → plataformas de anúncio.
      let revenue = 0
      let spend = 0
      let hasGa4 = false
      for (const s of snaps) {
        if (s.platformAccount.platform === 'GA4') {
          hasGa4 = true
          revenue += Number(s.conversionValue ?? 0)
        } else {
          spend += Number(s.spend ?? 0)
        }
      }

      // S1-005: sem NENHUM snapshot GA4 na janela, a receita é INDETERMINADA
      // (não medida) — não é 0 real. Tratar como spend<=0: log + pular, nunca
      // classificar como PÉSSIMO nem gerar Alert/Task de otimização.
      if (!hasGa4) {
        await prisma.automationLog.create({
          data: { clientId: c.id, status: 'FALHA', reason: `resultado.semDados — sem GA4 na semana ${windowKey} (faturamento indeterminado)` },
        })
        failed++
        continue
      }

      if (spend <= 0) {
        await prisma.automationLog.create({
          data: { clientId: c.id, status: 'FALHA', reason: 'Sem investimento na semana — ROAS indeterminado' },
        })
        failed++
        continue
      }

      const roas = revenue / spend

      // Precedência do alvo: Goal(ROAS) > Client.roasMinimo (item 7). Sem nenhum
      // dos dois → "sem meta ROAS": registra, mantém o ROAS realizado, mas NÃO
      // classifica nem gera alerta de péssimo por falta de meta (S1-008).
      const goalTarget   = c.goals[0]?.targetValue != null ? Number(c.goals[0].targetValue) : null
      const clientTarget = c.roasMinimo != null ? Number(c.roasMinimo) : null
      const target = goalTarget ?? clientTarget

      if (target == null || !(target > 0)) {
        await prisma.client.update({
          where: { id: c.id },
          data: {
            resultadoRoas: roas,
            resultadoWeek: windowKey,
            resultadoUpdatedAt: now,
          },
        })
        await prisma.automationLog.create({
          data: { clientId: c.id, status: 'SUCESSO', reason: `resultado.semMetaRoas — ROAS ${roas.toFixed(2)} sem meta cadastrada (${windowKey})` },
        })
        updated++
        continue
      }

      const { resultado, etapa } = classify(roas, target)
      const resultadoAnterior = c.resultado // snapshot antes de gravar (hooks R2/R4/R5/R6)

      await prisma.client.update({
        where: { id: c.id },
        data: {
          resultado,
          etapa,
          resultadoRoas: roas,
          resultadoWeek: windowKey,
          resultadoUpdatedAt: now,
        },
      })

      // Resultado fraco → alerta operacional (uma vez por janela, sem duplicar).
      if (resultado === 'RUIM' || resultado === 'PESSIMO') {
        const already = await prisma.alert.findFirst({
          where: { clientId: c.id, type: 'ROAS_BELOW_TARGET_2W', createdAt: { gte: start } },
          select: { id: true },
        })
        if (!already) {
          await prisma.alert.create({
            data: {
              clientId: c.id,
              type: 'ROAS_BELOW_TARGET_2W',
              title: `Resultado ${resultado === 'PESSIMO' ? 'péssimo' : 'ruim'} na semana — ${c.name}`,
              body: `ROAS de ${roas.toFixed(2)} contra meta de ${target.toFixed(2)} (semana de ${windowKey}). Cliente entrou em Otimização — definir plano de ação.`,
            },
          })
        }

        // BLOCO 6 — gera tarefa de plano de ação (Otimização) para o dono.
        // S2-016: precedência determinística Client.gestorId → assignment
        // primária → fallback HEAD global. A tarefa SEMPRE nasce (evidência
        // mínima, CLAUDE.md #14): um cliente crítico NUNCA pode ficar sem
        // responsável de forma silenciosa. Se nem o fallback resolver, loga
        // 'resultado.semGestor' e ainda assim NÃO engole.
        const owner = await resolveClientOwner({
          gestorId: c.gestorId,
          assignments: c.assignments,
        })
        const managerId = owner.assigneeId

        if (!managerId) {
          // Sem gestor e sem fallback HEAD: sinaliza cliente crítico órfão.
          await prisma.automationLog
            .create({
              data: {
                clientId: c.id,
                status: 'FALHA',
                reason: `resultado.semGestor — cliente crítico (${resultado}) sem responsável resolvível (sem gestorId, sem assignment primária e sem HEAD fallback). Tarefa de plano de ação NÃO pôde ser atribuída (${windowKey}).`,
              },
            })
            .catch(() => {})
          await writeAuditLog({
            action: 'resultado.semGestor',
            entityType: 'Client',
            entityId: c.id,
            clientId: c.id,
            metadata: { resultado, roas, target, windowKey },
          })
        } else {
          const taskKey = `otimizacao:${c.id}:${windowKey}`
          const taskExists = await prisma.task.findUnique({ where: { idempotencyKey: taskKey }, select: { id: true } })
          if (!taskExists) {
            await prisma.task.create({
              data: {
                title: `Plano de ação (Otimização) — ${c.name}`,
                description: `Resultado ${resultado === 'PESSIMO' ? 'péssimo' : 'ruim'} na semana de ${windowKey} (ROAS ${roas.toFixed(2)} vs meta ${target.toFixed(2)}). Diagnosticar e recuperar.${owner.usedFallback ? ' [Atribuída ao HEAD fallback: cliente sem gestor definido — revisar carteira.]' : ''}`,
                type: 'DEMANDA_INTERNA',
                priority: 'ALTA',
                status: 'A_FAZER',
                statusId: statusIdFor('A_FAZER'), // espelho FK (D-004)
                origin: 'AUTOMACAO',
                clientId: c.id,
                assignedTo: managerId,
                areaId: 'area_trafego',
                popId: 'pop_ope_08',
                requestedAt: now,
                dueDate: new Date(now.getTime() + 3 * 86_400_000),
                slaHours: 72,
                idempotencyKey: taskKey,
                checklist: {
                  create: [
                    { label: 'Diagnosticar a causa da queda (criativo, público, orçamento, página)', required: true, order: 0 },
                    { label: 'Aplicar ajustes nas campanhas', required: true, order: 1 },
                    { label: 'Definir meta de recuperação para a próxima semana', required: true, order: 2 },
                    { label: 'Acompanhar e registrar evolução', required: false, order: 3 },
                  ],
                },
                activities: { create: { actorId: null, action: 'created' } },
              },
            })
            if (owner.usedFallback) {
              await writeAuditLog({
                action: 'resultado.semGestor',
                entityType: 'Client',
                entityId: c.id,
                clientId: c.id,
                metadata: {
                  resultado,
                  roas,
                  target,
                  windowKey,
                  fallbackAssigneeId: managerId,
                  note: 'tarefa atribuída ao HEAD fallback — cliente crítico sem gestor definido',
                },
              })
            }
          }
        }
      }

      // Hooks de ciclo de vida do cliente (War Room, escala, chat) — best-effort:
      // NUNCA quebram o motor de resultado. Cada regra já tem seu try/catch interno.
      try {
        await onResultadoChanged(c.id, resultadoAnterior, resultado)
      } catch (hookErr) {
        await prisma.automationLog
          .create({ data: { clientId: c.id, status: 'FALHA', reason: `lifecycle.onResultadoChanged — ${hookErr instanceof Error ? hookErr.message : String(hookErr)}` } })
          .catch(() => {})
      }

      await prisma.automationLog.create({
        data: { clientId: c.id, status: 'SUCESSO', reason: `${resultado} · ROAS ${roas.toFixed(2)} · ${windowKey}` },
      })
      updated++
    } catch (err) {
      await prisma.automationLog
        .create({
          data: { clientId: c.id, status: 'FALHA', reason: err instanceof Error ? err.message : String(err) },
        })
        .catch(() => {})
      failed++
    }
  }

  return { clientsProcessed: clients.length, updated, skipped, failed, windowKey }
}
