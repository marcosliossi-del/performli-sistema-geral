'use client'

import { useState, useRef, useEffect } from 'react'
import { ShoppingBag, HeartHandshake, Send, Lightbulb, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type AgentType = 'ECOMMERCE' | 'CS'

const agents: Record<AgentType, {
  label: string
  description: string
  icon: React.ElementType
  color: string
  greeting: string
  suggestions: { title: string; prompt: string }[]
}> = {
  ECOMMERCE: {
    label: 'Especialista E-commerce',
    description: 'Performance, campanhas e estratégia para lojas virtuais',
    icon: ShoppingBag,
    color: '#95BBE2',
    greeting: 'Olá! Sou seu consultor de e-commerce e performance de mídia paga.\n\nPosso te ajudar com diagnóstico de campanhas, estrutura de Meta Ads e Google Ads, estratégias de conversão, sazonalidade, benchmarks do mercado e muito mais.\n\nQual é a dúvida ou situação do seu cliente hoje?',
    suggestions: [
      {
        title: 'ROAS abaixo da meta',
        prompt: 'O ROAS do cliente está em 2.1x e a meta é 4x. As campanhas são no Meta Ads para uma loja de moda feminina com ticket médio de R$180. O que devo analisar e otimizar?',
      },
      {
        title: 'Estratégia Black Friday',
        prompt: 'Preciso montar uma estratégia de Black Friday para um e-commerce de cosméticos. Verba de R$15k no mês. Como estruturo as campanhas de antecipação, pico e pós-BF?',
      },
      {
        title: 'Queda nas conversões',
        prompt: 'O cliente teve queda de 40% nas conversões essa semana sem mudança de campanha. Taxa de conversão caiu de 2% para 1.1%. O que pode ser e como investigar?',
      },
      {
        title: 'Estrutura de campanhas',
        prompt: 'Qual é a estrutura ideal de campanhas no Meta Ads para um e-commerce de R$20k/mês de verba? Quantas campanhas, conjuntos e criativos devo ter?',
      },
      {
        title: 'GA4 vs Meta Ads divergência',
        prompt: 'O Meta Ads está reportando 80 conversões mas o GA4 mostra apenas 35. Como explico isso para o cliente e qual dado usar como referência?',
      },
      {
        title: 'PMax ou Shopping?',
        prompt: 'Para um e-commerce com catálogo de 500 produtos e verba de R$8k no Google, devo usar Performance Max ou campanhas de Shopping padrão? Quais são as diferenças práticas?',
      },
    ],
  },
  CS: {
    label: 'Sucesso do Cliente',
    description: 'Retenção, relacionamento e situações difíceis com clientes',
    icon: HeartHandshake,
    color: '#34D399',
    greeting: 'Olá! Sou seu especialista em Customer Success e retenção de clientes.\n\nPosso te ajudar com scripts para reuniões difíceis, planos de recuperação de contas, como apresentar resultados ruins, sinais de churn e muito mais.\n\nMe conta: o que está acontecendo com seu cliente?',
    suggestions: [
      {
        title: 'Cliente quer cancelar',
        prompt: 'Um cliente está ameaçando cancelar o contrato porque o ROAS caiu nas últimas 3 semanas. Ele está nervoso e mandou mensagem dizendo que está decepcionado. Como devo responder e conduzir essa situação?',
      },
      {
        title: 'Reunião de resultado ruim',
        prompt: 'Preciso apresentar os resultados de abril para um cliente de e-commerce onde o mês foi ruim: ROAS 1.8x (meta era 3.5x) e conversões 60% abaixo do esperado. Como estruturo essa reunião para não perder o cliente?',
      },
      {
        title: 'Cliente sumido',
        prompt: 'O cliente está há 2 semanas sem responder mensagens, não apareceu na última reunião e só respondeu com "ok" no último relatório. Quais são os sinais de risco e o que faço agora?',
      },
      {
        title: 'Plano de recuperação 30/60/90',
        prompt: 'Um cliente está insatisfeito há 45 dias com os resultados. Crie um plano de recuperação estruturado em 30/60/90 dias com ações concretas para reconquistar a confiança dele.',
      },
      {
        title: 'Alinhamento de expectativas',
        prompt: 'Um cliente novo está esperando dobrar o faturamento em 30 dias com R$5k de verba. Como faço o alinhamento de expectativas de forma diplomática sem desmotivar ele?',
      },
      {
        title: 'Roteiro de QBR',
        prompt: 'Preciso de um roteiro completo para uma reunião trimestral (QBR) com um cliente de e-commerce. Quais seções devo incluir e como apresentar os resultados de forma que gere valor percebido?',
      },
    ],
  },
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

function MessageBubble({ msg }: { msg: Message }) {
  // Render line breaks and basic bold (**text**)
  const formatted = msg.content
    .split('\n')
    .map((line, i, arr) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/)
      return (
        <span key={i}>
          {parts.map((part, j) =>
            part.startsWith('**') && part.endsWith('**')
              ? <strong key={j}>{part.slice(2, -2)}</strong>
              : part
          )}
          {i < arr.length - 1 && <br />}
        </span>
      )
    })

  return (
    <div className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed',
          msg.role === 'user'
            ? 'bg-[#95BBE2] text-[#05141C]'
            : 'bg-[#38435C] text-[#EBEBEB]'
        )}
      >
        {formatted}
      </div>
    </div>
  )
}

