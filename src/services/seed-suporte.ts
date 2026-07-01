/**
 * Importa (idempotente) as 21 demandas reais da lista "Suporte" do ClickUp
 * (time de CS da Arkza) para o Hub de Suporte do Performli, como Tasks de
 * suporte (isSupport=true).
 *
 * Idempotência: cada item carrega idempotencyKey = `clickup-suporte:{clickupId}`.
 * Se já existir uma Task com essa chave, o item é pulado (não duplica). Roda
 * quantas vezes for preciso.
 *
 * Matching de cliente: pelo nome normalizado (mesmo padrão do seed-carteiras,
 * reutilizando o helper `normalize` e os aliases reais das carteiras). Item sem
 * cliente encontrado é importado com clientId null e reportado em `semCliente`.
 *
 * Responsável (assignedTo): resolvido por User.externalId do assignee original
 * do ClickUp. Fallback: CS atribuída ao cliente → ADMIN Marcos (externalId
 * 152690431). Como `assignedTo` é obrigatório no model Task, sempre há um
 * responsável.
 *
 * Auditoria: grava AuditLog action 'support.importClickup' com o resumo.
 */

import { prisma } from '@/lib/prisma'
import { normalize } from '@/services/seed-carteiras'
import { writeAuditLog } from '@/lib/audit'
import type { SupportCategory, TaskPriority } from '@prisma/client'

// externalId (ClickUp) do ADMIN Marcos — fallback final de responsável.
const MARCOS_EXTERNAL_ID = '152690431'

type SuporteItem = {
  clickupId: string
  title: string
  /** Aliases de nome do cliente (normalizados no matching). null = sem cliente. */
  clientAliases: string[] | null
  /** externalId (ClickUp) do responsável original. null = sem assignee. */
  assigneeExternalId: string | null
  dueDateMs: number
  priority: TaskPriority
  category: SupportCategory
}

