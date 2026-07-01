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
  { match: ['Donna Sô', 'Donna So', 'Donna Sô Pastelaria'], gestor: 'pablo', businessType: 'LOCAL', plataformas: ['Meta'], produtos: [TP], resultado: 'OTIMO', etapa: 'ESCALA', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'B', investimentoMeta: 2000, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 8 },
  { match: ['Brazolli', 'Brazolli Pizza & Burger'], gestor: 'pablo', businessType: 'LOCAL', plataformas: ['Meta'], produtos: [TP], resultado: 'OTIMO', etapa: 'ESCALA', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'B', investimentoMeta: 3000, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 8 },
  { match: ['Via Miami RP', 'Via Miami', 'Contrato | Via Miami RP'], gestor: 'pablo', businessType: 'LOCAL', plataformas: ['Meta'], produtos: [TP], resultado: 'OTIMO', etapa: 'MONITORAMENTO', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'C', investimentoMeta: 2000, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 5 },
  { match: ['Family Pizzaria', 'Family Restaurante', 'Contrato | VICTOR', 'Victor'], gestor: 'pablo', businessType: 'LOCAL', plataformas: ['Meta'], produtos: [TP], resultado: 'OTIMO', etapa: 'MONITORAMENTO', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'B', investimentoMeta: 1500, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: null },

  // ── LEANDRO ────────────────────────────────────────────────────────────────
  { match: ['Michelle Rossi'], gestor: 'leandro', businessType: 'ECOMMERCE', plataformas: ['Meta', 'Google'], produtos: [TP, CRM, TRAQ], resultado: 'PESSIMO', etapa: 'OTIMIZACAO', salaDeGuerra: true, relacionamento: 'OTIMO', nps: 'DETRATOR', curva: 'B', investimentoMeta: 12000, investimentoGoogle: 1000, investimentoTiktok: 0, roasMinimo: 8 },
  { match: ['Catita Store', 'Contrato | Catita Store'], gestor: 'leandro', businessType: 'ECOMMERCE', plataformas: ['Meta'], produtos: [TP], resultado: 'PESSIMO', etapa: 'OTIMIZACAO', salaDeGuerra: true, relacionamento: 'OTIMO', nps: 'DETRATOR', curva: 'B', investimentoMeta: 2000, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 5 },
  { match: ['Use Lazuli', 'Lazuli Shop', 'Lazuli'], gestor: 'leandro', businessType: 'ECOMMERCE', plataformas: ['Meta'], produtos: [TP], resultado: 'RUIM', etapa: 'OTIMIZACAO', salaDeGuerra: true, relacionamento: 'OTIMO', nps: 'DETRATOR', curva: 'B', investimentoMeta: 4000, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 7 },
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
  { match: ['New Man', 'Contrato | João', 'João', 'Joao'], gestor: 'marcos', businessType: 'ECOMMERCE', plataformas: ['Meta', 'Google'], produtos: [TP], resultado: 'BOM', etapa: 'MONITORAMENTO', salaDeGuerra: false, relacionamento: 'REGULAR', nps: 'PROMOTOR', curva: 'A', investimentoMeta: 10000, investimentoGoogle: 1000, investimentoTiktok: 0, roasMinimo: 7 },
  { match: ['My Muse', 'My Muse BR'], gestor: 'marcos', businessType: 'ECOMMERCE', plataformas: ['Meta', 'Google'], produtos: [TP, CRM, TRAQ], resultado: 'OTIMO', etapa: 'ESCALA', salaDeGuerra: false, relacionamento: 'REGULAR', nps: 'PROMOTOR', curva: 'B', investimentoMeta: 5000, investimentoGoogle: 0, investimentoTiktok: 0, roasMinimo: 8 },
  { match: ['Arkza', 'Marcos Liossi'], gestor: 'marcos', businessType: 'B2B', plataformas: ['Meta'], produtos: [TP], resultado: 'OTIMO', etapa: 'ESCALA', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'A', investimentoMeta: 2000, investimentoGoogle: null, investimentoTiktok: null, roasMinimo: null },
  { match: ['Tayna Moda Feminina', 'Contrato | Tayna Moda Feminina'], gestor: 'marcos', businessType: 'ECOMMERCE', plataformas: ['Meta', 'Google'], produtos: [TP, CRM, TRAQ], resultado: 'OTIMO', etapa: 'ESCALA', salaDeGuerra: false, relacionamento: 'REGULAR', nps: 'PROMOTOR', curva: 'A', investimentoMeta: 5000, investimentoGoogle: 500, investimentoTiktok: 0, roasMinimo: 7 },

  // ── Novos na carteira [TODOS] (gestor a definir) ────────────────────────────
  { match: ['Svn Atacado', 'Svn [Atacado]'], gestor: null, businessType: 'B2B', plataformas: ['Meta'], produtos: [TP], resultado: 'OTIMO', etapa: 'OTIMIZACAO', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'B', investimentoMeta: null, investimentoGoogle: null, investimentoTiktok: null, roasMinimo: null },
  { match: ['Svn Varejo', 'Svn [Varejo]'], gestor: null, businessType: 'ECOMMERCE', plataformas: ['Meta'], produtos: [TP], resultado: 'OTIMO', etapa: 'OTIMIZACAO', salaDeGuerra: false, relacionamento: 'OTIMO', nps: 'PROMOTOR', curva: 'B', investimentoMeta: null, investimentoGoogle: null, investimentoTiktok: null, roasMinimo: null },
]

