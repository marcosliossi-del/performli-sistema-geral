'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { slugify } from '@/lib/utils'
import { PipelineStage, BusinessType } from '@prisma/client'
import { runClientOnboarding } from '@/services/client-onboarding'

export type ClientFormState = {
  error?: string
}

export async function createClient(
  prevState: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  const session = await requireSession()
  if (session.role !== 'ADMIN') return { error: 'Sem permissão para criar clientes.' }

  const name = (formData.get('name') as string)?.trim()
  const industry = (formData.get('industry') as string)?.trim()
  const website = (formData.get('website') as string)?.trim()
  const notes = (formData.get('notes') as string)?.trim()
  const managerId = formData.get('managerId') as string
  const email = (formData.get('email') as string)?.trim()
  const phone = (formData.get('phone') as string)?.trim()
  const document = (formData.get('document') as string)?.trim()
  const source           = (formData.get('source') as string)?.trim()
  const contractValueRaw = (formData.get('contractValue') as string)?.trim()
  const contractStartRaw = (formData.get('contractStart') as string)?.trim()
  const pipelineStageRaw  = (formData.get('pipelineStage') as string)?.trim()
  const businessTypeRaw   = (formData.get('businessType') as string)?.trim()

  if (!name) return { error: 'Nome do cliente é obrigatório.' }

  const slug = slugify(name)

  // Check slug uniqueness
  const existing = await prisma.client.findUnique({ where: { slug } })
  if (existing) {
    return { error: `Já existe um cliente com nome similar ("${existing.name}"). Use um nome diferente.` }
  }

  const assignedUserId = managerId || session.userId
  const pipelineStage  = (pipelineStageRaw as PipelineStage) || 'ATIVO'
  const businessType   = (businessTypeRaw as BusinessType) || 'ECOMMERCE'

  const client = await prisma.client.create({
    data: {
      name,
      slug,
      businessType,
      industry: industry || null,
      website: website || null,
      source:  source || null,
      notes:   notes || null,
      email: email || null,
      phone: phone || null,
      document: document || null,
      contractValue: contractValueRaw ? parseFloat(contractValueRaw) : null,
      contractStart: contractStartRaw ? new Date(contractStartRaw) : null,
      pipelineStage,
      status: pipelineStage === 'CHURNED' ? 'CHURNED' : 'ACTIVE',
      assignments: {
        create: { userId: assignedUserId, isPrimary: true },
      },
      chat: {
        create: {},
      },
    },
  })

  // ONB-04 — Onboarding entra na Central Operacional como tarefa com checklist.
  // Não quebra a criação do cliente se algo falhar (regra: não quebrar deploy).
  try {
    await prisma.task.create({
      data: {
        title: `Onboarding — ${name}`,
        description: 'Configuração inicial do cliente (acessos, contas, rastreamento, kickoff e metas).',
        type: 'ONBOARDING',
        priority: 'ALTA',
        status: 'A_FAZER',
        origin: 'AUTOMACAO',
        clientId: client.id,
        assignedTo: assignedUserId,
        areaId: 'area_onboarding',
        popId: 'pop_onb_04',
        requesterId: session.userId,
        requestedAt: new Date(),
        dueDate: new Date(Date.now() + 7 * 86_400_000),
        slaHours: 168,
        idempotencyKey: `onboarding:${client.id}`,
        checklist: {
          create: [
            { label: 'Coletar acessos (Meta, Google, GA4, Nuvemshop)', required: true, order: 0 },
            { label: 'Vincular contas de anúncio no Performli', required: true, order: 1 },
            { label: 'Configurar e validar rastreamento (pixel/GA4)', required: true, order: 2 },
            { label: 'Agendar reunião de kickoff com o cliente', required: true, order: 3 },
            { label: 'Definir metas iniciais (ROAS / CPA)', required: true, order: 4 },
            { label: 'Estruturar a primeira campanha', required: false, order: 5 },
          ],
        },
        activities: { create: { actorId: session.userId, action: 'created' } },
      },
    })
  } catch {
    // tarefa de onboarding é best-effort; cliente já foi criado
  }

  // ClientOnboardingAgent — materializa as recorrentes + tarefas iniciais na
  // hora (sem esperar o cron). Best-effort: falha aqui NÃO quebra a criação do
  // cliente. Só roda se o cliente nasceu ACTIVE.
  if (client.status === 'ACTIVE') {
    try {
      await runClientOnboarding(client.id)
    } catch (err) {
      console.error('[onboarding] falha ao rodar runClientOnboarding:', err)
    }
  }

  redirect(`/clients/${client.slug}`)
}
