/**
 * Seed idempotente da operação real da Arkza (time + 15 templates recorrentes
 * fixos + regras de recorrência). NÃO cria clientes fake — a produção já tem os
 * clientes reais. Roda quantas vezes for preciso sem duplicar (upsert por chave
 * natural: email/externalId para User, code para TaskTemplate).
 *
 * Fonte: seções 5 e 8 do documento "Recriar ClickUp no Performli".
 *
 * Segurança: passwordHash de usuário NOVO é gerado a partir de senha ALEATÓRIA
 * forte (crypto.randomBytes) — nunca previsível. Usuários definem a senha via
 * fluxo de reset. passwordHash de usuário já existente NUNCA é sobrescrito.
 */

import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import type { Role, OperationalRole, AreaCode, TaskPriority, RecurrenceFrequency } from '@prisma/client'

// ── Time real (seção 5) ───────────────────────────────────────────────────────

type SeedUser = {
  slug: string
  name: string
  email: string | null
  externalId: string | null
  operationalRole: OperationalRole
  role: Role
}

const TEAM: SeedUser[] = [
  { slug: 'marcos-liossi',  name: 'Marcos Liossi',  email: 'marcosliossi@arkza.com.br', externalId: '152690431', operationalRole: 'HEAD',           role: 'ADMIN'   },
  { slug: 'leandro-strazzi', name: 'Leandro Strazzi', email: null,                       externalId: '81516815',  operationalRole: 'SUPERVISOR',     role: 'SUPERVISOR_TRAFEGO' },
  { slug: 'pablo-junior',   name: 'Pablo Júnior',   email: 'jjuniorpablo1@gmail.com',   externalId: '254576012', operationalRole: 'GESTOR',         role: 'GESTOR_TRAFEGO' },
  { slug: 'kyn-leonardo',   name: 'Kyn Leonardo',   email: null,                        externalId: '81525390',  operationalRole: 'CRM',            role: 'GESTOR_TRAFEGO' },
  { slug: 'leticia-perez',  name: 'Leticia Perez',  email: 'leticiaperez1812@gmail.com', externalId: '87373550', operationalRole: 'CS',             role: 'CS'      },
  { slug: 'red',            name: 'Red',            email: null,                        externalId: null,        operationalRole: 'ACOMPANHAMENTO', role: 'ANALISTA_TRAFEGO' },
]

// ── 15 templates recorrentes (seção 8) ────────────────────────────────────────

type SeedTemplate = {
  code: string
  name: string
  role: 'GESTOR' | 'CS' | 'CRM'
  area: AreaCode
  priority: TaskPriority
  description: string
  steps?: string[]
  recurrence: {
    frequency: RecurrenceFrequency
    dayOfWeek?: number   // 0=Dom..6=Sáb
    dayOfMonth?: number
    hour?: number
  }
}

const SOP_CHECKIN_SEMANAL = `📋 CHECK-IN SEMANAL DE CONTAS — COMO FAZER
Quando: toda segunda-feira, até as 12h.
Por que: o relatório do cliente e o check-in interno precisam contar a mesma história. Você diagnostica cada conta primeiro, e a IA gera o relatório alinhado.
Importante: feito por cliente. 10 clientes = 10 documentos + 10 relatórios até as 12h.

Passo 1 — Duplique o documento modelo (Arkza Processo Semanal) por cliente e renomeie.
Passo 2 — Abra o GA4 do cliente e tire prints da semana anterior: faturamento, investimento, ROAS, compras, sessões, ticket médio, taxa de conversão, gráficos de categoria e produto.
Passo 3 — Preencha as 6 perguntas do check-in com dados reais e hipótese clara (interno, não vai pro cliente). As perguntas 5 e 6 viram as ações e os pedidos no relatório.
Passo 4 — Salve a cópia do cliente em PDF.
Passo 5 — Envie o PDF + prints para a IA, que gera o relatório.
Passo 6 — Confira se os números batem e se o relatório fecha com pergunta de ativação (obrigatória).
Passo 7 — Envie ao cliente no WhatsApp, marcando ele na mensagem de fechamento.
Passo 8 — Suba todos os PDFs nesta tarefa até 12h de segunda e marque como concluída.`

