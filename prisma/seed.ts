import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { hash } from 'bcryptjs'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/performli',
})
const prisma = new PrismaClient({ adapter })

// ─── Helpers ───────────────────────────────────────────────────────────────

function monday(weeksAgo: number): Date {
  const now = new Date()
  const dayOfWeek = (now.getDay() + 6) % 7 // Mon=0 … Sun=6
  const d = new Date(now)
  d.setDate(now.getDate() - dayOfWeek - weeksAgo * 7)
  d.setHours(0, 0, 0, 0)
  return d
}

function sunday(m: Date): Date {
  const d = new Date(m)
  d.setDate(m.getDate() + 6)
  d.setHours(23, 59, 59, 999)
  return d
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

type MetricType = 'ROAS' | 'CPL' | 'CPA' | 'INVESTMENT' | 'CONVERSIONS' | 'IMPRESSIONS' | 'CLICKS'
type HealthStatus = 'OTIMO' | 'REGULAR' | 'RUIM'

function healthStatus(pct: number): HealthStatus {
  return pct >= 90 ? 'OTIMO' : pct >= 70 ? 'REGULAR' : 'RUIM'
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding database...')

  // ── Users ────────────────────────────────────────────────────────────────

  const [adminHash, managerHash, analystHash] = await Promise.all([
    hash('admin123', 12),
    hash('gestor123', 12),
    hash('analista123', 12),
  ])

  const admin = await prisma.user.upsert({
    where: { email: 'admin@performli.com.br' },
    update: {},
    create: { name: 'Admin Performli', email: 'admin@performli.com.br', passwordHash: adminHash, role: 'ADMIN' },
  })

  const ana = await prisma.user.upsert({
    where: { email: 'ana@performli.com.br' },
    update: {},
    create: { name: 'Ana Lima', email: 'ana@performli.com.br', passwordHash: managerHash, role: 'GESTOR_TRAFEGO' },
  })

  const carlos = await prisma.user.upsert({
    where: { email: 'carlos@performli.com.br' },
    update: {},
    create: { name: 'Carlos Souza', email: 'carlos@performli.com.br', passwordHash: managerHash, role: 'GESTOR_TRAFEGO' },
  })

  const beatriz = await prisma.user.upsert({
    where: { email: 'beatriz@performli.com.br' },
    update: {},
    create: { name: 'Beatriz Rocha', email: 'beatriz@performli.com.br', passwordHash: analystHash, role: 'ANALISTA_TRAFEGO' },
  })

  console.log('✅ Users: admin, Ana, Carlos, Beatriz')

  // ── Clients ───────────────────────────────────────────────────────────────

  const lojaAlpha = await prisma.client.upsert({
    where: { slug: 'loja-alpha' },
    update: {},
    create: {
      name: 'Loja Alpha',
      slug: 'loja-alpha',
      industry: 'E-commerce',
      website: 'https://lojaalpha.com.br',
      status: 'ACTIVE',
      assignments: { create: [{ userId: ana.id, isPrimary: true }, { userId: admin.id, isPrimary: false }] },
    },
  })

  const ecommerceBeta = await prisma.client.upsert({
    where: { slug: 'ecommerce-beta' },
    update: {},
    create: {
      name: 'E-commerce Beta',
      slug: 'ecommerce-beta',
      industry: 'Moda',
      status: 'ACTIVE',
      assignments: { create: [{ userId: carlos.id, isPrimary: true }] },
    },
  })

  const marcaGamma = await prisma.client.upsert({
    where: { slug: 'marca-gamma' },
    update: {},
    create: {
      name: 'Marca Gamma',
      slug: 'marca-gamma',
      industry: 'Cosméticos',
      status: 'ACTIVE',
      assignments: { create: [{ userId: ana.id, isPrimary: true }] },
    },
  })

  const techDelta = await prisma.client.upsert({
    where: { slug: 'tech-delta' },
    update: {},
    create: {
      name: 'Tech Delta',
      slug: 'tech-delta',
      industry: 'SaaS',
      status: 'ACTIVE',
      assignments: { create: [{ userId: carlos.id, isPrimary: true }, { userId: beatriz.id, isPrimary: false }] },
    },
  })

  const fitStore = await prisma.client.upsert({
    where: { slug: 'fit-store' },
    update: {},
    create: {
      name: 'Fit Store',
      slug: 'fit-store',
      industry: 'Fitness & Saúde',
      status: 'ACTIVE',
      assignments: { create: [{ userId: ana.id, isPrimary: true }] },
    },
  })

  const imoveisPrime = await prisma.client.upsert({
    where: { slug: 'imoveis-prime' },
    update: {},
    create: {
      name: 'Imóveis Prime',
      slug: 'imoveis-prime',
      industry: 'Imobiliário',
      status: 'ACTIVE',
      assignments: { create: [{ userId: carlos.id, isPrimary: true }] },
    },
  })

  console.log('✅ Clients: 6 clientes criados')

  // ── Platform Accounts ─────────────────────────────────────────────────────

  const acc = async (clientId: string, platform: 'META_ADS' | 'GOOGLE_ADS' | 'GA4', extId: string, name: string) =>
    prisma.platformAccount.upsert({
      where: { clientId_platform_externalId: { clientId, platform, externalId: extId } },
      update: {},
      create: { clientId, platform, externalId: extId, name },
    })

  const alphaMetaAcc     = await acc(lojaAlpha.id,     'META_ADS',   'act_1001', 'Loja Alpha – Meta')
  const betaMetaAcc      = await acc(ecommerceBeta.id, 'META_ADS',   'act_1002', 'Beta – Meta')
  const gammaMetaAcc     = await acc(marcaGamma.id,    'META_ADS',   'act_1003', 'Gamma – Meta')
  const deltaGoogleAcc   = await acc(techDelta.id,     'GOOGLE_ADS', '123-456-7890', 'Tech Delta – Google')
  const fitMetaAcc       = await acc(fitStore.id,      'META_ADS',   'act_1005', 'Fit Store – Meta')
  const imoveisMetaAcc   = await acc(imoveisPrime.id,  'META_ADS',   'act_1006', 'Imóveis Prime – Meta')

  console.log('✅ Platform accounts criadas')

  // ── Goals + HealthScores — 6 semanas de histórico ────────────────────────
  //
  // Cenários planejados:
  //  Loja Alpha    → Ótimo constante (Ana, destaque)
  //  E-commerce Beta → Regular → caiu para Ruim nas últimas 2 semanas (MÉDIO risco churn)
  //  Marca Gamma   → Ruim há 4 semanas seguidas (ALTO risco churn)
  //  Tech Delta    → Ótimo nas últimas semanas, Regular antes
  //  Fit Store     → Regular, melhorando → Ótimo esta semana
  //  Imóveis Prime → Ruim há 1 semana (MÉDIO risco)
  //
  // weeksAgo: 5 = mais antigo, 0 = semana atual

  type WeekHealth = {
    clientId: string
    accId:    string
    metric:   MetricType
    target:   number
    // [weeksAgo5, wa4, wa3, wa2, wa1, wa0(current)]
    actuals:  [number, number, number, number, number, number]
    pcts:     [number, number, number, number, number, number]
  }

  const weeklyHealthPlans: WeekHealth[] = [
    // ── Loja Alpha – sempre Ótimo ─────────────────────────────────────
    { clientId: lojaAlpha.id, accId: alphaMetaAcc.id, metric: 'ROAS',       target: 4.0,  actuals: [4.1, 4.2, 4.3, 4.2, 4.4, 4.4], pcts: [102, 105, 108, 105, 110, 110] },
    { clientId: lojaAlpha.id, accId: alphaMetaAcc.id, metric: 'CPL',        target: 25,   actuals: [24, 23.5, 23, 22.8, 22.5, 22.4], pcts: [104, 106, 109, 110, 111, 112] },
    { clientId: lojaAlpha.id, accId: alphaMetaAcc.id, metric: 'INVESTMENT', target: 5000, actuals: [4800, 4900, 5000, 4950, 5000, 5000], pcts: [96, 98, 100, 99, 100, 100] },

    // ── E-commerce Beta – caiu para Ruim nas últimas 2 semanas ───────
    { clientId: ecommerceBeta.id, accId: betaMetaAcc.id, metric: 'ROAS', target: 3.5, actuals: [3.4, 3.3, 3.2, 3.0, 2.3, 2.7], pcts: [97, 94, 91, 86, 66, 77] },
    { clientId: ecommerceBeta.id, accId: betaMetaAcc.id, metric: 'CPL',  target: 30,  actuals: [31, 32, 33, 36, 48, 35], pcts: [97, 94, 91, 83, 63, 85] },

    // ── Marca Gamma – Ruim há 4 semanas seguidas (ALTO churn risk) ───
    { clientId: marcaGamma.id, accId: gammaMetaAcc.id, metric: 'ROAS',        target: 4.0, actuals: [3.8, 3.6, 2.1, 1.9, 1.8, 1.8], pcts: [95, 90, 53, 47, 45, 45] },
    { clientId: marcaGamma.id, accId: gammaMetaAcc.id, metric: 'CONVERSIONS', target: 80,  actuals: [76, 74, 45, 40, 38, 38], pcts: [95, 92, 56, 50, 47, 47] },

    // ── Tech Delta – Regular no início, Ótimo recente ─────────────────
    { clientId: techDelta.id, accId: deltaGoogleAcc.id, metric: 'ROAS', target: 5.0, actuals: [4.2, 4.5, 4.8, 5.0, 5.2, 5.3], pcts: [84, 90, 96, 100, 104, 106] },
    { clientId: techDelta.id, accId: deltaGoogleAcc.id, metric: 'CPA',  target: 50,  actuals: [52, 50, 48, 45, 43, 42], pcts: [96, 100, 104, 111, 116, 119] },

    // ── Fit Store – Regular → Ótimo esta semana ───────────────────────
    { clientId: fitStore.id, accId: fitMetaAcc.id, metric: 'ROAS', target: 3.0, actuals: [2.5, 2.6, 2.7, 2.8, 2.9, 3.1], pcts: [83, 87, 90, 93, 97, 103] },
    { clientId: fitStore.id, accId: fitMetaAcc.id, metric: 'CPL',  target: 20,  actuals: [23, 22, 21, 20.5, 20, 19], pcts: [87, 91, 95, 98, 100, 105] },

    // ── Imóveis Prime – Ruim na última semana (MÉDIO risco) ──────────
    { clientId: imoveisPrime.id, accId: imoveisMetaAcc.id, metric: 'ROAS', target: 2.5,  actuals: [2.6, 2.5, 2.5, 2.4, 2.4, 1.6], pcts: [104, 100, 100, 96, 96, 64] },
    { clientId: imoveisPrime.id, accId: imoveisMetaAcc.id, metric: 'CPL',   target: 60,  actuals: [57, 62, 60, 64, 66, 95], pcts: [105, 97, 100, 94, 91, 63] },
  ]

  for (const plan of weeklyHealthPlans) {
    for (let wa = 5; wa >= 0; wa--) {
      const m  = monday(wa)
      const s  = sunday(m)
      const idx = 5 - wa // idx 0 = wa5 (oldest), idx5 = wa0 (current)

      const actual = plan.actuals[idx]
      const pct    = plan.pcts[idx]
      const status = healthStatus(pct)

      // Upsert Goal for this week
      const goal = await prisma.goal.upsert({
        where: { clientId_metric_period_startDate: { clientId: plan.clientId, metric: plan.metric, period: 'WEEKLY', startDate: m } },
        update: {},
        create: { clientId: plan.clientId, metric: plan.metric, period: 'WEEKLY', targetValue: plan.target, startDate: m, endDate: s },
      })

      // Upsert HealthScore
      await prisma.healthScore.upsert({
        where: { clientId_goalId_periodStart: { clientId: plan.clientId, goalId: goal.id, periodStart: m } },
        update: { actualValue: actual, achievementPct: pct, status },
        create: {
          clientId: plan.clientId,
          goalId:   goal.id,
          metric:   plan.metric,
          period:   'WEEKLY',
          periodStart: m,
          periodEnd:   s,
          targetValue: plan.target,
          actualValue: actual,
          achievementPct: pct,
          status,
        },
      })
    }
  }

  console.log('✅ Goals + HealthScores: 6 semanas × 13 planos')

  // ── MetricSnapshots — 30 dias de dados diários ───────────────────────────

  const dailyData = [
    { accId: alphaMetaAcc.id,   clientId: lojaAlpha.id,     baseSpend: 710, baseRoas: 4.3, baseCpl: 22 },
    { accId: betaMetaAcc.id,    clientId: ecommerceBeta.id, baseSpend: 500, baseRoas: 2.9, baseCpl: 34 },
    { accId: gammaMetaAcc.id,   clientId: marcaGamma.id,    baseSpend: 600, baseRoas: 1.8, baseCpl: 66 },
    { accId: deltaGoogleAcc.id, clientId: techDelta.id,     baseSpend: 405, baseRoas: 5.2, baseCpa: 43 },
    { accId: fitMetaAcc.id,     clientId: fitStore.id,      baseSpend: 350, baseRoas: 2.9, baseCpl: 20 },
    { accId: imoveisMetaAcc.id, clientId: imoveisPrime.id,  baseSpend: 800, baseRoas: 2.0, baseCpl: 55 },
  ]

  const jitter = (base: number, pct = 0.1) => base * (1 + (Math.random() * 2 - 1) * pct)

  for (const d of dailyData) {
    for (let da = 29; da >= 0; da--) {
      const date = daysAgo(da)
      await prisma.metricSnapshot.upsert({
        where: { platformAccountId_date: { platformAccountId: d.accId, date } },
        update: {},
        create: {
          clientId:         d.clientId,
          platformAccountId: d.accId,
          date,
          spend:       parseFloat(jitter(d.baseSpend).toFixed(2)),
          roas:        d.baseRoas ? parseFloat(jitter(d.baseRoas, 0.08).toFixed(2)) : null,
          cpl:         d.baseCpl  ? parseFloat(jitter(d.baseCpl,  0.08).toFixed(2)) : null,
          cpa:         d.baseCpa  ? parseFloat(jitter(d.baseCpa,  0.08).toFixed(2)) : null,
        },
      })
    }
  }

  console.log('✅ MetricSnapshots: 30 dias × 6 contas')

  // ── Tasks ─────────────────────────────────────────────────────────────────

  await prisma.task.createMany({
    skipDuplicates: true,
    data: [
      { title: 'Revisar criativos da campanha de ROAS – Loja Alpha', clientId: lojaAlpha.id,     assignedTo: ana.id,    status: 'PENDING',     priority: 'HIGH',   dueDate: daysAgo(-2) },
      { title: 'Ajustar lances no Meta – E-commerce Beta',           clientId: ecommerceBeta.id, assignedTo: carlos.id, status: 'IN_PROGRESS', priority: 'HIGH',   dueDate: daysAgo(-1) },
      { title: 'Ligar para Marca Gamma – risco de churn',            clientId: marcaGamma.id,    assignedTo: ana.id,    status: 'PENDING',     priority: 'HIGH',   dueDate: daysAgo(0)  },
      { title: 'Configurar rastreamento GA4 – Tech Delta',           clientId: techDelta.id,     assignedTo: carlos.id, status: 'DONE',        priority: 'MEDIUM', dueDate: daysAgo(3)  },
      { title: 'Criar novos públicos no Meta – Fit Store',           clientId: fitStore.id,      assignedTo: ana.id,    status: 'IN_PROGRESS', priority: 'MEDIUM', dueDate: daysAgo(-3) },
      { title: 'Relatório mensal – Imóveis Prime',                   clientId: imoveisPrime.id,  assignedTo: carlos.id, status: 'PENDING',     priority: 'LOW',    dueDate: daysAgo(-5) },
      { title: 'Testar campanha de retargeting – Loja Alpha',        clientId: lojaAlpha.id,     assignedTo: ana.id,    status: 'DONE',        priority: 'MEDIUM', dueDate: daysAgo(5)  },
      { title: 'Reunião de alinhamento – Marca Gamma',               clientId: marcaGamma.id,    assignedTo: ana.id,    status: 'PENDING',     priority: 'HIGH',   dueDate: daysAgo(-1) },
      { title: 'Análise de concorrentes – E-commerce Beta',          clientId: ecommerceBeta.id, assignedTo: beatriz.id, status: 'IN_PROGRESS', priority: 'LOW',  dueDate: daysAgo(-4) },
      { title: 'Subir nova campanha de leads – Imóveis Prime',       clientId: imoveisPrime.id,  assignedTo: carlos.id, status: 'PENDING',     priority: 'HIGH',   dueDate: daysAgo(-2) },
    ],
  })

  console.log('✅ Tasks: 10 tarefas criadas')

  // ── Operations ────────────────────────────────────────────────────────────

  await prisma.operation.createMany({
    skipDuplicates: false,
    data: [
      { clientId: lojaAlpha.id,     userId: ana.id,     subject: 'Ajuste de lances automáticos',     requested: 'Ativar lances de ROAS máximo na campanha de conversão', done: 'Configurado lance de ROAS máximo, campanha aumentou conversões em 12%.' },
      { clientId: ecommerceBeta.id, userId: carlos.id,  subject: 'Novos criativos de campanha',       requested: 'Subir 5 novos anúncios com foco no produto da nova coleção', done: 'Anúncios criados e aprovados, CTR inicial de 2.8%.' },
      { clientId: marcaGamma.id,    userId: ana.id,     subject: 'Pausar campanhas ineficientes',     requested: 'Pausar grupos de anúncios com CPL acima de R$ 80', done: 'Pausou 3 grupos. CPL médio reduziu de R$ 85 para R$ 66.' },
      { clientId: techDelta.id,     userId: carlos.id,  subject: 'Expansão para novo público',        requested: 'Testar similar audience baseada em conversões', done: 'Público criado e ativado, ROAS inicial de 4.8x no teste.' },
      { clientId: fitStore.id,      userId: ana.id,     subject: 'Aumento de orçamento diário',       requested: 'Aumentar budget de R$300 para R$400 nas campanhas de topo', done: 'Orçamento ajustado. Volume de leads aumentou 28%.' },
      { clientId: imoveisPrime.id,  userId: carlos.id,  subject: 'Troca de landing page',             requested: 'Alterar destino dos anúncios para LP com formulário simplificado', done: 'LP atualizada. Taxa de conversão subiu de 1.2% para 1.8%.' },
      { clientId: lojaAlpha.id,     userId: ana.id,     subject: 'Teste A/B de copy',                 requested: 'Iniciar teste A/B entre dois textos de anúncio principais', done: 'Teste ativo. Versão B apresentou CTR 15% maior após 3 dias.' },
    ],
  })

  console.log('✅ Operations: 7 registros criados')

  // ── Alerts ────────────────────────────────────────────────────────────────

  await prisma.alert.createMany({
    skipDuplicates: true,
    data: [
      { clientId: marcaGamma.id,    type: 'STATUS_DROPPED_TO_RUIM',    title: 'Marca Gamma — ROAS caiu para Ruim',            body: 'ROAS está em 1.8x (45% da meta de 4.0x). Cliente em risco de churn há 4 semanas.' },
      { clientId: ecommerceBeta.id, type: 'STATUS_DROPPED_TO_RUIM',    title: 'E-commerce Beta — Performance caiu para Ruim', body: 'ROAS em 2.7x, abaixo da meta de 3.5x. CPL de R$35 (meta: R$30).' },
      { clientId: imoveisPrime.id,  type: 'STATUS_DROPPED_TO_RUIM',    title: 'Imóveis Prime — ROAS abaixo da meta',          body: 'ROAS caiu para 1.6x na última semana (64% da meta de 2.5x).' },
      { clientId: lojaAlpha.id,     type: 'STATUS_IMPROVED_TO_OTIMO',  title: 'Loja Alpha — Meta de ROAS superada!',          body: 'ROAS chegou a 4.4x, 110% da meta semanal. Excelente performance.' },
      { clientId: techDelta.id,     type: 'STATUS_IMPROVED_TO_OTIMO',  title: 'Tech Delta — ROAS atingiu meta recorde',       body: 'ROAS de 5.3x, 106% da meta. Melhor semana do trimestre.' },
      { clientId: fitStore.id,      type: 'STATUS_IMPROVED_TO_OTIMO',  title: 'Fit Store — Subiu para Ótimo esta semana',     body: 'ROAS de 3.1x ultrapassou a meta de 3.0x pela primeira vez.' },
    ],
  })

  console.log('✅ Alerts: 6 alertas criados')

  // ── Resumo ────────────────────────────────────────────────────────────────

  console.log('')
  console.log('🎉 Seed completo!')
  console.log('')
  console.log('Usuários:')
  console.log('  admin@performli.com.br    | admin123    | ADMIN')
  console.log('  ana@performli.com.br      | gestor123   | MANAGER   → Loja Alpha, Marca Gamma, Fit Store')
  console.log('  carlos@performli.com.br   | gestor123   | MANAGER   → E-commerce Beta, Tech Delta, Imóveis Prime')
  console.log('  beatriz@performli.com.br  | analista123 | ANALYST   → Tech Delta (suporte)')
  console.log('')
  console.log('Anti-churn:')
  console.log('  ALTO   → Marca Gamma (4 semanas Ruim)')
  console.log('  MÉDIO  → E-commerce Beta (2 semanas Ruim) · Imóveis Prime (1 semana Ruim)')
  console.log('  Ótimo  → Loja Alpha · Tech Delta · Fit Store')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
