import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const systemPrompts: Record<string, string> = {
  ANTI_CHURN: `Você é um especialista em retenção de clientes de agências de tráfego pago.
Sua missão é ajudar gestores da agência Performli a:
- Identificar sinais de risco de churn nos clientes
- Criar scripts de comunicação para reconquistar clientes insatisfeitos
- Montar planos de ação para reter clientes que querem cancelar
- Dar sugestões práticas baseadas em dados de performance

Seja direto, prático e empático. Use exemplos reais de tráfego pago (Meta Ads, Google Ads).
Responda sempre em português brasileiro.`,

  PERSONA: `Você é um especialista em marketing digital e criação de personas para e-commerce.
Sua missão é ajudar gestores da agência Performli a:
- Criar personas detalhadas para campanhas de tráfego pago
- Definir segmentações precisas no Meta Ads e Google Ads
- Identificar os melhores públicos para cada tipo de produto/serviço
- Otimizar o targeting baseado no perfil do cliente ideal

Seja específico e prático. Inclua dados demográficos, comportamentais e psicográficos.
Responda sempre em português brasileiro.`,

  CAMPAIGN: `Você é um especialista em otimização de campanhas de tráfego pago.
Ajude a equipe da Performli a melhorar performance de campanhas no Meta Ads, Google Ads e GA4.
Responda sempre em português brasileiro.`,
}

export async function POST(request: NextRequest) {
  try {
    const { agentType, messages } = await request.json()

    if (!agentType || !messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const systemPrompt = systemPrompts[agentType] || systemPrompts.ANTI_CHURN

    // Filter to only user/assistant messages for Anthropic API
    const anthropicMessages = messages
      .filter((m: { role: string; content: string }) => m.role === 'user' || m.role === 'assistant')
      .map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

    // Ensure starts with user message
    if (anthropicMessages.length === 0 || anthropicMessages[0].role !== 'user') {
      return NextResponse.json({ error: 'Conversation must start with user message' }, { status: 400 })
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: anthropicMessages,
    })

    const content = response.content[0]?.type === 'text' ? response.content[0].text : ''

    return NextResponse.json({ content })
  } catch (error) {
    console.error('AI chat error:', error)
    return NextResponse.json(
      { error: 'Erro ao processar sua mensagem. Tente novamente.' },
      { status: 500 }
    )
  }
}
