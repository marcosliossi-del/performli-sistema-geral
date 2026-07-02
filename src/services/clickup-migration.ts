/**
 * Motor da migração ClickUp → Performli (lotes: internas, rituais, pagar, metas,
 * contratos). Idempotente por `Task.idempotencyKey = clickup-mig:{clickupId}`
 * (internas/rituais/pagar/metas) e, para contratos, por REGRA DO DONO (Performli
 * vence: se o cliente já tem Contract VIGENTE, o do ClickUp é descartado).
 *
 * Fonte dos dados: snapshot commitado em `clickup-migration-data.ts` (revisável
 * em PR, zero segredo — padrão do seed-suporte). NADA de chamada externa aqui.
 *
 * Decisões (documentadas no handoff docs/handoffs/migracao-clickup.md):
 *  - METAS: o model `Goal` EXIGE clientId (metas de cliente). As metas do ClickUp
 *    são metas de AGÊNCIA (faturamento, nº de clientes, contratações) — não há
 *    model adequado. Viram `Task` interna type SIMPLES com tags ['meta',...],
 *    responsável Marcos, e o status do ClickUp ('não conquistada') na descrição.
 *  - CONTRATO sem valor: a API do ClickUp não expõe o fee. `feeValue` (NOT NULL)
 *    entra como 0 e Marcos completa no painel (registrado em notes).
 *  - startDate do contrato: endDate − 6 meses (ciclo de fee padrão da Arkza);
 *    escolha simples e documentada — Marcos ajusta se for anual.
 *
 * Try/catch por item (CLAUDE.md #7). AuditLog nas operações (CLAUDE.md #8).
 */