export default function AIAgentsPage() {
  const [activeAgent, setActiveAgent] = useState<AgentType>('ECOMMERCE')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const agent = agents[activeAgent]

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function switchAgent(type: AgentType) {
    setActiveAgent(type)
    setMessages([])
    setInput('')
  }

  function resetChat() {
    setMessages([])
    setInput('')
  }

  async function sendMessage(content: string) {
    if (!content.trim() || loading) return
    const userMsg: Message = { role: 'user', content }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentType: activeAgent, messages: newMessages }),
      })
      const data = await res.json()
      setMessages((prev) => [...prev, { role: 'assistant', content: data.content || data.error || 'Erro ao processar.' }])
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Erro ao conectar com a IA. Tente novamente.' }])
    } finally {
      setLoading(false)
    }
  }

  const Icon = agent.icon

  return (
    <div className="space-y-4 h-full">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#EBEBEB]">Agentes IA</h1>
          <p className="text-[#87919E] text-sm mt-0.5">Consultores especializados para sua equipe</p>
        </div>
      </div>

      {/* Agent tabs */}
      <div className="flex gap-2">
        {(Object.keys(agents) as AgentType[]).map((type) => {
          const a = agents[type]
          const TabIcon = a.icon
          return (
            <button
              key={type}
              onClick={() => switchAgent(type)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                activeAgent === type
                  ? 'text-[#EBEBEB] border'
                  : 'text-[#87919E] border border-[#38435C] hover:bg-[#38435C]/50'
              )}
              style={activeAgent === type ? {
                backgroundColor: `${a.color}18`,
                borderColor: `${a.color}50`,
                color: a.color,
              } : {}}
            >
              <TabIcon size={14} />
              {a.label}
            </button>
          )
        })}
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-3 gap-5" style={{ height: 'calc(100vh - 280px)' }}>
        {/* Chat area */}
        <div className="col-span-2 bg-[#38435C]/20 border border-[#38435C] rounded-xl flex flex-col overflow-hidden">
          {/* Agent header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[#38435C]">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${agent.color}20` }}>
              <Icon size={18} style={{ color: agent.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#EBEBEB]">{agent.label}</p>
              <p className="text-xs text-[#87919E] truncate">{agent.description}</p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={resetChat}
                className="flex items-center gap-1.5 text-xs text-[#87919E] hover:text-[#EBEBEB] transition-colors px-2 py-1 rounded hover:bg-[#38435C]/50"
              >
                <RotateCcw size={12} />
                Nova conversa
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: `${agent.color}15` }}>
                  <Icon size={28} style={{ color: agent.color }} />
                </div>
                <p className="text-sm font-semibold text-[#EBEBEB] mb-2">{agent.label}</p>
                <p className="text-xs text-[#87919E] leading-relaxed whitespace-pre-line">{agent.greeting}</p>
              </div>
            ) : (
              messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)
            )}
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
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-[#38435C]">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage(input)
                  }
                }}
                placeholder="Digite sua dúvida... (Enter para enviar, Shift+Enter para nova linha)"
                rows={2}
                className="flex-1 px-4 py-2.5 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2] transition-colors resize-none"
              />
              <Button size="icon" onClick={() => sendMessage(input)} disabled={loading} className="self-end h-10 w-10">
                <Send size={15} />
              </Button>
            </div>
          </div>
        </div>

        {/* Suggestions */}
        <div className="flex flex-col gap-3 overflow-y-auto">
          <div>
            <h3 className="text-sm font-semibold text-[#EBEBEB]">Sugestões de uso</h3>
            <p className="text-xs text-[#87919E] mt-0.5">Clique para enviar direto ao agente</p>
          </div>
          <div className="space-y-2">
            {agent.suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => sendMessage(s.prompt)}
                disabled={loading}
                className="w-full text-left bg-[#38435C]/20 border border-[#38435C] rounded-xl p-3.5 hover:bg-[#38435C]/40 transition-all group disabled:opacity-50"
              >
                <div className="flex items-start gap-2">
                  <Lightbulb size={13} className="mt-0.5 flex-shrink-0 transition-colors" style={{ color: agent.color }} />
                  <div>
                    <p className="text-xs font-semibold text-[#EBEBEB] mb-1">{s.title}</p>
                    <p className="text-[11px] text-[#87919E] leading-relaxed line-clamp-2">{s.prompt}</p>
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