const STEPS_CHECKIN_SEMANAL = [
  'Duplicar o documento modelo (Arkza Processo Semanal) por cliente e renomear',
  'Abrir o GA4 e tirar prints da semana anterior (faturamento, investimento, ROAS, compras, sessões, ticket médio, taxa de conversão, categoria e produto)',
  'Preencher as 6 perguntas do check-in com dados reais e hipótese clara',
  'Salvar a cópia do cliente em PDF',
  'Enviar o PDF + prints para a IA gerar o relatório',
  'Conferir se os números batem e se o relatório fecha com pergunta de ativação',
  'Enviar ao cliente no WhatsApp, marcando ele na mensagem de fechamento',
  'Subir todos os PDFs na tarefa até 12h de segunda e marcar como concluída',
]

const SOP_RESUMO_SEMANAL = `Prestação de Contas ao Cliente — Resumo Semanal
Quando: toda sexta-feira até as 17h.
Por que: o cliente precisa saber o que foi feito na conta. Cliente que entende confia mais e reclama menos.

Passo 1 — Liste o que foi feito na conta: revisões, ajustes de orçamento e motivo, mudanças de estrutura, novos públicos/criativos testados, pausas, negativações do Google.
Passo 2 — Escreva um resumo simples de até 3 linhas, em linguagem acessível, sem jargão.
Passo 3 — Termine com uma pergunta ou pedido de ativação (ex: "você sentiu diferença?", "consegue mandar criativos até quarta?").
Passo 4 — Envie o texto para a CS (Letícia) via sistema. Ela revisa e envia ao cliente.
Regra: não envie direto ao cliente. Sempre passa pela CS primeiro.`

const STEPS_RESUMO_SEMANAL = [
  'Listar o que foi feito na conta (revisões, ajustes de orçamento e motivo, mudanças de estrutura, novos públicos/criativos, pausas, negativações do Google)',
  'Escrever um resumo simples de até 3 linhas, em linguagem acessível, sem jargão',
  'Terminar com uma pergunta ou pedido de ativação',
  'Enviar o texto para a CS via sistema (não enviar direto ao cliente — sempre passa pela CS)',
]

