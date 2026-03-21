'use client'

import { useState } from 'react'
import { Bot, Send, Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type AgentType = 'ANTI_CHURN' | 'PERSONA'

const agents: Record<AgentType, {
  label: string
  description: string
  systemContext: string
  suggestions: { title: string; prompt: string }[]
}> = {
  ANTI_CHURN: {
    label: 'Anti Churn & Retenção',
    description: 'Especialista em retenção de clientes',
    systemContext: 'Você é um especialista em retenção de clientes de agências de tráfego pago. Ajude o gestor com estratégias práticas para manter e recuperar clientes insatisfeitos.',
    suggestions: [
      {
        title: 'Análise de risco',
        prompt: 'O cliente X está há 2 semanas sem responder. O que devo fazer?',
      },
      {
        title: 'Script de recuperação',
        prompt: 'Crie um script para ligar para um cliente insatisfeito com os resultados',
      },
      {
        title: 'Plano de ação',
        prompt: 'Monte um plano de ação para reter um cliente que quer cancelar',
      },
    ],
  },
  PERSONA: {
    label: 'Criação de Persona',
    description: 'Especialista em definição de público-alvo',
    systemContext: 'Você é um especialista em marketing digital e criação de personas. Ajude a definir personas detalhadas para campanhas de tráfego pago.',
    suggestions: [
      {
        title: 'Persona e-commerce',
        prompt: 'Crie uma persona para uma loja de roupas femininas 25-40 anos',
      },
      {
        title: 'Análise de público',
        prompt: 'Quais são os melhores públicos para campanhas de lead generation B2B?',
      },
      {
        title: 'Segmentação Meta',
        prompt: 'Como segmentar corretamente no Meta Ads para uma loja de cosméticos?',
      },
    ],
  },
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function AIAgentsPage() {
  const [activeAgent, setActiveAgent] = useState<AgentType>('ANTI_CHURN')
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Olá! Sou seu assistente de ${agents[activeAgent].description.toLowerCase()}. Como posso ajudar você hoje?`,
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const agent = agents[activeAgent]

  function switchAgent(type: AgentType) {
    setActiveAgent(type)
    setMessages([
      {
        role: 'assistant',
        content: `Olá! Sou seu assistente de ${agents[type].description.toLowerCase()}. Como posso ajudar você hoje?`,
      },
    ])
  }

  async function sendMessage(content: string) {
    if (!content.trim() || loading) return
    const userMsg: Message = { role: 'user', content }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentType: activeAgent,
          messages: [...messages, userMsg],
        }),
      })
      const data = await res.json()
      setMessages((prev) => [...prev, { role: 'assistant', content: data.content }])
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Erro ao conectar com a IA. Tente novamente.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 h-full">
      <div>
        <h1 className="text-2xl font-bold text-[#EBEBEB]">Agentes IA Suporte</h1>
        <p className="text-[#87919E] text-sm mt-0.5">Assistentes inteligentes para sua equipe</p>
      </div>

      {/* Agent tabs */}
      <div className="flex gap-2">
        {(Object.keys(agents) as AgentType[]).map((type) => (
          <button
            key={type}
            onClick={() => switchAgent(type)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              activeAgent === type
                ? 'bg-[#95BBE2]/15 text-[#95BBE2] border border-[#95BBE2]/30'
                : 'text-[#87919E] border border-[#38435C] hover:bg-[#38435C]/50'
            )}
          >
            <Bot size={14} />
            {agents[type].label}
          </button>
        ))}
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-3 gap-5" style={{ height: 'calc(100vh - 280px)' }}>
        {/* Chat area */}
        <div className="col-span-2 bg-[#38435C]/20 border border-[#38435C] rounded-xl flex flex-col overflow-hidden">
          {/* Agent header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[#38435C]">
            <div className="w-9 h-9 rounded-lg bg-[#95BBE2]/15 flex items-center justify-center">
              <Bot size={18} className="text-[#95BBE2]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#EBEBEB]">{agent.label}</p>
              <p className="text-xs text-[#87919E]">{agent.description}</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {messages.length === 1 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Bot size={32} className="text-[#38435C] mb-3" />
                <p className="text-[#87919E] text-sm">{messages[0].content}</p>
              </div>
            )}
            {messages.length > 1 &&
              messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex',
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[80%] rounded-xl px-4 py-3 text-sm',
                      msg.role === 'user'
                        ? 'bg-[#95BBE2] text-[#05141C]'
                        : 'bg-[#38435C] text-[#EBEBEB]'
                    )}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-[#38435C] rounded-xl px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#87919E] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-[#87919E] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-[#87919E] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-[#38435C]">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage(input)}
                placeholder="Digite sua mensagem..."
                className="flex-1 h-10 px-4 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2] transition-colors"
              />
              <Button size="icon" onClick={() => sendMessage(input)} disabled={loading}>
                <Send size={15} />
              </Button>
            </div>
          </div>
        </div>

        {/* Suggestions */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[#EBEBEB]">Sugestões de uso</h3>
          <p className="text-xs text-[#87919E]">Exemplos de como utilizar este agente</p>
          <div className="space-y-3 mt-2">
            {agent.suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => sendMessage(s.prompt)}
                className="w-full text-left bg-[#38435C]/20 border border-[#38435C] rounded-xl p-4 hover:bg-[#38435C]/40 transition-all group"
              >
                <div className="flex items-start gap-2">
                  <Lightbulb size={14} className="text-[#95BBE2] mt-0.5 flex-shrink-0 group-hover:text-[#EAB308] transition-colors" />
                  <div>
                    <p className="text-sm font-medium text-[#EBEBEB] mb-1">{s.title}</p>
                    <p className="text-xs text-[#87919E] italic">&quot;{s.prompt}&quot;</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