function normalize(s: string): string {
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

  const start = new Date('2026-06-26T00:00:00')
  const end = new Date('2026-12-26T00:00:00')
  const FEE = 2500 // fee mensal — igual para os dois (mesma empresa: Esj Confecções)

  const novos = [
    {
      name: 'Svn Varejo',
      slug: 'svn-varejo',
      businessType: 'ECOMMERCE' as BusinessType,
      plataformas: ['Meta', 'Google'],
      email: 'adm@savannahbrand.com.br' as string | null,
      resultado: 'OTIMO' as ClientResultado,
      etapa: 'OTIMIZACAO' as ClientEtapa,
      curva: 'B' as ClientCurva,
      nps: 'PROMOTOR' as ClientNps,
      relacionamento: 'OTIMO' as ClientRelacionamento,
      // Fatura financeira (cobrança) fica APENAS neste, para não duplicar a
      // cobrança da mesma empresa pagante.
      fatura: true,
      investimentoMeta: 2000 as number | null,
    },
    {
      name: 'Svn Atacado',
      slug: 'svn-atacado',
      businessType: 'B2B' as BusinessType,
      plataformas: ['Meta'],
      email: 'adm@savannahbrand.com.br' as string | null,
      resultado: 'OTIMO' as ClientResultado,
      etapa: 'OTIMIZACAO' as ClientEtapa,
      curva: 'B' as ClientCurva,
      nps: 'PROMOTOR' as ClientNps,
      relacionamento: 'OTIMO' as ClientRelacionamento,
      fatura: false, // sem fatura financeira (evita duplicidade)
      investimentoMeta: null as number | null,
    },
  ]

  for (const n of novos) {
    const existing = await prisma.client.findUnique({ where: { slug: n.slug }, select: { id: true } })
    if (existing) { skipped.push(n.name); continue }

    const client = await prisma.client.create({
      data: {
        name: n.name,
        slug: n.slug,
        status: 'ACTIVE',
        pipelineStage: 'ATIVO',
        businessType: n.businessType,
        plataformas: n.plataformas,
        produtos: [TP],
        email: n.email,
        resultado: n.resultado,
        etapa: n.etapa,
        curva: n.curva,
        nps: n.nps,
        relacionamento: n.relacionamento,
        // Dados de contrato IGUAIS para ambos.
        feeAmount: FEE,
        contractValue: FEE,
        contractStart: start,
        contractEndDate: end,
        investimentoMeta: n.investimentoMeta,
        // Fatura/cobrança (vencimento) só no que recebe a fatura financeira.
        billingDueDay: n.fatura ? 5 : null,
      },
      select: { id: true },
    })

    // Contrato formal (VIGENTE) — IGUAL para os dois.
    await prisma.contract.create({
      data: {
        clientId: client.id,
        status: 'VIGENTE',
        type: 'FEE_MENSAL',
        feeValue: FEE,
        startDate: start,
        endDate: end,
        noticeDays: 30,
      },
    })

    // Onboarding: nasce com a operação (15 recorrentes + tarefas iniciais).
    try { await runClientOnboarding(client.id) } catch { /* best-effort */ }

    created.push(n.name)
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