import { Prisma } from '@prisma/client'
import type { TaskType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { normalize } from '@/services/seed-carteiras'
import { writeAuditLog } from '@/lib/audit'
import { statusIdFor } from '@/lib/tasks/statusMap'
import { occurrenceKey } from '@/lib/tasks/recurClone'
import {
  MIG_INTERNAS,
  MIG_RITUAIS,
  MIG_CONTAS_PAGAR,
  MIG_METAS,
  MIG_CONTRATOS,
  type MigTaskInterna,
} from '@/services/clickup-migration-data'

const MARCOS_EXTERNAL_ID = '152690431'

export type LoteName = 'internas' | 'rituais' | 'pagar' | 'metas' | 'contratos' | 'tudo'

export type LoteResult = {
  criadas: number
  puladas: number
  naoConciliados: string[]
  erros: string[]
}

export type MigrarResult = Partial<Record<Exclude<LoteName, 'tudo'>, LoteResult>>

function emptyResult(): LoteResult {
  return { criadas: 0, puladas: 0, naoConciliados: [], erros: [] }
}

/**
 * Converte um epoch (ms, TZ do workspace ClickUp = America/Sao_Paulo) para o
 * meio-dia UTC do MESMO dia de parede — imune ao off-by-one da meia-noite (mesma
 * intenção do `parseDateInput` das actions de task).
 */
function noonUtcFromMs(ms: number | null): Date | null {
  if (ms === null) return null
  const day = occurrenceKey(new Date(ms)) // yyyy-mm-dd em America/Sao_Paulo
  return new Date(`${day}T12:00:00Z`)
}

// ─── Índices compartilhados (usuários por externalId, clientes por normalize) ──
type Indexes = {
  userByExternal: Map<string, string>
  marcosId: string
  clientByNorm: Map<string, string>
}

async function buildIndexes(): Promise<Indexes | null> {
  const users = await prisma.user.findMany({
    where: { externalId: { not: null } },
    select: { id: true, externalId: true },
  })
  const userByExternal = new Map<string, string>()
  for (const u of users) if (u.externalId) userByExternal.set(u.externalId, u.id)

  const marcosId = userByExternal.get(MARCOS_EXTERNAL_ID)
  if (!marcosId) return null

  const clients = await prisma.client.findMany({ select: { id: true, name: true, slug: true } })
  const clientByNorm = new Map<string, string>()
  for (const c of clients) {
    clientByNorm.set(normalize(c.name), c.id)
    clientByNorm.set(normalize(c.slug), c.id)
  }

  return { userByExternal, marcosId, clientByNorm }
}

// ─── Import genérico de tasks internas (internas / rituais / pagar) ────────────
async function importTaskLote(
  items: MigTaskInterna[],
  idx: Indexes,
): Promise<LoteResult> {
  const result = emptyResult()

  for (const item of items) {
    try {
      const idempotencyKey = `clickup-mig:${item.clickupId}`
      const existing = await prisma.task.findUnique({ where: { idempotencyKey }, select: { id: true } })
      if (existing) {
        result.puladas++
        continue
      }

      const assignedTo = (item.assigneeExternalId ? idx.userByExternal.get(item.assigneeExternalId) : undefined) ?? idx.marcosId

      // auxAssignees resolvidos por externalId; ignora não-resolvidos e o próprio
      // responsável (evita ruído). Dedupe pelo Set.
      const auxIds = new Set<string>()
      for (const ext of item.extraAssignees ?? []) {
        const uid = idx.userByExternal.get(ext)
        if (uid && uid !== assignedTo) auxIds.add(uid)
      }

      const tags = [item.papel.toLowerCase(), 'clickup']

      await prisma.task.create({
        data: {
          title: item.title,
          type: item.tipo as TaskType,
          status: 'A_FAZER',
          statusId: statusIdFor('A_FAZER'), // espelho FK (D-004)
          priority: item.priority,
          origin: 'MANUAL',
          dueDate: noonUtcFromMs(item.dueDateMs),
          requestedAt: new Date(),
          requesterId: assignedTo,
          assignedTo,
          clientId: null, // task interna (sem cliente)
          tags,
          idempotencyKey,
          ...(item.recurrence
            ? { recurrenceRule: item.recurrence as unknown as Prisma.InputJsonValue }
            : {}),
          ...(auxIds.size
            ? { auxAssignees: { create: [...auxIds].map((userId) => ({ userId })) } }
            : {}),
        },
      })
      result.criadas++
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        result.puladas++
        continue
      }
      result.erros.push(`${item.title}: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
    }
  }

  return result
}

// ─── Lote metas → Task interna (Goal exige clientId; metas são de agência) ─────
async function importMetas(idx: Indexes): Promise<LoteResult> {
  const result = emptyResult()

  for (const meta of MIG_METAS) {
    try {
      const idempotencyKey = `clickup-mig:${meta.clickupId}`
      const existing = await prisma.task.findUnique({ where: { idempotencyKey }, select: { id: true } })
      if (existing) {
        result.puladas++
        continue
      }

      const statusNota =
        meta.conquistada === false
          ? 'Status no ClickUp: NÃO conquistada.'
          : meta.conquistada === true
            ? 'Status no ClickUp: conquistada.'
            : 'Status no ClickUp: a conquistar.'
      const description = `Meta de agência (${meta.quarter}/2026) importada do ClickUp. ${statusNota}`

      await prisma.task.create({
        data: {
          title: meta.title,
          description,
          type: 'SIMPLES',
          status: 'A_FAZER',
          statusId: statusIdFor('A_FAZER'),
          priority: 'ALTA',
          origin: 'MANUAL',
          dueDate: noonUtcFromMs(meta.dueDateMs),
          requestedAt: new Date(),
          requesterId: idx.marcosId,
          assignedTo: idx.marcosId,
          clientId: null,
          tags: ['meta', meta.quarter.toLowerCase(), 'clickup'],
          idempotencyKey,
        },
      })
      result.criadas++
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        result.puladas++
        continue
      }
      result.erros.push(`${meta.title}: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
    }
  }

  return result
}

// ─── Lote contratos → reconciliação (NUNCA duplicar; Performli vence) ──────────
async function importContratos(idx: Indexes): Promise<LoteResult> {
  const result = emptyResult()

  for (const c of MIG_CONTRATOS) {
    try {
      // Match do cliente por normalize dos aliases.
      let clientId: string | null = null
      for (const alias of c.clientAliases) {
        const hit = idx.clientByNorm.get(normalize(alias))
        if (hit) { clientId = hit; break }
      }
      if (!clientId) {
        result.naoConciliados.push(c.nomeClickUp)
        continue
      }

      // Regra do dono: se JÁ existe Contract VIGENTE, o Performli vence.
      const jaTem = await prisma.contract.findFirst({
        where: { clientId, status: 'VIGENTE' },
        select: { id: true },
      })
      if (jaTem) {
        result.puladas++
        continue
      }

      const endDate = new Date(c.vigenciaFimMs)
      const startDate = new Date(endDate)
      startDate.setUTCMonth(startDate.getUTCMonth() - 6) // ciclo de fee padrão (documentado)

      const created = await prisma.contract.create({
        data: {
          clientId,
          responsibleId: idx.marcosId,
          status: 'VIGENTE',
          type: 'FEE_MENSAL',
          feeValue: 0, // API do ClickUp não expõe o fee — Marcos completa (ver notes)
          startDate,
          endDate,
          notes: `${c.nomeClickUp} — importado do ClickUp: ${c.clickupId}. Fee a completar (não exposto pela API).`,
        },
        select: { id: true },
      })

      // Amarração cliente↔contrato.
      await prisma.client.update({
        where: { id: clientId },
        data: { contractStart: startDate, contractEndDate: endDate },
      })

      await writeAuditLog({
        action: 'contract.importClickup',
        entityType: 'Contract',
        entityId: created.id,
        clientId,
        metadata: { clickupId: c.clickupId, nomeClickUp: c.nomeClickUp, endDate: endDate.toISOString() },
      })

      result.criadas++
    } catch (err) {
      result.erros.push(`${c.nomeClickUp}: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
    }
  }

  return result
}

/**
 * Executa um (ou todos) os lotes da migração ClickUp. Retorna um mapa por lote
 * com { criadas, puladas, naoConciliados, erros }.
 */
export async function migrarClickUp(lote: LoteName): Promise<MigrarResult> {
  const idx = await buildIndexes()
  if (!idx) {
    const fail: LoteResult = {
      ...emptyResult(),
      erros: ['Usuário ADMIN Marcos (externalId 152690431) não encontrado — migração abortada antes de escrever.'],
    }
    return { internas: fail }
  }

  const out: MigrarResult = {}
  const run = lote === 'tudo'

  if (run || lote === 'internas') out.internas = await importTaskLote(MIG_INTERNAS, idx)
  if (run || lote === 'rituais') out.rituais = await importTaskLote(MIG_RITUAIS, idx)
  if (run || lote === 'pagar') out.pagar = await importTaskLote(MIG_CONTAS_PAGAR, idx)
  if (run || lote === 'metas') out.metas = await importMetas(idx)
  if (run || lote === 'contratos') out.contratos = await importContratos(idx)

  await writeAuditLog({
    action: 'clickup.migrar',
    entityType: 'Task',
    entityId: `migracao-${lote}`,
    metadata: {
      lote,
      resumo: Object.fromEntries(
        Object.entries(out).map(([k, v]) => [
          k,
          { criadas: v.criadas, puladas: v.puladas, naoConciliados: v.naoConciliados.length, erros: v.erros.length },
        ]),
      ),
    },
  })

  return out
}
