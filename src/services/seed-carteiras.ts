/**
 * Seed das carteiras (dados reais das gestões de tráfego + visão consolidada
 * [TODOS]). Preenche por cliente: gestor, tipo de negócio, plataformas,
 * produtos (serviço), investimentos, ROAS mínimo, resultado, etapa, sala de
 * guerra, relacionamento, NPS e curva.
 *
 * Idempotente: casa o cliente pelo nome (normalizado) ou slug e faz update;
 * garante o gestor como atribuição primária (posse). Clientes não encontrados
 * são reportados (não cria clientes novos — não inventa).
 *
 * Reconciliação: getCancelCandidates() retorna os clientes ATIVOS que NÃO estão
 * na carteira consolidada — candidatos a cancelamento (a decisão/execução do
 * cancelamento é explícita, não roda aqui).
 */

import { prisma } from '@/lib/prisma'
import { runClientOnboarding } from '@/services/client-onboarding'
import { runClientOffboarding } from '@/services/client-offboarding'
import type {
  BusinessType,
  ClientResultado,
  ClientEtapa,
  ClientRelacionamento,
  ClientNps,
  ClientCurva,
} from '@prisma/client'

type Gestor = 'pablo' | 'leandro' | 'marcos' | null

type CarteiraRow = {
  match: string[]
  gestor: Gestor
  businessType: BusinessType
  plataformas: string[]
  produtos: string[]
  resultado: ClientResultado
  etapa: ClientEtapa
  salaDeGuerra: boolean
  relacionamento: ClientRelacionamento
  nps: ClientNps
  curva: ClientCurva
  investimentoMeta: number | null
  investimentoGoogle: number | null
  investimentoTiktok: number | null
  roasMinimo: number | null
}

const GESTOR_EXTERNAL_ID: Record<'pablo' | 'leandro' | 'marcos', string> = {
  pablo: '254576012',
  leandro: '81516815',
  marcos: '152690431',
}

const TP = 'Tráfego Pago'
const CRM = 'CRM Zoppy'
const TRAQ = 'Traqueamento'

