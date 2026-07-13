import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSession } from '@/lib/session'
import { z } from 'zod'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Permissivo: `question` string não-vazia (já era obrigatória); `context`
// objeto opcional de campos livres (o handler lê números opcionais dele).
const bodySchema = z.object({
  question: z.string().min(1),
  context: z.record(z.string(), z.unknown()).nullish(),
})

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const raw = await request.json().catch(() => null)
    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Informe a pergunta a ser respondida.' }, { status: 400 })
    }
    const { question } = parsed.data
    const context = parsed.data.context as
      | {
          totalClients?: number
          criticalClients?: number
          warningClients?: number
          healthyClients?: number
          [key: string]: unknown
        }
      | undefined

    const contextSummary = context
      ? `Total de clientes ativos: ${context.totalClients ?? '?'}. Saudáveis: ${context.healthyClients ?? '?'}. Em atenção: ${context.warningClients ?? '?'}. Críticos: ${context.criticalClients ?? '?'}.`
      : 'Sem contexto disponível.'

    const systemPrompt = `Você é um analista de performance de tráfego pago. Responda em português, de forma direta e acionável.
Contexto atual do dashboard: ${contextSummary}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: question }],
    })

    const answer =
      response.content[0].type === 'text' ? response.content[0].text : ''

    return NextResponse.json({ answer })
  } catch (err) {
    console.error('[dashboard-chat]', err)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