// Nomes de cliente usam os MESMOS aliases reais do seed-carteiras (ex.: "Use
// Lazuli" casa via 'Lazulli'; "Espaço Barbara" via 'Espaço Barbara Issas').
const ITEMS: SuporteItem[] = [
  { clickupId: '868k7g4uk', title: 'SVN - NOVOS CRIATIVOS', clientAliases: ['Svn Varejo', 'Svn [Varejo]'], assigneeExternalId: '152690431', dueDateMs: 1782889200000, priority: 'CRITICA', category: 'TRAFEGO' },
  { clickupId: '868k7g4j7', title: 'CATITA - NOVOS CRIATIVOS', clientAliases: ['Catita Store'], assigneeExternalId: null, dueDateMs: 1782975600000, priority: 'CRITICA', category: 'TRAFEGO' },
  { clickupId: '868k79w89', title: 'PLANET - PIX', clientAliases: ['Planet Imports'], assigneeExternalId: '254576012', dueDateMs: 1783407600000, priority: 'CRITICA', category: 'TRAFEGO' },
  { clickupId: '868k796cd', title: 'LETICIA - NOVOS CRIATIVOS', clientAliases: ['Leticia Store'], assigneeExternalId: '254576012', dueDateMs: 1782889200000, priority: 'CRITICA', category: 'TRAFEGO' },
  { clickupId: '868k7830t', title: 'BÁRBARA - NOVOS CRIATIVOS', clientAliases: ['Espaço Barbara Issas', 'Espaco Barbara Issas', 'Barbara Issas'], assigneeExternalId: '152690431', dueDateMs: 1782889200000, priority: 'CRITICA', category: 'TRAFEGO' },
  { clickupId: '868k6t888', title: 'MICHELLE - NOVOS CRIATIVOS', clientAliases: ['Michelle Rossi'], assigneeExternalId: '81516815', dueDateMs: 1782889200000, priority: 'CRITICA', category: 'TRAFEGO' },
  { clickupId: '868k6gzec', title: 'DRAFT - ORÇAMENTO DA SEMANA', clientAliases: ['Draft Shop', 'Draft'], assigneeExternalId: '254576012', dueDateMs: 1783321200000, priority: 'CRITICA', category: 'TRAFEGO' },
  { clickupId: '868k6gzdf', title: 'PLANET - REVISAR SALDO', clientAliases: ['Planet Imports'], assigneeExternalId: '254576012', dueDateMs: 1783321200000, priority: 'CRITICA', category: 'TRAFEGO' },
  { clickupId: '868k651vp', title: 'Draft/Sports - COBRAR FEEDBACK DAS VENDAS', clientAliases: ['Draft Shop', 'Draft'], assigneeExternalId: null, dueDateMs: 1782975600000, priority: 'MEDIA', category: 'SUCESSO_DO_CLIENTE' },
  { clickupId: '868k651v7', title: 'DUPLO - COBRAR PLANILHA ATUALIZADA', clientAliases: ['Duplo Sentido Atacado', 'Duplo Sentido [Atacado]'], assigneeExternalId: '87373550', dueDateMs: 1783321200000, priority: 'CRITICA', category: 'SUCESSO_DO_CLIENTE' },
  { clickupId: '868k5bm6y', title: 'OUTLET MAUA - GERAR RELATORIO MENSAL CRM', clientAliases: ['Outlet Mauá', 'Outlet Maua'], assigneeExternalId: '81525390', dueDateMs: 1784703600000, priority: 'CRITICA', category: 'DEMANDA_DA_AGENCIA' },
  { clickupId: '868k5bm6k', title: 'LAZULI - GERAR RELATORIO MENSAL CRM', clientAliases: ['Lazulli', 'Use Lazuli', 'Lazuli Shop', 'Lazuli'], assigneeExternalId: '81525390', dueDateMs: 1783839600000, priority: 'CRITICA', category: 'DEMANDA_DA_AGENCIA' },
  { clickupId: '868k5bm5t', title: 'ROUPA BRANCA - RELATORIO MENSAL CRM', clientAliases: ['Roupa Branca'], assigneeExternalId: '81525390', dueDateMs: 1783839600000, priority: 'CRITICA', category: 'DEMANDA_DA_AGENCIA' },
  { clickupId: '868k57q11', title: 'DUPLO - PIX', clientAliases: ['Duplo Sentido Atacado', 'Duplo Sentido [Atacado]'], assigneeExternalId: '152690431', dueDateMs: 1782975600000, priority: 'CRITICA', category: 'TRAFEGO' },
  { clickupId: '868k2ny1y', title: 'BAMBOLA - TRAQUEAMENTO', clientAliases: ['Bambola'], assigneeExternalId: '81525390', dueDateMs: 1782889200000, priority: 'CRITICA', category: 'DEMANDA_DA_AGENCIA' },
  { clickupId: '868k2ny18', title: 'LAZULI - TRAQUEAMENTO', clientAliases: ['Lazulli', 'Use Lazuli', 'Lazuli Shop', 'Lazuli'], assigneeExternalId: '81525390', dueDateMs: 1782889200000, priority: 'CRITICA', category: 'DEMANDA_DA_AGENCIA' },
  { clickupId: '868k05w0t', title: 'CRIAR ESTRATÉGIA CRM - MICHELLE', clientAliases: ['Michelle Rossi'], assigneeExternalId: '81525390', dueDateMs: 1782889200000, priority: 'CRITICA', category: 'DEMANDA_DA_AGENCIA' },
  { clickupId: '868jxzegd', title: 'ENTREGA DO CALENDÁRIO DE DATAS SAZONAIS', clientAliases: null, assigneeExternalId: '87373550', dueDateMs: 1783234800000, priority: 'CRITICA', category: 'TRAFEGO' },
  { clickupId: '868jpak36', title: 'DR AUYBER - ENVIAR SALDO MENSAL', clientAliases: ['Dr. Auyber', 'Dr Auyber'], assigneeExternalId: '254576012', dueDateMs: 1783321200000, priority: 'CRITICA', category: 'TRAFEGO' },
  { clickupId: '868jpajw5', title: 'DONNA SÔ - PIX', clientAliases: ['Donna Sô', 'Donna So', 'DonnaSo', 'Donna Sô Pastelaria', 'DonnaSo Pastelaria'], assigneeExternalId: '254576012', dueDateMs: 1783321200000, priority: 'CRITICA', category: 'TRAFEGO' },
  { clickupId: '868jpajtn', title: 'BRAZOLLI - PIX', clientAliases: ['Brazolli', 'Brazolli Pizza & Burger'], assigneeExternalId: '254576012', dueDateMs: 1783321200000, priority: 'CRITICA', category: 'TRAFEGO' },
]

