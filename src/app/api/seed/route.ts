import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hash } from 'bcryptjs'

export async function POST(request: NextRequest) {
  // Nunca em produção: cria usuários com senhas de exemplo. Só dev/homolog.
  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const secret = request.headers.get('x-seed-secret')
  if (!process.env.SEED_SECRET || secret !== process.env.SEED_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
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
      create: { name: 'Ana Lima', email: 'ana@performli.com.br', passwordHash: managerHash, role: 'MANAGER' },
    })

    const carlos = await prisma.user.upsert({
      where: { email: 'carlos@performli.com.br' },
      update: {},
      create: { name: 'Carlos Souza', email: 'carlos@performli.com.br', passwordHash: managerHash, role: 'MANAGER' },
    })

    const beatriz = await prisma.user.upsert({
      where: { email: 'beatriz@performli.com.br' },
      update: {},
      create: { name: 'Beatriz Rocha', email: 'beatriz@performli.com.br', passwordHash: analystHash, role: 'ANALYST' },
    })

    const lojaAlpha = await prisma.client.upsert({
      where: { slug: 'loja-alpha' },
      update: {},
      create: {
        name: 'Loja Alpha', slug: 'loja-alpha', industry: 'E-commerce', website: 'https://lojaalpha.com.br', status: 'ACTIVE',
        assignments: { create: [{ userId: ana.id, isPrimary: true }, { userId: admin.id, isPrimary: false }] },
      },
    })

    const ecommerceBeta = await prisma.client.upsert({
      where: { slug: 'ecommerce-beta' },
      update: {},
      create: { name: 'E-commerce Beta', slug: 'ecommerce-beta', industry: 'Moda', status: 'ACTIVE', assignments: { create: [{ userId: carlos.id, isPrimary: true }] } },
    })

    const marcaGamma = await prisma.client.upsert({
      where: { slug: 'marca-gamma' },
      update: {},
      create: { name: 'Marca Gamma', slug: 'marca-gamma', industry: 'Cosméticos', status: 'ACTIVE', assignments: { create: [{ userId: ana.id, isPrimary: true }] } },
    })

    const techDelta = await prisma.client.upsert({
      where: { slug: 'tech-delta' },
      update: {},
      create: { name: 'Tech Delta', slug: 'tech-delta', industry: 'SaaS', status: 'ACTIVE', assignments: { create: [{ userId: carlos.id, isPrimary: true }, { userId: beatriz.id, isPrimary: false }] } },
    })

    const fitStore = await prisma.client.upsert({
      where: { slug: 'fit-store' },
      update: {},
      create: { name: 'Fit Store', slug: 'fit-store', industry: 'Fitness & Saúde', status: 'ACTIVE', assignments: { create: [{ userId: ana.id, isPrimary: true }] } },
    })

    const imoveisPrime = await prisma.client.upsert({
      where: { slug: 'imoveis-prime' },
      update: {},
      create: { name: 'Imóveis Prime', slug: 'imoveis-prime', industry: 'Imobiliário', status: 'ACTIVE', assignments: { create: [{ userId: carlos.id, isPrimary: true }] } },
    })

    const acc = (clientId: string, platform: 'META_ADS' | 'GOOGLE_ADS' | 'GA4', extId: string, name: string) =>
      prisma.platformAccount.upsert({
        where: { clientId_platform_externalId: { clientId, platform, externalId: extId } },
        update: {},
        create: { clientId, platform, externalId: extId, name },
      })

    await Promise.all([
      acc(lojaAlpha.id, 'META_ADS', 'act_1001', 'Loja Alpha – Meta'),
      acc(ecommerceBeta.id, 'META_ADS', 'act_1002', 'Beta – Meta'),
      acc(marcaGamma.id, 'META_ADS', 'act_1003', 'Gamma – Meta'),
      acc(techDelta.id, 'GOOGLE_ADS', '123-456-7890', 'Tech Delta – Google'),
      acc(fitStore.id, 'META_ADS', 'act_1005', 'Fit Store – Meta'),
      acc(imoveisPrime.id, 'META_ADS', 'act_1006', 'Imóveis Prime – Meta'),
    ])

    await prisma.task.createMany({
      skipDuplicates: true,
      data: [
        { title: 'Revisar criativos da campanha de ROAS – Loja Alpha', clientId: lojaAlpha.id, assignedTo: ana.id, status: 'A_FAZER', priority: 'ALTA' },
        { title: 'Ajustar lances no Meta – E-commerce Beta', clientId: ecommerceBeta.id, assignedTo: carlos.id, status: 'EM_ANDAMENTO', priority: 'ALTA' },
        { title: 'Ligar para Marca Gamma – risco de churn', clientId: marcaGamma.id, assignedTo: ana.id, status: 'A_FAZER', priority: 'ALTA' },
        { title: 'Configurar rastreamento GA4 – Tech Delta', clientId: techDelta.id, assignedTo: carlos.id, status: 'CONCLUIDO', priority: 'MEDIA' },
        { title: 'Criar novos públicos no Meta – Fit Store', clientId: fitStore.id, assignedTo: ana.id, status: 'EM_ANDAMENTO', priority: 'MEDIA' },
        { title: 'Relatório mensal – Imóveis Prime', clientId: imoveisPrime.id, assignedTo: carlos.id, status: 'A_FAZER', priority: 'BAIXA' },
      ],
    })

    await prisma.alert.createMany({
      skipDuplicates: true,
      data: [
        { clientId: marcaGamma.id, type: 'STATUS_DROPPED_TO_RUIM', title: 'Marca Gamma — ROAS caiu para Ruim', body: 'ROAS está em 1.8x (45% da meta de 4.0x). Cliente em risco de churn há 4 semanas.' },
        { clientId: ecommerceBeta.id, type: 'STATUS_DROPPED_TO_RUIM', title: 'E-commerce Beta — Performance caiu para Ruim', body: 'ROAS em 2.7x, abaixo da meta de 3.5x.' },
        { clientId: lojaAlpha.id, type: 'STATUS_IMPROVED_TO_OTIMO', title: 'Loja Alpha — Meta de ROAS superada!', body: 'ROAS chegou a 4.4x, 110% da meta semanal.' },
      ],
    })

    return NextResponse.json({ ok: true, message: 'Seed concluído com sucesso!' })
  } catch (err) {
    console.error('[seed]', err)
    // Não vaza detalhes internos; o log guarda o erro real.
    return NextResponse.json({ error: 'Erro ao executar seed' }, { status: 500 })
  }
}
