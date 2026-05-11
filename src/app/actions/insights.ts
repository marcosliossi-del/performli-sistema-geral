'use server'

import Anthropic from '@anthropic-ai/sdk'
import { requireSession } from '@/lib/dal'
import type { ClientProgress } from './progress'

const client = new Anthropic()

export type InsightItem = {
  level: 'critical' | 'warning' | 'ok'
  pillar: string       // "CTR" | "Conversão" | "Ticket Médio" | etc.
  finding: string      // "CTR 0.8% — abaixo do benchmark (1.5%)"
  action: string       // "Teste 3 novos criativos com gatilho de urgência..."
}

export type ClientInsight = {
  summary: string       // 1-sentence diagnosis
  priority: string      // top action to take right now
  items: InsightItem[]
  riskLevel: 'alto' | 'medio' | 'baixo'
}

// E-commerce benchmarks (conservative/realistic for Brazilian digital market)
const BENCHMARKS = {
  ctr:           { bad: 0.8,  ok: 1.5,  good: 2.5,  unit: '%'  },
  roas:          { bad: 2.5,  ok: 4.0,  good: 7.0,  unit: 'x'  },
  taxaConversao: { bad: 0.8,  ok: 1.5,  good: 3.0,  unit: '%'  },
  ticketMedio:   { bad: 80,   ok: 200,  good: 500,  unit: 'R$' },
  cpc:           { bad: 3.0,  ok: 1.5,  good: 0.8,  unit: 'R$', lowerIsBetter: true },
}

export async function generateClientInsight(
  data: ClientProgress,
): Promise<ClientInsight> {
  await requireSession()

  const fmt = (v: number | null, unit: string, decimals = 2) =>
    v != null ? `${v.toFixed(decimals)}${unit}` : 'sem dados'

  const pctMonth = Math.round(data.pctMonthElapsed * 100)
  const pctGoal  = data.pctGoalAchieved != null ? Math.round(data.pctGoalAchieved) : null

  const metricsText = `
CLIENTE: ${data.name} | GESTOR: ${data.managerName}
Progresso do mês: ${pctMonth}% do mês decorrido | ${pctGoal != null ? pctGoal + '% da meta batida' : 'sem meta de faturamento definida'}

── METAS vs REALIZADO ──
Faturamento:   meta ${fmt(data.goalFaturamento, '', 0)}  |  atual ${fmt(data.revenue, '', 0)}  |  projeção ${fmt(data.projection, '', 0)}
Budget:        meta ${fmt(data.goalSpend, '', 0)}  |  gasto ${fmt(data.spend, '', 0)}
ROAS:          meta ${fmt(data.goalRoas, 'x')}  |  atual ${fmt(data.roas, 'x')}

── MÉTRICAS DE PERFORMANCE ──
CTR:              ${fmt(data.ctr, '%')}  (benchmark: 1.5%)
CPC:              ${fmt(data.cpc, '', 2)} R$  (benchmark: R$1.50)
Taxa de Conversão:${fmt(data.taxaConversao, '%')}  (benchmark: 1.5%)
Ticket Médio:     ${fmt(data.ticketMedio, '', 0)} R$  (benchmark: R$200)
Compras (GA4):    ${data.purchases}
Sessões (GA4):    ${data.sessions}

── HISTÓRICO ──
Faturamento mês anterior: ${fmt(data.prevRevenue, '', 0)} R$
Ticket Médio mês anterior: ${fmt(data.prevTicketMedio, '', 0)} R$
`.trim()

  const prompt = `Você é um especialista em marketing digital e e-commerce brasileiro. Analise os dados abaixo e gere um diagnóstico estratégico para o gestor da conta.

${metricsText}

Responda EXATAMENTE neste formato JSON (sem markdown, apenas JSON puro):
{
  "summary": "<1 frase: diagnóstico principal do momento da conta>",
  "priority": "<1 ação concreta e específica que o gestor deve fazer AGORA>",
  "riskLevel": "<alto|medio|baixo baseado no risco de não bater a meta>",
  "items": [
    {
      "level": "<critical|warning|ok>",
      "pillar": "<nome do pilar: CTR | Conversão | Ticket Médio | ROAS | Budget | Criativos | etc.>",
      "finding": "<achado específico com número: ex: CTR 0.8% — 47% abaixo do benchmark (1.5%)>",
      "action": "<ação específica e prática para o gestor executar esta semana>"
    }
  ]
}

Regras:
- Gere entre 3 e 5 itens, ordenados do mais crítico ao menos crítico
- Use dados reais fornecidos, não invente métricas
- Ações devem ser concretas (ex: "Teste 3 criativos com vídeo UGC de 15s"), não genéricas ("melhore os anúncios")
- Se não houver dados suficientes para um pilar, não inclua o item
- Considere sazonalidade e o % do mês decorrido ao avaliar risco
- Pense como um sócio da agência que quer reter o cliente`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''

  // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

  try {
    const parsed = JSON.parse(text) as ClientInsight
    // Ensure required fields exist
    if (!parsed.summary || !parsed.items) throw new Error('missing fields')
    return parsed
  } catch (e) {
    // Re-try: extract JSON object from anywhere in the text
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        const parsed = JSON.parse(match[0]) as ClientInsight
        if (parsed.summary && parsed.items) return parsed
      } catch { /* fall through */ }
    }
    console.error('[insights] JSON parse failed:', e, '\nraw:', raw.slice(0, 300))
    return {
      summary: 'Não foi possível gerar análise agora. Tente novamente.',
      priority: 'Certifique-se de que GA4 e Meta Ads estão sincronizados para ter dados suficientes.',
      riskLevel: 'medio',
      items: [],
    }
  }
}
