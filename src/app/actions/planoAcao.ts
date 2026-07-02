'use server'

import Anthropic from '@anthropic-ai/sdk'
import { requireSession } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import { getClientAIContext } from '@/lib/ai-client-context'
import { normalizeRole } from '@/lib/rbac'

const anthropic = new Anthropic()

export type PlanoAcaoResult = {
  diagnostico: string
  causaProvavel: string
  risco: 'alto' | 'medio' | 'baixo'
  acoes: { titulo: string; detalhe: string; prazo: string }[]
}

export type PlanoAcaoResponse = PlanoAcaoResult | { error: string }

/**
 * BLOCO 7 — IA operacional. Gera diagnóstico + plano de ação para um cliente
 * (Otimização / War Room) a partir do CONTEXTO REAL do cliente. Regra: não inventa
 * métrica — usa apenas o que está no contexto. Valida papel + posse.
 */
export async function generatePlanoAcao(clientId: string): Promise<PlanoAcaoResponse> {
  const session = await requireSession()
  // Staff amplo (ADMIN/CS/SUPERVISOR/ANALISTA) gera planos para qualquer
  // cliente; GESTOR_TRAFEGO apenas para clientes da carteira.
  if (normalizeRole(session.role) === 'GESTOR_TRAFEGO') {
    const owns = await prisma.clientAssignment.findFirst({ where: { clientId, userId: session.userId }, select: { id: true } })
    if (!owns) return { error: 'Você não tem acesso a este cliente.' }
  }

  const c = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      name: true, resultado: true, etapa: true, resultadoRoas: true,
      criticalProtocols: {
        where: { status: { not: 'ENCERRADO' } },
        select: { trigger: true, diagnosis: true, exitCriteria: true },
        take: 1,
      },
    },
  })
  if (!c) return { error: 'Cliente não encontrado.' }

  let context: string
  try {
    context = await getClientAIContext(clientId, session.role)
  } catch {
    return { error: 'Não foi possível montar o contexto do cliente. Verifique se GA4/Meta estão sincronizados.' }
  }

  const warroom = c.criticalProtocols[0]
  const situacao = [
    c.resultado ? `Resultado da última semana: ${c.resultado}${c.resultadoRoas != null ? ` (ROAS ${Number(c.resultadoRoas).toFixed(2)})` : ''}` : null,
    c.etapa ? `Etapa: ${c.etapa}` : null,
    warroom ? `EM WAR ROOM — gatilho: ${warroom.trigger}${warroom.exitCriteria ? ` · critério de saída: ${warroom.exitCriteria}` : ' · SEM critério de saída definido'}${warroom.diagnosis ? ` · diagnóstico do gestor: ${warroom.diagnosis}` : ''}` : null,
  ].filter(Boolean).join('\n')

  const prompt = `Você é um sócio-operador de uma agência de tráfego pago brasileira. Um cliente está em atenção/otimização. Gere um DIAGNÓSTICO e um PLANO DE AÇÃO concreto para recuperar a conta.

SITUAÇÃO ATUAL:
${situacao || '(sem sinais estruturados)'}

CONTEXTO REAL DO CLIENTE (dados do sistema — use SOMENTE estes números, não invente métricas):
${context}

Responda EXATAMENTE neste formato JSON (sem markdown, apenas JSON puro):
{
  "diagnostico": "<1-2 frases: o que está acontecendo com a conta, com base nos dados reais>",
  "causaProvavel": "<hipótese de causa mais provável (criativo saturado, público, orçamento, página, sazonalidade...)>",
  "risco": "<alto|medio|baixo>",
  "acoes": [
    { "titulo": "<ação curta e concreta>", "detalhe": "<como executar, específico>", "prazo": "<ex: esta semana | 48h | próxima semana>" }
  ]
}

Regras:
- Gere entre 3 e 5 ações, da mais urgente para a menos.
- Use apenas os números do contexto; se faltar dado, diga no diagnóstico em vez de inventar.
- Ações concretas (ex: "Pausar os 2 criativos com CTR < 0,8% e subir 3 UGC de 15s"), nunca genéricas.
- Português do Brasil, direto e operacional.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

    let parsed: PlanoAcaoResult | null = null
    try {
      parsed = JSON.parse(text) as PlanoAcaoResult
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        try { parsed = JSON.parse(match[0]) as PlanoAcaoResult } catch { parsed = null }
      }
    }
    if (!parsed || !parsed.diagnostico || !Array.isArray(parsed.acoes)) {
      return { error: 'A IA não retornou um plano válido. Tente novamente.' }
    }
    return parsed
  } catch {
    return { error: 'Não foi possível gerar o plano agora. Tente novamente em instantes.' }
  }
}
