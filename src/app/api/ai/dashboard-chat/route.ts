import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSession } from '@/lib/session'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { question, context } = body as {
      question: string
      context: {
        totalClients?: number
        criticalClients?: number
        warningClients?: number
        healthyClients?: number
        [key: string]: unknown
      }
    }

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'question is required' }, { status: 400 })
    }

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