const TEMPLATES: SeedTemplate[] = [
  {
    code: 'REC-CHECKIN-SEMANAL', name: 'Checkin Semanal', role: 'GESTOR', area: 'TRAFEGO', priority: 'ALTA',
    description: SOP_CHECKIN_SEMANAL, steps: STEPS_CHECKIN_SEMANAL,
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 1, hour: 12 },
  },
  {
    code: 'REC-OTIMIZACAO-SEMANAL', name: 'Otimização Semanal', role: 'GESTOR', area: 'TRAFEGO', priority: 'MEDIA',
    description: 'Otimização Semanal — revisar e otimizar as campanhas do cliente na semana corrente (orçamento, criativos, públicos e estrutura).',
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 1 },
  },
  {
    code: 'REC-RESUMO-SEMANAL', name: 'Resumo Semanal (Prestação de Contas)', role: 'GESTOR', area: 'TRAFEGO', priority: 'MEDIA',
    description: SOP_RESUMO_SEMANAL, steps: STEPS_RESUMO_SEMANAL,
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 5, hour: 17 },
  },
  {
    code: 'REC-CHECKIN-MENSAL', name: 'Checkin Mensal', role: 'GESTOR', area: 'TRAFEGO', priority: 'MEDIA',
    description: 'Checkin Mensal — consolidar o resultado do mês do cliente e planejar o mês seguinte.',
    recurrence: { frequency: 'MENSAL', dayOfMonth: 1, hour: 12 },
  },
  {
    code: 'REC-RELATORIO-MENSAL-CS', name: 'Envio do Relatório Mensal', role: 'CS', area: 'SUCESSO_CLIENTE', priority: 'MEDIA',
    description: 'Envio do Relatório Mensal — consolidar e enviar ao cliente o relatório mensal de resultados.',
    recurrence: { frequency: 'MENSAL', dayOfMonth: 1, hour: 14 },
  },
  {
    code: 'REC-RELATORIO-SEMANAL-CRM', name: 'Relatório Semanal [CRM]', role: 'CRM', area: 'CRM_AUTOMACAO', priority: 'MEDIA',
    description: 'Relatório Semanal [CRM] — consolidar e enviar o relatório semanal de CRM/automação (Zoppy) do cliente.',
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 1, hour: 12 },
  },
  {
    code: 'REC-RELATORIO-MENSAL-CRM', name: 'Relatório Mensal [CRM]', role: 'CRM', area: 'CRM_AUTOMACAO', priority: 'MEDIA',
    description: 'Relatório Mensal [CRM] — consolidar e enviar o relatório mensal de CRM/automação (Zoppy) do cliente.',
    recurrence: { frequency: 'MENSAL', dayOfMonth: 1, hour: 12 },
  },
  {
    code: 'REC-NPS-TRIMESTRAL', name: 'NPS Trimestral', role: 'CS', area: 'SUCESSO_CLIENTE', priority: 'MEDIA',
    description: 'NPS Trimestral — coletar a nota de satisfação (NPS) do cliente a cada 90 dias.',
    recurrence: { frequency: 'TRIMESTRAL', dayOfMonth: 1 },
  },
  {
    code: 'REC-VALIDACAO-ANUNCIOS', name: 'Validação dos Anúncios Ativos', role: 'CS', area: 'SUCESSO_CLIENTE', priority: 'MEDIA',
    description: 'Validação dos Anúncios Ativos — conferir se os anúncios ativos do cliente estão corretos e coerentes com a oferta.',
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 1, hour: 15 },
  },
  {
    code: 'REC-SOLIC-NOVOS-CRIATIVOS', name: 'Solicitação de Novos Criativos', role: 'GESTOR', area: 'TRAFEGO', priority: 'MEDIA',
    description: 'Solicitação de Novos Criativos — solicitar ao cliente os novos criativos necessários para a semana.',
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 1, hour: 12 },
  },
  {
    code: 'REC-REVISAO-DIARIA-BUDGET', name: 'Revisão Diária de Budget e Performance', role: 'GESTOR', area: 'TRAFEGO', priority: 'ALTA',
    description: 'Revisão Diária de Budget e Performance — revisar o orçamento e a performance das contas no dia corrente.',
    recurrence: { frequency: 'DIA_UTIL' },
  },
  {
    code: 'REC-REVISAO-ANUNCIOS-OFERTAS', name: 'Revisão de Anúncios Ativos (Ofertas Expiradas)', role: 'GESTOR', area: 'TRAFEGO', priority: 'MEDIA',
    description: 'Revisão de Anúncios Ativos — identificar e pausar anúncios com ofertas expiradas na semana corrente.',
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 1 },
  },
  {
    code: 'REC-TROCA-IMPULSIONAMENTOS', name: 'Troca de Impulsionamentos / Criativos', role: 'GESTOR', area: 'TRAFEGO', priority: 'MEDIA',
    description: 'Troca de Impulsionamentos / Criativos — trocar os impulsionamentos e criativos das campanhas na semana corrente.',
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 1 },
  },
  {
    code: 'REC-SOLIC-LISTA-CLIENTES', name: 'Solicitar Lista de Clientes Atualizada', role: 'CS', area: 'SUCESSO_CLIENTE', priority: 'MEDIA',
    description: 'Solicitar Lista de Clientes Atualizada — solicitar ao cliente a lista atualizada de clientes/base para o CRM na semana corrente.',
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 1 },
  },
  {
    code: 'REC-ENVIAR-SOLIC-CRIATIVO', name: 'Enviar Solicitação de Criativo', role: 'CS', area: 'SUCESSO_CLIENTE', priority: 'MEDIA',
    description: 'Enviar Solicitação de Criativo — enviar ao cliente a solicitação formal de criativos na semana corrente.',
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 1 },
  },
]