const CARTEIRAS: CarteiraRow[] = [
  // ── PABLO ──────────────────────────────────────────────────────────────────
  { match: ['Leticia Store'], gestor: 'pablo', businessType: 'ECOMMERCE', plataformas: ['Meta'], produtos: [TP], resultado: 'PESSIMO', etapa: 'OTIMIZACAO', salaDeGuerra: true, relacionamento: 'OTIMO', nps: 'DETRATOR', curva: 'B', investimentoMeta: 5000, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 7 },
  { match: ['Laralu', 'Contrato | Luana', 'Luana'], gestor: 'pablo', businessType: 'LOCAL', plataformas: ['Meta'], produtos: [TP], resultado: 'RUIM', etapa: 'OTIMIZACAO', salaDeGuerra: true, relacionamento: 'REGULAR', nps: 'DETRATOR', curva: 'B', investimentoMeta: 2500, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 7 },
  { match: ['Planet Imports'], gestor: 'pablo', businessType: 'LOCAL', plataformas: ['Meta'], produtos: [TP], resultado: 'REGULAR', etapa: 'MONITORAMENTO', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'NEUTRO', curva: 'C', investimentoMeta: 800, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 3 },
  { match: ['Lalluzi Store', 'Lalluzi'], gestor: 'pablo', businessType: 'ECOMMERCE', plataformas: ['Meta', 'Google'], produtos: [TP, CRM, TRAQ], resultado: 'REGULAR', etapa: 'MONITORAMENTO', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'NEUTRO', curva: 'A', investimentoMeta: 7500, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 7 },
  { match: ['Draft Shop', 'Draft'], gestor: 'pablo', businessType: 'LOCAL', plataformas: ['Meta'], produtos: [TP], resultado: 'REGULAR', etapa: 'MONITORAMENTO', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'DETRATOR', curva: 'B', investimentoMeta: 1500, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 10 },
  { match: ['Dr. Auyber', 'Dr Auyber'], gestor: 'pablo', businessType: 'LOCAL', plataformas: ['Meta'], produtos: [TP], resultado: 'BOM', etapa: 'MONITORAMENTO', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'B', investimentoMeta: 2500, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: null },
  { match: ['Lalolli', 'Contrato | Laura', 'Laura'], gestor: 'pablo', businessType: 'ECOMMERCE', plataformas: ['Meta'], produtos: [TP], resultado: 'BOM', etapa: 'MONITORAMENTO', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'B', investimentoMeta: 2000, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 6 },
  { match: ['DonnaSo Pastelaria', 'DonnaSo', 'Donna Sô', 'Donna So', 'Donna Sô Pastelaria'], gestor: 'pablo', businessType: 'LOCAL', plataformas: ['Meta'], produtos: [TP], resultado: 'OTIMO', etapa: 'ESCALA', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'B', investimentoMeta: 2000, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 8 },
  { match: ['Brazolli', 'Brazolli Pizza & Burger'], gestor: 'pablo', businessType: 'LOCAL', plataformas: ['Meta'], produtos: [TP], resultado: 'OTIMO', etapa: 'ESCALA', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'B', investimentoMeta: 3000, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 8 },
  { match: ['Via Miami RP', 'Via Miami', 'Contrato | Via Miami RP'], gestor: 'pablo', businessType: 'LOCAL', plataformas: ['Meta'], produtos: [TP], resultado: 'OTIMO', etapa: 'MONITORAMENTO', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'C', investimentoMeta: 2000, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 5 },
  { match: ['Family Pizzaria', 'Family Restaurante', 'Contrato | VICTOR', 'Victor'], gestor: 'pablo', businessType: 'LOCAL', plataformas: ['Meta'], produtos: [TP], resultado: 'OTIMO', etapa: 'MONITORAMENTO', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'B', investimentoMeta: 1500, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: null },

  // ── LEANDRO ────────────────────────────────────────────────────────────────
  { match: ['Michelle Rossi'], gestor: 'leandro', businessType: 'ECOMMERCE', plataformas: ['Meta', 'Google'], produtos: [TP, CRM, TRAQ], resultado: 'PESSIMO', etapa: 'OTIMIZACAO', salaDeGuerra: true, relacionamento: 'OTIMO', nps: 'DETRATOR', curva: 'B', investimentoMeta: 12000, investimentoGoogle: 1000, investimentoTiktok: 0, roasMinimo: 8 },
  { match: ['Catita Store', 'Contrato | Catita Store'], gestor: 'leandro', businessType: 'ECOMMERCE', plataformas: ['Meta'], produtos: [TP], resultado: 'PESSIMO', etapa: 'OTIMIZACAO', salaDeGuerra: true, relacionamento: 'OTIMO', nps: 'DETRATOR', curva: 'B', investimentoMeta: 2000, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 5 },
  { match: ['Lazulli', 'Use Lazuli', 'Lazuli Shop', 'Lazuli'], gestor: 'leandro', businessType: 'ECOMMERCE', plataformas: ['Meta'], produtos: [TP], resultado: 'RUIM', etapa: 'OTIMIZACAO', salaDeGuerra: true, relacionamento: 'OTIMO', nps: 'DETRATOR', curva: 'B', investimentoMeta: 4000, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 7 },
  { match: ['Lamici Brand', 'Lamici', 'Contrato | Rafaela', 'Rafaela'], gestor: 'leandro', businessType: 'ECOMMERCE', plataformas: ['Meta'], produtos: [TP], resultado: 'RUIM', etapa: 'OTIMIZACAO', salaDeGuerra: true, relacionamento: 'RUIM', nps: 'DETRATOR', curva: 'B', investimentoMeta: 2500, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 5 },
  { match: ['Tuca Oficial', 'Tuca Clothing', 'Tuca', 'Contrato | Pedro', 'Pedro'], gestor: 'leandro', businessType: 'B2B', plataformas: ['Meta'], produtos: [TP], resultado: 'RUIM', etapa: 'OTIMIZACAO', salaDeGuerra: true, relacionamento: 'REGULAR', nps: 'DETRATOR', curva: 'B', investimentoMeta: 2000, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 10 },
  // Skaebne (Rayane) removido da carteira ativa: não consta no print [TODOS] →
  // aparece em getCancelCandidates para confirmação humana antes de cancelar.
  { match: ['Soul By Dm', 'Soul By DM', 'Contrato | Marina', 'Marina'], gestor: 'leandro', businessType: 'ECOMMERCE', plataformas: ['Meta'], produtos: [TP], resultado: 'REGULAR', etapa: 'MONITORAMENTO', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'NEUTRO', curva: 'B', investimentoMeta: 2000, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 5 },
  { match: ['Beard Sports', 'Beard & Sports'], gestor: 'leandro', businessType: 'ECOMMERCE', plataformas: ['Meta', 'Google'], produtos: [TP], resultado: 'BOM', etapa: 'OTIMIZACAO', salaDeGuerra: false, relacionamento: 'REGULAR', nps: 'NEUTRO', curva: 'B', investimentoMeta: 3500, investimentoGoogle: 1000, investimentoTiktok: 0, roasMinimo: 10 },
  { match: ['Roupa Branca'], gestor: 'leandro', businessType: 'ECOMMERCE', plataformas: ['Meta', 'Google', 'Tiktok'], produtos: [TP], resultado: 'BOM', etapa: 'MONITORAMENTO', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'B', investimentoMeta: 1500, investimentoGoogle: 500, investimentoTiktok: 500, roasMinimo: 7 },
  { match: ['Outlet Mauá', 'Outlet Maua'], gestor: 'leandro', businessType: 'ECOMMERCE', plataformas: ['Meta', 'Google'], produtos: [TP, TRAQ], resultado: 'OTIMO', etapa: 'ESCALA', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'A', investimentoMeta: 13000, investimentoGoogle: 3000, investimentoTiktok: 0, roasMinimo: 8 },

  // ── MARCOS ─────────────────────────────────────────────────────────────────
  { match: ['Espaço Barbara Issas', 'Espaco Barbara Issas', 'Barbara Issas'], gestor: 'marcos', businessType: 'ECOMMERCE', plataformas: ['Meta', 'Google', 'Tiktok'], produtos: [TP, CRM, TRAQ], resultado: 'BOM', etapa: 'MONITORAMENTO', salaDeGuerra: false, relacionamento: 'REGULAR', nps: 'PROMOTOR', curva: 'A', investimentoMeta: 10000, investimentoGoogle: 1500, investimentoTiktok: 0, roasMinimo: 11 },
  { match: ['Duplo Sentido Varejo', 'Duplo Sentido [Varejo]', 'Contrato | Daniela', 'Daniela'], gestor: 'marcos', businessType: 'ECOMMERCE', plataformas: ['Meta', 'Google'], produtos: [TP], resultado: 'BOM', etapa: 'MONITORAMENTO', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'A', investimentoMeta: 1000, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 5 },
  { match: ['Duplo Sentido Atacado', 'Duplo Sentido [Atacado]'], gestor: 'marcos', businessType: 'B2B', plataformas: ['Meta'], produtos: [TP], resultado: 'BOM', etapa: 'MONITORAMENTO', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'A', investimentoMeta: 4000, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 10 },
  { match: ['Bambola', 'Contrato | Maitê', 'Maitê', 'Maite'], gestor: 'marcos', businessType: 'ECOMMERCE', plataformas: ['Meta', 'Google'], produtos: [TP, CRM], resultado: 'BOM', etapa: 'MONITORAMENTO', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'A', investimentoMeta: 3000, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 8 },
  { match: ['Lavinny', 'Lavinny Store', 'Contrato | Lavinny Store'], gestor: 'marcos', businessType: 'ECOMMERCE', plataformas: ['Meta', 'Google'], produtos: [TP, CRM, TRAQ], resultado: 'BOM', etapa: 'MONITORAMENTO', salaDeGuerra: false, relacionamento: 'REGULAR', nps: 'PROMOTOR', curva: 'B', investimentoMeta: 6000, investimentoGoogle: 500, investimentoTiktok: 0, roasMinimo: 8 },
  { match: ['New Man Store', 'New Man', 'Contrato | João', 'João', 'Joao'], gestor: 'marcos', businessType: 'ECOMMERCE', plataformas: ['Meta', 'Google'], produtos: [TP], resultado: 'BOM', etapa: 'MONITORAMENTO', salaDeGuerra: false, relacionamento: 'REGULAR', nps: 'PROMOTOR', curva: 'A', investimentoMeta: 10000, investimentoGoogle: 1000, investimentoTiktok: 0, roasMinimo: 7 },
  { match: ['My Muse', 'My Muse BR'], gestor: 'marcos', businessType: 'ECOMMERCE', plataformas: ['Meta', 'Google'], produtos: [TP, CRM, TRAQ], resultado: 'OTIMO', etapa: 'ESCALA', salaDeGuerra: false, relacionamento: 'REGULAR', nps: 'PROMOTOR', curva: 'B', investimentoMeta: 5000, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 8 },
  { match: ['Tayna Moda Feminina', 'Contrato | Tayna Moda Feminina'], gestor: 'marcos', businessType: 'ECOMMERCE', plataformas: ['Meta', 'Google'], produtos: [TP, CRM, TRAQ], resultado: 'OTIMO', etapa: 'ESCALA', salaDeGuerra: false, relacionamento: 'REGULAR', nps: 'PROMOTOR', curva: 'A', investimentoMeta: 5000, investimentoGoogle: 500, investimentoTiktok: 0, roasMinimo: 7 },

  // ── Novos na carteira [TODOS] (gestor a definir) ────────────────────────────
  { match: ['Svn Atacado', 'Svn [Atacado]'], gestor: null, businessType: 'B2B', plataformas: ['Meta'], produtos: [TP], resultado: 'OTIMO', etapa: 'OTIMIZACAO', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'B', investimentoMeta: null, investimentoGoogle: null, investimentoTiktok: null, roasMinimo: null },
  { match: ['Svn Varejo', 'Svn [Varejo]'], gestor: null, businessType: 'ECOMMERCE', plataformas: ['Meta'], produtos: [TP], resultado: 'OTIMO', etapa: 'OTIMIZACAO', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'B', investimentoMeta: null, investimentoGoogle: null, investimentoTiktok: null, roasMinimo: null },
]

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Todos os nomes candidatos da carteira consolidada (para reconciliação). */
function masterNormNames(): Set<string> {
  const set = new Set<string>()
  for (const row of CARTEIRAS) for (const m of row.match) set.add(normalize(m))
  return set
}