export type ImportSuporteResult = {
  criadas: number
  puladas: number
  semCliente: string[]
  erros: string[]
}

export async function importarSuporteClickUp(): Promise<ImportSuporteResult> {
  const result: ImportSuporteResult = { criadas: 0, puladas: 0, semCliente: [], erros: [] }

  // ── Índice de clientes por nome/slug normalizado ────────────────────────────
  const clients = await prisma.client.findMany({ select: { id: true, name: true, slug: true } })
  const clientByNorm = new Map<string, string>()
  for (const c of clients) {
    clientByNorm.set(normalize(c.name), c.id)
    clientByNorm.set(normalize(c.slug), c.id)
  }

  // ── Índice de usuários por externalId ───────────────────────────────────────
  const users = await prisma.user.findMany({
    where: { externalId: { not: null } },
    select: { id: true, externalId: true },
  })
  const userByExternal = new Map<string, string>()
  for (const u of users) if (u.externalId) userByExternal.set(u.externalId, u.id)

  const marcosId = userByExternal.get(MARCOS_EXTERNAL_ID)
  if (!marcosId) {
    // Sem o fallback final não conseguimos garantir assignedTo (obrigatório).
    result.erros.push('Usuário ADMIN Marcos (externalId 152690431) não encontrado — abortado antes de criar.')
    return result
  }

  // Resolve a CS primária/atribuída de um cliente (fallback intermediário).
  async function resolveClientCs(clientId: string): Promise<string | null> {
    const assignment = await prisma.clientAssignment.findFirst({
      where: { clientId, user: { operationalRole: 'CS', active: true } },
      select: { userId: true },
    })
    return assignment?.userId ?? null
  }

  for (const item of ITEMS) {
    try {
      const idempotencyKey = `clickup-suporte:${item.clickupId}`

      const existing = await prisma.task.findUnique({
        where: { idempotencyKey },
        select: { id: true, clientId: true },
      })

      // Cliente por matching de nome (aliases).
      let clientId: string | null = null
      if (item.clientAliases) {
        for (const alias of item.clientAliases) {
          const hit = clientByNorm.get(normalize(alias))
          if (hit) { clientId = hit; break }
        }
        if (!clientId) result.semCliente.push(`${item.title} (${item.clientAliases[0]})`)
      }

      if (existing) {
        // Cura re-execuções: se a demanda foi importada sem cliente e agora o
        // nome casa (alias corrigido / cliente criado depois), vincula.
        if (!existing.clientId && clientId) {
          await prisma.task.update({ where: { id: existing.id }, data: { clientId } })
        }
        result.puladas++
        continue
      }

      // Responsável: externalId → CS do cliente → Marcos (ADMIN).
      let assignedTo: string | undefined =
        item.assigneeExternalId ? userByExternal.get(item.assigneeExternalId) : undefined
      if (!assignedTo && clientId) {
        assignedTo = (await resolveClientCs(clientId)) ?? undefined
      }
      if (!assignedTo) assignedTo = marcosId

      await prisma.task.create({
        data: {
          title: item.title,
          isSupport: true,
          supportCategory: item.category,
          supportDirection: 'NOS_PARA_CLIENTE',
          type: 'CS',
          status: 'A_FAZER',
          priority: item.priority,
          origin: 'MANUAL',
          dueDate: new Date(item.dueDateMs),
          requestedAt: new Date(),
          requesterId: assignedTo,
          assignedTo,
          clientId,
          idempotencyKey,
        },
      })

      result.criadas++
    } catch (err) {
      result.erros.push(`${item.title}: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
    }
  }

  await writeAuditLog({
    action: 'support.importClickup',
    entityType: 'Task',
    entityId: 'seed-suporte',
    metadata: {
      criadas: result.criadas,
      puladas: result.puladas,
      semCliente: result.semCliente,
      erros: result.erros,
    },
  })

  return result
}
