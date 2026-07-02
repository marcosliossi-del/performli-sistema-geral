/**
 * Coração inteligente da conciliação financeira: cliente ↔ contrato ↔ fatura
 * (Asaas) ↔ task de cobrança do Performli.
 *
 * O vínculo fatura↔task é SEMPRE por ID (idempotencyKey `asaas-cobranca:{id}`),
 * NUNCA por nome — zero margem de erro. Três movimentos:
 *  1. GERAÇÃO: toda fatura pendente/vencida de cliente ACTIVE garante uma task
 *     de cobrança viva (idempotente — não duplica).
 *  2. CONCILIAÇÃO: quando o Asaas confirma o pagamento (RECEIVED/CONFIRMED), a
 *     task correspondente é concluída automaticamente com o valor efetivo.
 *  3. REABERTURA: se o pagamento é estornado (REFUNDED) depois de conciliado, a
 *     task volta a A_FAZER — o dinheiro voltou a estar em risco.
 *
 * try/catch por pagamento (CLAUDE.md #7): uma fatura problemática não derruba a
 * rotina. NUNCA lança. AuditLog nas conciliações/reaberturas (CLAUDE.md #8).
 */

import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import { statusIdFor } from '@/lib/tasks/statusMap'
import type { Prisma } from '@prisma/client'

const MARCOS_EXTERNAL_ID = '152690431'

// Enum real AsaasPaymentStatus (schema): PAGO = RECEIVED|CONFIRMED; ABERTO =
// PENDING|OVERDUE; ESTORNO/CLAWBACK = REFUNDED e também os estados EM ANÁLISE
// (REFUND_REQUESTED, CHARGEBACK_REQUESTED) — dinheiro em risco NUNCA passa
// silencioso: qualquer contestação reabre a cobrança para o financeiro agir.
const STATUS_PAGO = new Set(['RECEIVED', 'CONFIRMED'])
const STATUS_ABERTO = new Set(['PENDING', 'OVERDUE'])
const STATUS_ESTORNO = new Set(['REFUNDED', 'REFUND_REQUESTED', 'CHARGEBACK_REQUESTED'])
const ESTORNO_LABEL: Record<string, string> = {
  REFUNDED: 'Pagamento estornado no Asaas',
  REFUND_REQUESTED: 'Estorno SOLICITADO no Asaas (em análise)',
  CHARGEBACK_REQUESTED: 'CHARGEBACK aberto no Asaas (contestação)',
}

// Status de Task considerados "fechados" (não reconciliar de novo por cima).
const TASK_FECHADA = new Set(['CONCLUIDO', 'CANCELADO'])

export type ReconcileResult = {
  geradas: number
  conciliadas: number
  reabertas: number
  erros: string[]
}