export async function seedCarteiras(): Promise<{
  updated: number
  notFound: string[]
  gestoresMissing: string[]
}> {
  const gestorIds: Partial<Record<'pablo' | 'leandro' | 'marcos', string>> = {}
  const gestoresMissing: string[] = []
  for (const g of ['pablo', 'leandro', 'marcos'] as const) {
    const u = await prisma.user.findUnique({ where: { externalId: GESTOR_EXTERNAL_ID[g] }, select: { id: true } })
    if (u) gestorIds[g] = u.id
    else gestoresMissing.push(g)
  }

  const clients = await prisma.client.findMany({ select: { id: true, name: true, slug: true } })
  const byNorm = new Map<string, string>()
  for (const c of clients) {
    byNorm.set(normalize(c.name), c.id)
    byNorm.set(normalize(c.slug), c.id)
  }

  let updated = 0
  const notFound: string[] = []

  for (const row of CARTEIRAS) {
    const gestorId = row.gestor ? gestorIds[row.gestor] : undefined
    let clientId: string | undefined
    for (const cand of row.match) {
      const hit = byNorm.get(normalize(cand))
      if (hit) { clientId = hit; break }
    }
    if (!clientId) {
      notFound.push(row.match[0])
      continue
    }

    try {
      await prisma.client.update({
        where: { id: clientId },
        data: {
          ...(gestorId ? { gestorId } : {}),
          businessType: row.businessType,
          plataformas: row.plataformas,
          produtos: row.produtos,
          resultado: row.resultado,
          etapa: row.etapa,
          salaDeGuerra: row.salaDeGuerra,
          relacionamento: row.relacionamento,
          nps: row.nps,
          curva: row.curva,
          investimentoMeta: row.investimentoMeta,
          investimentoGoogle: row.investimentoGoogle,
          investimentoTiktok: row.investimentoTiktok,
          roasMinimo: row.roasMinimo,
        },
      })

      if (gestorId) {
        await prisma.clientAssignment.updateMany({
          where: { clientId, isPrimary: true, NOT: { userId: gestorId } },
          data: { isPrimary: false },
        })
        const existing = await prisma.clientAssignment.findUnique({
          where: { clientId_userId: { clientId, userId: gestorId } },
          select: { id: true },
        })
        if (existing) {
          await prisma.clientAssignment.update({ where: { id: existing.id }, data: { isPrimary: true } })
        } else {
          await prisma.clientAssignment.create({ data: { clientId, userId: gestorId, isPrimary: true } })
        }
      }

      updated++
    } catch {
      notFound.push(`${row.match[0]} (erro ao atualizar)`)
    }
  }

  return { updated, notFound, gestoresMissing }
}