function slugEmail(slug: string): string {
  return `${slug}@arkza.com.br`
}

export async function seedOperacaoArkza(): Promise<{
  usersCreated: number
  usersUpdated: number
  templatesUpserted: number
  recurrencesUpserted: number
  stepsCreated: number
}> {
  let usersCreated = 0
  let usersUpdated = 0

  // ── (a) Time ────────────────────────────────────────────────────────────────
  for (const u of TEAM) {
    const email = u.email ?? slugEmail(u.slug)

    // Localiza por externalId (quando houver) ou por email.
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          ...(u.externalId ? [{ externalId: u.externalId }] : []),
          { email },
        ],
      },
      select: { id: true },
    })

    if (existing) {
      // NUNCA sobrescreve passwordHash. Atualiza só metadados operacionais.
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: u.name,
          operationalRole: u.operationalRole,
          role: u.role,
          externalId: u.externalId ?? undefined,
          active: true,
        },
      })
      usersUpdated++
    } else {
      // Senha ALEATÓRIA forte — usuário define depois via reset.
      const randomPassword = randomBytes(32).toString('hex')
      const passwordHash = await bcrypt.hash(randomPassword, 12)
      await prisma.user.create({
        data: {
          name: u.name,
          email,
          passwordHash,
          role: u.role,
          operationalRole: u.operationalRole,
          externalId: u.externalId,
          active: true,
        },
      })
      usersCreated++
    }
  }

  // ── Áreas (para resolver areaId por AreaCode) ────────────────────────────────
  const areas = await prisma.taskArea.findMany({ select: { id: true, code: true } })
  const areaByCode = new Map(areas.map((a) => [a.code, a.id]))

  // ── (b) + (c) Templates + recorrências + steps ───────────────────────────────
  let templatesUpserted = 0
  let recurrencesUpserted = 0
  let stepsCreated = 0

  for (const t of TEMPLATES) {
    const areaId = areaByCode.get(t.area) ?? null

    const tpl = await prisma.taskTemplate.upsert({
      where: { code: t.code },
      update: {
        name: t.name,
        description: t.description,
        areaId,
        defaultType: 'RECORRENTE',
        defaultPriority: t.priority,
        defaultAssigneeRole: t.role,
        active: true,
      },
      create: {
        code: t.code,
        name: t.name,
        description: t.description,
        areaId,
        defaultType: 'RECORRENTE',
        defaultPriority: t.priority,
        defaultStatus: 'A_FAZER',
        defaultAssigneeRole: t.role,
        active: true,
      },
      select: { id: true },
    })
    templatesUpserted++

    // Steps (apenas onde o documento fornece SOP detalhada). Idempotente:
    // recria só se ainda não houver step para o template.
    if (t.steps && t.steps.length) {
      const stepCount = await prisma.taskTemplateStep.count({ where: { templateId: tpl.id } })
      if (stepCount === 0) {
        await prisma.taskTemplateStep.createMany({
          data: t.steps.map((label, i) => ({ templateId: tpl.id, label, required: true, order: i })),
        })
        stepsCreated += t.steps.length
      }
    }

    // Recorrência (templateId é @unique → upsert por templateId).
    await prisma.taskRecurrenceRule.upsert({
      where: { templateId: tpl.id },
      update: {
        frequency: t.recurrence.frequency,
        dayOfWeek: t.recurrence.dayOfWeek ?? null,
        dayOfMonth: t.recurrence.dayOfMonth ?? null,
        hour: t.recurrence.hour ?? null,
        active: true,
      },
      create: {
        templateId: tpl.id,
        frequency: t.recurrence.frequency,
        dayOfWeek: t.recurrence.dayOfWeek ?? null,
        dayOfMonth: t.recurrence.dayOfMonth ?? null,
        hour: t.recurrence.hour ?? null,
        active: true,
      },
    })
    recurrencesUpserted++
  }

  return { usersCreated, usersUpdated, templatesUpserted, recurrencesUpserted, stepsCreated }
}
