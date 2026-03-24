'use server'

import { revalidatePath } from 'next/cache'
import { requireSession } from '@/lib/dal'
import { generateCampaignInsights } from '@/services/campaign-insight-generator'

export type CampaignInsightState = {
  error?: string
  success?: boolean
  content?: string
}

export async function generateCampaignInsight(
  prevState: CampaignInsightState,
  formData: FormData
): Promise<CampaignInsightState> {
  await requireSession()

  const clientId   = formData.get('clientId')   as string
  const clientSlug = formData.get('clientSlug') as string

  if (!clientId) return { error: 'Cliente não informado.' }

  const content = await generateCampaignInsights(clientId)

  if (!content) {
    return {
      error: 'Não foi possível gerar análise. Verifique se há dados de campanha sincronizados (últimos 7 dias).',
    }
  }

  revalidatePath(`/clients/${clientSlug}`)
  return { success: true, content }
}
