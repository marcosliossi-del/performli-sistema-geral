import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { hash } from 'bcryptjs'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/performli',
})
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Seeding database...')

  // ─── Users ──────────────────────────────────────────────────────────────────

  const adminHash = await hash('admin123', 12)
  const managerHash = await hash('gestor123', 12)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@performli.com.br' },
    update: {},
    create: {
      name: 'Admin Performli',
      email: 'admin@performli.com.br',
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  })

  const ana = await prisma.user.upsert({
    where: { email: 'ana@performli.com.br' },
    update: {},
    create: {
      name: 'Ana Lima',
      email: 'ana@performli.com.br',
      passwordHash: managerHash,
      role: 'MANAGER',
    },
  })

  const carlos = await prisma.user.upsert({
    where: { email: 'carlos@performli.com.br' },
    update: {},
    create: {
      name: 'Carlos Souza',
      email: 'carlos@performli.com.br',
      passwordHash: managerHash,
      role: 'MANAGER',
    },
  })

  console.log('✅ Users created')

  // ─── Clients ─────────────────────────────────────────────────────────────────

  const lojaAlpha = await prisma.client.upsert({
    where: { slug: 'loja-alpha' },
    update: {},
    create: {
      name: 'Loja Alpha',
      slug: 'loja-alpha',
      industry: 'E-commerce',
      website: 'https://lojaalpha.com.br',
      status: 'ACTIVE',
      assignments: {
        create: [
          { userId: ana.id, isPrimary: true },
          { userId: admin.id, isPrimary: false },
        ],
      },
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
      assignments: {
        create: [{ userId: carlos.id, isPrimary: true }],
      },
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
      assignments: {
        create: [{ userId: ana.id, isPrimary: true }],
      },
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
      assignments: {
        create: [{ userId: carlos.id, isPrimary: true }],
      },
    },
  })

  console.log('✅ Clients created')

  // ─── Platform Accounts ────────────────────────────────────────────────────────

  const alphaMetaAcc = await prisma.platformAccount.upsert({
    where: { clientId_platform_externalId: { clientId: lojaAlpha.id, platform: 'META_ADS', externalId: 'act_1001' } },
    update: {},
    create: { clientId: lojaAlpha.id, platform: 'META_ADS', externalId: 'act_1001', name: 'Loja Alpha – Meta' },
  })

  const betaMetaAcc = await prisma.platformAccount.upsert({
    where: { clientId_platform_externalId: { clientId: ecommerceBeta.id, platform: 'META_ADS', externalId: 'act_1002' } },
    update: {},
    create: { clientId: ecommerceBeta.id, platform: 'META_ADS', externalId: 'act_1002', name: 'Beta – Meta' },
  })

  const gammaMetaAcc = await prisma.platformAccount.upsert({
    where: { clientId_platform_externalId: { clientId: marcaGamma.id, platform: 'META_ADS', externalId: 'act_1003' } },
    update: {},
    create: { clientId: marcaGamma.id, platform: 'META_ADS', externalId: 'act_1003', name: 'Gamma – Meta' },
  })

  const deltaGoogleAcc = await prisma.platformAccount.upsert({
    where: { clientId_platform_externalId: { clientId: techDelta.id, platform: 'GOOGLE_ADS', externalId: '123-456-7890' } },
    update: {},
    create: { clientId: techDelta.id, platform: 'GOOGLE_ADS', externalId: '123-456-7890', name: 'Tech Delta – Google' },
  })

  console.log('✅ Platform accounts created')

  // ─── Goals (current week) ─────────────────────────────────────────────────────

  // Monday of current week
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)

  const goals = [
    // Loja Alpha — OTIMO
    { clientId: lojaAlpha.id, metric: 'ROAS' as const, target: 4.0 },
    { clientId: lojaAlpha.id, metric: 'INVESTMENT' as const, target: 5000 },
    { clientId: lojaAlpha.id, metric: 'CPL' as const, target: 25 },
    // E-commerce Beta — REGULAR
    { clientId: ecommerceBeta.id, metric: 'ROAS' as const, target: 3.5 },
    { clientId: ecommerceBeta.id, metric: 'CPL' as const, target: 30 },
    // Marca Gamma — RUIM
    { clientId: marcaGamma.id, metric: 'ROAS' as const, target: 4.0 },
    { clientId: marcaGamma.id, metric: 'CONVERSIONS' as const, target: 80 },
    // Tech Delta — OTIMO
    { clientId: techDelta.id, metric: 'ROAS' as const, target: 5.0 },
    { clientId: techDelta.id, metric: 'CPA' as const, target: 50 },
  ]

  const createdGoals: Record<string, { id: string }> = {}
  for (const g of goals) {
    const goal = await prisma.goal.upsert({
      where: { clientId_metric_period_startDate: { clientId: g.clientId, metric: g.metric, period: 'WEEKLY', startDate: monday } },
      update: {},
      create: { clientId: g.clientId, metric: g.metric, period: 'WEEKLY', targetValue: g.target, startDate: monday, endDate: sunday },
    })
    createdGoals[`${g.clientId}-${g.metric}`] = goal
  }

  console.log('✅ Goals created')

  // ─── MetricSnapshots (7 days) ─────────────────────────────────────────────────

  const snapshots = [
    // Loja Alpha — ROAS ~4.4 (OTIMO)
    { accId: alphaMetaAcc.id, clientId: lojaAlpha.id, daysAgo: 6, spend: 700, roas: 4.5, cpl: 22 },
    { accId: alphaMetaAcc.id, clientId: lojaAlpha.id, daysAgo: 5, spend: 720, roas: 4.2, cpl: 23 },
    { accId: alphaMetaAcc.id, clientId: lojaAlpha.id, daysAgo: 4, spend: 690, roas: 4.6, cpl: 21 },
    { accId: alphaMetaAcc.id, clientId: lojaAlpha.id, daysAgo: 3, spend: 710, roas: 4.4, cpl: 24 },
    { accId: alphaMetaAcc.id, clientId: lojaAlpha.id, daysAgo: 2, spend: 700, roas: 4.3, cpl: 22 },
    { accId: alphaMetaAcc.id, clientId: lojaAlpha.id, daysAgo: 1, spend: 730, roas: 4.5, cpl: 23 },
    { accId: alphaMetaAcc.id, clientId: lojaAlpha.id, daysAgo: 0, spend: 750, roas: 4.4, cpl: 22 },
    // E-commerce Beta — ROAS ~2.7 (REGULAR)
    { accId: betaMetaAcc.id, clientId: ecommerceBeta.id, daysAgo: 6, spend: 500, roas: 2.8, cpl: 35 },
    { accId: betaMetaAcc.id, clientId: ecommerceBeta.id, daysAgo: 5, spend: 510, roas: 2.6, cpl: 36 },
    { accId: betaMetaAcc.id, clientId: ecommerceBeta.id, daysAgo: 4, spend: 490, roas: 2.9, cpl: 34 },
    { accId: betaMetaAcc.id, clientId: ecommerceBeta.id, daysAgo: 3, spend: 505, roas: 2.7, cpl: 35 },
    { accId: betaMetaAcc.id, clientId: ecommerceBeta.id, daysAgo: 2, spend: 515, roas: 2.5, cpl: 37 },
    { accId: betaMetaAcc.id, clientId: ecommerceBeta.id, daysAgo: 1, spend: 500, roas: 2.8, cpl: 35 },
    { accId: betaMetaAcc.id, clientId: ecommerceBeta.id, daysAgo: 0, spend: 495, roas: 2.7, cpl: 36 },
    // Marca Gamma — ROAS ~1.8 (RUIM)
    { accId: gammaMetaAcc.id, clientId: marcaGamma.id, daysAgo: 6, spend: 600, roas: 1.9, cpl: 65 },
    { accId: gammaMetaAcc.id, clientId: marcaGamma.id, daysAgo: 5, spend: 610, roas: 1.7, cpl: 68 },
    { accId: gammaMetaAcc.id, clientId: marcaGamma.id, daysAgo: 4, spend: 590, roas: 1.8, cpl: 66 },
    { accId: gammaMetaAcc.id, clientId: marcaGamma.id, daysAgo: 3, spend: 605, roas: 1.9, cpl: 67 },
    { accId: gammaMetaAcc.id, clientId: marcaGamma.id, daysAgo: 2, spend: 615, roas: 1.7, cpl: 70 },
    { accId: gammaMetaAcc.id, clientId: marcaGamma.id, daysAgo: 1, spend: 600, roas: 1.8, cpl: 68 },
    { accId: gammaMetaAcc.id, clientId: marcaGamma.id, daysAgo: 0, spend: 595, roas: 1.9, cpl: 66 },
    // Tech Delta — ROAS ~5.3 (OTIMO)
    { accId: deltaGoogleAcc.id, clientId: techDelta.id, daysAgo: 6, spend: 400, roas: 5.4, cpa: 42 },
    { accId: deltaGoogleAcc.id, clientId: techDelta.id, daysAgo: 5, spend: 410, roas: 5.1, cpa: 44 },
    { accId: deltaGoogleAcc.id, clientId: techDelta.id, daysAgo: 4, spend: 395, roas: 5.5, cpa: 41 },
    { accId: deltaGoogleAcc.id, clientId: techDelta.id, daysAgo: 3, spend: 405, roas: 5.3, cpa: 43 },
    { accId: deltaGoogleAcc.id, clientId: techDelta.id, daysAgo: 2, spend: 415, roas: 5.2, cpa: 43 },
    { accId: deltaGoogleAcc.id, clientId: techDelta.id, daysAgo: 1, spend: 400, roas: 5.4, cpa: 42 },
    { accId: deltaGoogleAcc.id, clientId: techDelta.id, daysAgo: 0, spend: 410, roas: 5.3, cpa: 42 },
  ]

  for (const s of snapshots) {
    const date = new Date()
    date.setDate(date.getDate() - s.daysAgo)
    date.setHours(0, 0, 0, 0)

    await prisma.metricSnapshot.upsert({
      where: { platformAccountId_date: { platformAccountId: s.accId, date } },
      update: {},
      create: {
        clientId: s.clientId,
        platformAccountId: s.accId,
        date,
        spend: s.spend,
        roas: s.roas ?? null,
        cpl: s.cpl ?? null,
        cpa: s.cpa ?? null,
      },
    })
  }

  console.log('✅ Metric snapshots created')

  // ─── HealthScores ─────────────────────────────────────────────────────────────

  const healthData = [
    // Loja Alpha
    { clientId: lojaAlpha.id, metric: 'ROAS' as const, actual: 4.4, target: 4.0, pct: 110 },
    { clientId: lojaAlpha.id, metric: 'CPL' as const, actual: 22.4, target: 25, pct: 112 }, // lower is better → inverted
    { clientId: lojaAlpha.id, metric: 'INVESTMENT' as const, actual: 5000, target: 5000, pct: 100 },
    // E-commerce Beta
    { clientId: ecommerceBeta.id, metric: 'ROAS' as const, actual: 2.71, target: 3.5, pct: 77.5 },
    { clientId: ecommerceBeta.id, metric: 'CPL' as const, actual: 35.4, target: 30, pct: 84.7 },
    // Marca Gamma
    { clientId: marcaGamma.id, metric: 'ROAS' as const, actual: 1.81, target: 4.0, pct: 45.3 },
    { clientId: marcaGamma.id, metric: 'CONVERSIONS' as const, actual: 38, target: 80, pct: 47.5 },
    // Tech Delta
    { clientId: techDelta.id, metric: 'ROAS' as const, actual: 5.31, target: 5.0, pct: 106 },
    { clientId: techDelta.id, metric: 'CPA' as const, actual: 42.4, target: 50, pct: 118 }, // lower is better → inverted
  ]

  for (const h of healthData) {
    const goalKey = `${h.clientId}-${h.metric}`
    const goal = createdGoals[goalKey]
    if (!goal) continue

    const status = h.pct >= 90 ? 'OTIMO' : h.pct >= 70 ? 'REGULAR' : 'RUIM'

    await prisma.healthScore.upsert({
      where: { clientId_goalId_periodStart: { clientId: h.clientId, goalId: goal.id, periodStart: monday } },
      update: { actualValue: h.actual, achievementPct: h.pct, status },
      create: {
        clientId: h.clientId,
        goalId: goal.id,
        metric: h.metric,
        period: 'WEEKLY',
        periodStart: monday,
        periodEnd: sunday,
        targetValue: h.target,
        actualValue: h.actual,
        achievementPct: h.pct,
        status,
      },
    })
  }

  console.log('✅ Health scores created')

  // ─── Alerts ──────────────────────────────────────────────────────────────────

  await prisma.alert.createMany({
    data: [
      {
        clientId: marcaGamma.id,
        type: 'STATUS_DROPPED_TO_RUIM',
        title: 'Marca Gamma — ROAS caiu para Ruim',
        body: 'ROAS está em 1.81x (45% da meta de 4.0x) nesta semana.',
      },
      {
        clientId: ecommerceBeta.id,
        type: 'STATUS_DROPPED_TO_REGULAR',
        title: 'E-commerce Beta — CPL acima do limite',
        body: 'CPL médio de R$ 35,40 está acima da meta de R$ 30,00.',
      },
      {
        clientId: lojaAlpha.id,
        type: 'STATUS_IMPROVED_TO_OTIMO',
        title: 'Loja Alpha — Meta de ROAS atingida!',
        body: 'ROAS chegou a 4.4x, 110% da meta semanal.',
      },
    ],
    skipDuplicates: true,
  })

  console.log('✅ Alerts created')
  console.log('')
  console.log('🎉 Seed completo!')
  console.log('')
  console.log('Usuários de acesso:')
  console.log('  admin@performli.com.br  | senha: admin123  | role: ADMIN')
  console.log('  ana@performli.com.br    | senha: gestor123 | role: MANAGER')
  console.log('  carlos@performli.com.br | senha: gestor123 | role: MANAGER')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