function brl(value: Prisma.Decimal | number): string {
  const n = typeof value === 'number' ? value : Number(value)
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function ddmm(d: Date): string {
  const dia = String(d.getUTCDate()).padStart(2, '0')
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}`
}

function ddmmyyyy(d: Date): string {
  return `${ddmm(d)}/${d.getUTCFullYear()}`
}

export async function reconcileAsaasTasks(): Promise<ReconcileResult> {
  const result: ReconcileResult = { geradas: 0, conciliadas: 0, reabertas: 0, erros: [] }

  // Responsável financeiro: fallback Marcos (ADMIN). Necessário para gerar task.
  const marcos = await prisma.user.findFirst({
    where: { externalId: MARCOS_EXTERNAL_ID },
    select: { id: true },
  })
  if (!marcos) {
    result.erros.push('Usuário ADMIN Marcos (externalId 152690431) não encontrado — reconciliação abortada.')
    return result
  }

  // Faturas com cliente vinculado (via AsaasCustomer.clientId).
  const payments = await prisma.asaasPayment.findMany({
    where: { customer: { clientId: { not: null } } },
    select: {
      id: true,
      status: true,
      value: true,
      netValue: true,
      dueDate: true,
      paymentDate: true,
      customer: {
        select: {
          clientId: true,
          name: true,
          client: { select: { status: true, name: true } },
        },
      },
    },
  })

  for (const p of payments) {
    try {
      const clientId = p.customer?.clientId ?? null
      if (!clientId) continue
      const clientName = p.customer?.client?.name ?? p.customer?.name ?? 'Cliente'
      const clientStatus = p.customer?.client?.status ?? null

      const idempotencyKey = `asaas-cobranca:${p.id}`
      const existing = await prisma.task.findUnique({
        where: { idempotencyKey },
        select: { id: true, status: true },
      })

      const pago = STATUS_PAGO.has(p.status)
      const aberto = STATUS_ABERTO.has(p.status)
      const estorno = STATUS_ESTORNO.has(p.status)
      const valorEfetivo = p.netValue ?? p.value

      // ── 1. GERAÇÃO ──────────────────────────────────────────────────────────
      if (!existing) {
        // Desenho aprovado pelo dono (2026-07-02): tarefa SÓ na exceção.
        // Fatura em dia não vira tarefa (o Asaas cobra sozinho e o painel
        // Financeiro mostra o fluxo); apenas a VENCIDA exige ação humana.
        if (aberto && p.status === 'OVERDUE' && clientStatus === 'ACTIVE') {
          const vencida = true
          await prisma.task.create({
            data: {
              title: `Receber ${clientName} — ${brl(p.value)} (venc. ${ddmm(p.dueDate)})`,
              type: 'COBRANCA',
              status: 'A_FAZER',
              statusId: statusIdFor('A_FAZER'),
              priority: vencida ? 'CRITICA' : 'ALTA',
              origin: 'MANUAL',
              dueDate: p.dueDate,
              requestedAt: new Date(),
              requesterId: marcos.id,
              assignedTo: marcos.id,
              clientId,
              tags: ['cobranca', 'asaas'],
              idempotencyKey,
            },
          })
          await writeAuditLog({
            action: 'asaas.cobrancaCriada',
            entityType: 'Task',
            entityId: idempotencyKey,
            clientId,
            metadata: { paymentId: p.id, valor: Number(p.value), vencimento: p.dueDate?.toISOString() ?? null },
          })
          result.geradas++
        }
        continue
      }

      // ── 2. CONCILIAÇÃO (pago → conclui a task aberta) ────────────────────────
      if (pago && !TASK_FECHADA.has(existing.status)) {
        const quando = p.paymentDate ? ddmmyyyy(p.paymentDate) : 'data confirmada pelo Asaas'
        await prisma.task.update({
          where: { id: existing.id },
          data: {
            status: 'CONCLUIDO',
            statusId: statusIdFor('CONCLUIDO'),
            completedAt: new Date(),
            completedById: null, // sistema (conciliação automática)
            completionNotes: `Pago ${brl(valorEfetivo)} em ${quando} — conciliado automaticamente via Asaas.`,
          },
        })
        await prisma.taskActivity.create({
          data: {
            taskId: existing.id,
            actorId: null, // sistema
            action: 'status_changed',
            fromValue: existing.status,
            toValue: 'CONCLUIDO',
          },
        })
        await writeAuditLog({
          action: 'asaas.autoReconcile',
          entityType: 'Task',
          entityId: existing.id,
          clientId,
          metadata: { paymentId: p.id, valorPago: Number(valorEfetivo) },
        })
        result.conciliadas++
        continue
      }

      // ── 3. REABERTURA (estornado depois de conciliado → volta a A_FAZER) ─────
      if (estorno && existing.status === 'CONCLUIDO') {
        await prisma.task.update({
          where: { id: existing.id },
          data: {
            status: 'A_FAZER',
            statusId: statusIdFor('A_FAZER'),
            completedAt: null,
            completedById: null,
            completionNotes: `${ESTORNO_LABEL[p.status] ?? 'Pagamento estornado no Asaas'} (${brl(valorEfetivo)}) — cobrança reaberta automaticamente.`,
          },
        })
        await prisma.taskActivity.create({
          data: {
            taskId: existing.id,
            actorId: null,
            action: 'status_changed',
            fromValue: 'CONCLUIDO',
            toValue: 'A_FAZER',
          },
        })
        await writeAuditLog({
          action: 'asaas.reopened',
          entityType: 'Task',
          entityId: existing.id,
          clientId,
          metadata: { paymentId: p.id, valorEstornado: Number(valorEfetivo), statusAsaas: p.status },
        })
        result.reabertas++
        continue
      }

      // ── 3b. ESTORNO SEM TAREFA ATIVA (task CANCELADA) ────────────────────────
      // Não reabrimos silenciosamente uma cobrança que foi CANCELADA (decisão
      // humana). Mas o dinheiro voltou a estar em risco: registramos auditoria e
      // criamos um Alert para o financeiro verificar — nada some silencioso.
      if (estorno && existing.status === 'CANCELADO') {
        await writeAuditLog({
          action: 'asaas.estornoSemTarefa',
          entityType: 'Task',
          entityId: existing.id,
          clientId,
          metadata: { paymentId: p.id, valorEstornado: Number(valorEfetivo), statusAsaas: p.status, taskStatus: existing.status },
        })
        await prisma.alert.create({
          data: {
            clientId,
            type: 'INVOICE_OVERDUE',
            title: `Estorno de fatura de ${clientName} sem tarefa ativa — verificar cobrança`,
            body: `${ESTORNO_LABEL[p.status] ?? 'Pagamento estornado no Asaas'} (${brl(valorEfetivo)}), mas a tarefa de cobrança está CANCELADA. O dinheiro voltou a estar em risco — verificar manualmente no Asaas.`,
          },
        })
        continue
      }
    } catch (err) {
      result.erros.push(`fatura ${p.id}: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
    }
  }

  return result
}