/**
 * Reconciliação (LISTA APENAS — não cancela). Retorna os clientes ATIVOS que
 * não estão na carteira consolidada [TODOS] — candidatos a cancelamento, para
 * confirmação humana antes de churnar.
 */
export async function getCancelCandidates(): Promise<{ id: string; name: string; slug: string }[]> {
  const master = masterNormNames()
  const active = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, slug: true },
  })
  return active.filter((c) => !master.has(normalize(c.name)) && !master.has(normalize(c.slug)))
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Cria (idempotente por slug) os clientes novos que entraram na carteira e não
 * existem ainda. Svn Varejo recebe o contrato do Esj Confecções (fee R$2.500,
 * 26/06→26/12/2026, vencimento dia 5). Svn Atacado fica sem contrato (marcado
 * precisaCompletarCadastro). Roda o onboarding de cada um após criar.
 */
export async function createNovosClientes(): Promise<{ created: string[]; skipped: string[] }> {
  const created: string[] = []
  const skipped: string[] = []

  const d = (iso: string) => new Date(`${iso}T00:00:00`)

  // Gestor dos novos: Marcos (externalId ClickUp 152690431).
  const marcos = await prisma.user.findUnique({ where: { externalId: '152690431' }, select: { id: true } })
  const marcosId = marcos?.id ?? null

  async function ensureGestor(clientId: string) {
    if (!marcosId) return
    await prisma.client.update({ where: { id: clientId }, data: { gestorId: marcosId } })
    await prisma.clientAssignment.updateMany({
      where: { clientId, isPrimary: true, NOT: { userId: marcosId } },
      data: { isPrimary: false },
    })
    const a = await prisma.clientAssignment.findUnique({
      where: { clientId_userId: { clientId, userId: marcosId } },
      select: { id: true },
    })
    if (a) await prisma.clientAssignment.update({ where: { id: a.id }, data: { isPrimary: true } })
    else await prisma.clientAssignment.create({ data: { clientId, userId: marcosId, isPrimary: true } })
  }

  type Novo = {
    name: string; slug: string; businessType: BusinessType; plataformas: string[]; produtos: string[]
    email: string | null; resultado: ClientResultado; etapa: ClientEtapa; salaDeGuerra: boolean
    relacionamento: ClientRelacionamento; nps: ClientNps; curva: ClientCurva
    investimentoMeta: number | null; investimentoGoogle: number | null; investimentoTiktok: number | null
    roasMinimo: number | null; fee: number; start: Date; end: Date; billingDueDay: number | null
  }

  const novos: Novo[] = [
    // ── Esj Confecções (marca Svn) — fatura só no Varejo ──────────────────────
    { name: 'Svn Varejo', slug: 'svn-varejo', businessType: 'ECOMMERCE', plataformas: ['Meta', 'Google'], produtos: [TP], email: 'adm@savannahbrand.com.br', resultado: 'OTIMO', etapa: 'OTIMIZACAO', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'B', investimentoMeta: 2000, investimentoGoogle: null, investimentoTiktok: null, roasMinimo: null, fee: 2500, start: d('2026-06-26'), end: d('2026-12-26'), billingDueDay: 5 },
    { name: 'Svn Atacado', slug: 'svn-atacado', businessType: 'B2B', plataformas: ['Meta'], produtos: [TP], email: 'adm@savannahbrand.com.br', resultado: 'OTIMO', etapa: 'OTIMIZACAO', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'B', investimentoMeta: null, investimentoGoogle: null, investimentoTiktok: null, roasMinimo: null, fee: 2500, start: d('2026-06-26'), end: d('2026-12-26'), billingDueDay: null },
    // ── Tayna Andressa Mota de Oliveira ───────────────────────────────────────
    { name: 'Tayna Moda Feminina', slug: 'tayna-moda-feminina', businessType: 'ECOMMERCE', plataformas: ['Meta', 'Google', 'Tiktok'], produtos: [TP, CRM, TRAQ], email: 'motatayna@icloud.com', resultado: 'OTIMO', etapa: 'ESCALA', salaDeGuerra: false, relacionamento: 'REGULAR', nps: 'PROMOTOR', curva: 'A', investimentoMeta: 5000, investimentoGoogle: 500, investimentoTiktok: 0, roasMinimo: 7, fee: 3500, start: d('2026-05-27'), end: d('2026-11-27'), billingDueDay: 25 },
    // ── Duplo Sentido (mesma empresa do Atacado) — fatura só no Varejo ────────
    { name: 'Duplo Sentido Varejo', slug: 'duplo-sentido-varejo', businessType: 'ECOMMERCE', plataformas: ['Meta', 'Google', 'Tiktok'], produtos: [TP], email: 'duplosentidodigital@gmail.com', resultado: 'BOM', etapa: 'MONITORAMENTO', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'A', investimentoMeta: 1000, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 5, fee: 2200, start: d('2026-01-08'), end: d('2026-07-08'), billingDueDay: 8 },
  ]

  for (const n of novos) {
    const existing = await prisma.client.findUnique({ where: { slug: n.slug }, select: { id: true } })
    if (existing) {
      await ensureGestor(existing.id)
      skipped.push(n.name)
      continue
    }

    const client = await prisma.client.create({
      data: {
        name: n.name, slug: n.slug, status: 'ACTIVE', pipelineStage: 'ATIVO',
        ...(marcosId ? { gestorId: marcosId } : {}),
        businessType: n.businessType, plataformas: n.plataformas, produtos: n.produtos, email: n.email,
        resultado: n.resultado, etapa: n.etapa, salaDeGuerra: n.salaDeGuerra,
        relacionamento: n.relacionamento, nps: n.nps, curva: n.curva,
        investimentoMeta: n.investimentoMeta, investimentoGoogle: n.investimentoGoogle,
        investimentoTiktok: n.investimentoTiktok, roasMinimo: n.roasMinimo,
        feeAmount: n.fee, contractValue: n.fee, contractStart: n.start, contractEndDate: n.end,
        // Fatura/cobrança só onde há billingDueDay (evita duplicar a mesma empresa).
        billingDueDay: n.billingDueDay,
      },
      select: { id: true },
    })

    await prisma.contract.create({
      data: { clientId: client.id, status: 'VIGENTE', type: 'FEE_MENSAL', feeValue: n.fee, startDate: n.start, endDate: n.end, noticeDays: 30 },
    })

    await ensureGestor(client.id)
    try { await runClientOnboarding(client.id) } catch { /* best-effort */ }
    created.push(n.name)
  }

  // ── Contrato do Duplo Sentido Atacado (cliente já existente) ────────────────
  // Mesmo contrato do Varejo (fee R$2.200, 08/01→08/07/2026), SEM fatura para
  // não duplicar a cobrança da mesma empresa. Idempotente (só cria Contract se
  // ainda não houver um vigente).
  const atacado = await prisma.client.findFirst({
    where: { OR: [{ slug: 'duplo-sentido-atacado' }, { name: { equals: 'Duplo Sentido Atacado', mode: 'insensitive' } }] },
    select: { id: true, contracts: { where: { status: 'VIGENTE' }, select: { id: true }, take: 1 } },
  })
  if (atacado) {
    await prisma.client.update({
      where: { id: atacado.id },
      data: { feeAmount: 2200, contractValue: 2200, contractStart: d('2026-01-08'), contractEndDate: d('2026-07-08'), billingDueDay: null },
    })
    if (atacado.contracts.length === 0) {
      await prisma.contract.create({
        data: { clientId: atacado.id, status: 'VIGENTE', type: 'FEE_MENSAL', feeValue: 2200, startDate: d('2026-01-08'), endDate: d('2026-07-08'), noticeDays: 30 },
      })
    }
    skipped.push('Duplo Sentido Atacado (contrato)')
  }

  return { created, skipped }
}

/**
 * Cancela (churn + offboarding) os clientes fora da carteira consolidada.
 * Executa a mesma cadeia do offboarding automático (suspende recorrências,
 * cria tarefa de offboarding, arquiva mantendo histórico). Retorna os nomes
 * cancelados para o operador conferir.
 */
export async function cancelarForaDaCarteira(): Promise<{ cancelled: string[] }> {
  const candidates = await getCancelCandidates()
  const cancelled: string[] = []
  for (const c of candidates) {
    try {
      await prisma.client.update({
        where: { id: c.id },
        data: { status: 'CHURNED', pipelineStage: 'CHURNED' },
      })
      await runClientOffboarding(c.id)
      cancelled.push(c.name)
    } catch {
      // best-effort: falha em um não impede os demais
    }
  }
  return { cancelled }
}
