'use client'

import { useState, useRef, useEffect } from 'react'
import { ShoppingBag, HeartHandshake, Store, Send, Lightbulb, RotateCcw, Search, X, ChevronDown, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type AgentType = 'ECOMMERCE' | 'LOCAL' | 'CS'

type ClientOption = { id: string; name: string; industry: string | null; slug: string }

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
    greeting: 'Olá! Sou seu consultor de e-commerce e performance de mídia paga.\n\nPosso te ajudar com diagnóstico de campanhas, estrutura de Meta Ads e Google Ads, estratégias de conversão, sazonalidade e muito mais.\n\nSelecione um cliente acima para respostas personalizadas com base no histórico real, ou me faça uma pergunta geral!',
    suggestions: [
      { title: 'ROAS abaixo da meta', prompt: 'O ROAS do cliente está em 2.1x e a meta é 4x. As campanhas são no Meta Ads para uma loja de moda feminina com ticket médio de R$180. O que devo analisar e otimizar?' },
      { title: 'Estratégia Black Friday', prompt: 'Preciso montar uma estratégia de Black Friday para um e-commerce de cosméticos. Verba de R$15k no mês. Como estruturo as campanhas de antecipação, pico e pós-BF?' },
      { title: 'Queda nas conversões', prompt: 'O cliente teve queda de 40% nas conversões essa semana sem mudança de campanha. Taxa de conversão caiu de 2% para 1.1%. O que pode ser e como investigar?' },
      { title: 'Estrutura de campanhas', prompt: 'Qual é a estrutura ideal de campanhas no Meta Ads para um e-commerce de R$20k/mês de verba? Quantas campanhas, conjuntos e criativos devo ter?' },
      { title: 'GA4 vs Meta Ads divergência', prompt: 'O Meta Ads está reportando 80 conversões mas o GA4 mostra apenas 35. Como explico isso para o cliente e qual dado usar como referência?' },
      { title: 'PMax ou Shopping?', prompt: 'Para um e-commerce com catálogo de 500 produtos e verba de R$8k no Google, devo usar Performance Max ou campanhas de Shopping padrão? Quais são as diferenças práticas?' },
    ],
  },
  LOCAL: {
    label: 'Negócio Local',
    description: 'Delivery, clínicas, eletrônicos e negócios físicos',
    icon: Store,
    color: '#F59E0B',
    greeting: 'Olá! Sou seu especialista em tráfego pago para negócios locais.\n\nAtendo delivery, clínicas odontológicas, lojas de iPhone e eletrônicos, academias, salões e qualquer negócio com foco local.\n\nSelecione um cliente acima para respostas personalizadas com base no histórico real, ou me faça uma pergunta geral!',
    suggestions: [
      { title: 'Delivery sem pedidos', prompt: 'Tenho um cliente de delivery de hambúrguer artesanal. Gastamos R$2k no mês no Meta Ads mas os pedidos pelo iFood e WhatsApp estão estagnados. O que pode estar errado e como melhorar?' },
      { title: 'Leads para clínica odontológica', prompt: 'Uma clínica odontológica quer captar pacientes para implante dentário (ticket R$4.500). Verba de R$3k/mês no Meta Ads. Como estruturo as campanhas de lead e qual é o fluxo de atendimento ideal?' },
      { title: 'Loja de iPhone — concorrência de preço', prompt: 'Uma loja de iPhones seminovos está perdendo vendas para lojas grandes no Google. Verba de R$5k. Como competir com anúncios locais e qual campanha priorizar: Google Ads ou Meta?' },
      { title: 'Raio geográfico e segmentação', prompt: 'Qual é a melhor estratégia de segmentação geográfica para um restaurante que atende bairros específicos? Devo usar raio de distância, cidades ou bairros no Meta Ads?' },
      { title: 'WhatsApp como conversão', prompt: 'O cliente quer usar o WhatsApp como canal principal de vendas. Como configuro campanhas de Click to WhatsApp no Meta e quais métricas acompanhar para saber se está funcionando?' },
      { title: 'Sazonalidade negócio local', prompt: 'Uma clínica de estética tem queda de 40% em janeiro e fevereiro. Como planejar campanhas de baixa temporada para manter o fluxo de clientes nesses meses?' },
    ],
  },
  CS: {
    label: 'Sucesso do Cliente',
    description: 'Retenção, relacionamento e situações difíceis com clientes',
    icon: HeartHandshake,
    color: '#34D399',
    greeting: 'Olá! Sou seu especialista em Customer Success e retenção de clientes.\n\nPosso te ajudar com scripts para reuniões difíceis, planos de recuperação, apresentação de resultados ruins, sinais de churn e muito mais.\n\nSelecione um cliente acima para uma análise personalizada do caso, ou me faça uma pergunta geral!',
    suggestions: [
      { title: 'Cliente quer cancelar', prompt: 'Um cliente está ameaçando cancelar o contrato porque o ROAS caiu nas últimas 3 semanas. Ele está nervoso e mandou mensagem dizendo que está decepcionado. Como devo responder e conduzir essa situação?' },
      { title: 'Reunião de resultado ruim', prompt: 'Preciso apresentar os resultados de abril para um cliente de e-commerce onde o mês foi ruim: ROAS 1.8x (meta era 3.5x) e conversões 60% abaixo do esperado. Como estruturo essa reunião para não perder o cliente?' },
      { title: 'Cliente sumido', prompt: 'O cliente está há 2 semanas sem responder mensagens, não apareceu na última reunião e só respondeu com "ok" no último relatório. Quais são os sinais de risco e o que faço agora?' },
      { title: 'Plano de recuperação 30/60/90', prompt: 'Um cliente está insatisfeito há 45 dias com os resultados. Crie um plano de recuperação estruturado em 30/60/90 dias com ações concretas para reconquistar a confiança dele.' },
      { title: 'Alinhamento de expectativas', prompt: 'Um cliente novo está esperando dobrar o faturamento em 30 dias com R$5k de verba. Como faço o alinhamento de expectativas de forma diplomática sem desmotivar ele?' },
      { title: 'Roteiro de QBR', prompt: 'Preciso de um roteiro completo para uma reunião trimestral (QBR) com um cliente de e-commerce. Quais seções devo incluir e como apresentar os resultados de forma que gere valor percebido?' },
    ],
  },
}

const agentsByRole: Record<string, AgentType[]> = {
  ADMIN:   ['ECOMMERCE', 'LOCAL', 'CS'],
  CS:      ['ECOMMERCE', 'LOCAL', 'CS'],
  MANAGER: ['ECOMMERCE', 'LOCAL'],
  ANALYST: ['ECOMMERCE', 'LOCAL'],
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

function MessageBubble({ msg }: { msg: Message }) {
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

// ── Client Picker ─────────────────────────────────────────────────────────────

function ClientPicker({
  clients,
  selected,
  onSelect,
  agentColor,
}: {
  clients: ClientOption[]
  selected: ClientOption | null
  onSelect: (c: ClientOption | null) => void
  agentColor: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.industry ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div ref={containerRef} className="relative">
      {selected ? (
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium"
          style={{ backgroundColor: `${agentColor}15`, borderColor: `${agentColor}40`, color: agentColor }}
        >
          <User size={11} />
          <span className="max-w-[180px] truncate">{selected.name}</span>
          {selected.industry && <span className="text-[10px] opacity-60">— {selected.industry}</span>}
          <button
            onClick={() => onSelect(null)}
            className="ml-1 rounded-full hover:opacity-80"
            title="Remover cliente"
          >
            <X size={11} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-[#38435C] text-xs text-[#87919E] hover:border-[#95BBE2] hover:text-[#EBEBEB] transition-colors"
        >
          <Search size={11} />
          Selecionar cliente
          <ChevronDown size={11} />
        </button>
      )}

      {open && !selected && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-[#0A1E2C] border border-[#38435C] rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-[#38435C]">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-[#38435C]/30 rounded-lg">
              <Search size={12} className="text-[#87919E] flex-shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar cliente..."
                className="flex-1 bg-transparent text-xs text-[#EBEBEB] placeholder-[#87919E] outline-none"
              />
              {search && (
                <button onClick={() => setSearch('')}>
                  <X size={11} className="text-[#87919E]" />
                </button>
              )}
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-[#87919E] text-center py-6">Nenhum cliente encontrado</p>
            ) : (
              filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => { onSelect(c); setOpen(false); setSearch('') }}
                  className="w-full text-left px-4 py-2.5 hover:bg-[#38435C]/40 transition-colors group"
                >
                  <p className="text-xs font-medium text-[#EBEBEB]">{c.name}</p>
                  {c.industry && <p className="text-[10px] text-[#87919E] mt-0.5">{c.industry}</p>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AIAgentsClient({ role }: { role: string }) {
  const allowedTypes    = agentsByRole[role] ?? ['ECOMMERCE', 'LOCAL']
  const [activeAgent, setActiveAgent]       = useState<AgentType>(allowedTypes[0])
  const [messages, setMessages]             = useState<Message[]>([])
  const [input, setInput]                   = useState('')
  const [loading, setLoading]               = useState(false)
  const [clients, setClients]               = useState<ClientOption[]>([])
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const agent = agents[activeAgent]

  // Fetch accessible clients once
  useEffect(() => {
    fetch('/api/ai/clients')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setClients(data) })
      .catch(() => {})
  }, [])

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

  function handleSelectClient(c: ClientOption | null) {
    setSelectedClient(c)
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
        body: JSON.stringify({
          agentType: activeAgent,
          messages: newMessages,
          clientId: selectedClient?.id ?? null,
        }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.content || data.error || 'Erro ao processar.' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Erro ao conectar com a IA. Tente novamente.' }])
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
          <p className="text-[#87919E] text-sm mt-0.5">Consultores especializados com acesso ao histórico dos seus clientes</p>
        </div>
      </div>

      {/* Agent tabs */}
      <div className="flex gap-2 flex-wrap">
        {allowedTypes.map(type => {
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
          <div className="flex items-center gap-3 px-5 py-3 border-b border-[#38435C]">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${agent.color}20` }}>
              <Icon size={18} style={{ color: agent.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#EBEBEB]">{agent.label}</p>
              <p className="text-xs text-[#87919E] truncate">{agent.description}</p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={resetChat}
                className="flex items-center gap-1.5 text-xs text-[#87919E] hover:text-[#EBEBEB] transition-colors px-2 py-1 rounded hover:bg-[#38435C]/50 flex-shrink-0"
              >
                <RotateCcw size={12} />
                Nova conversa
              </button>
            )}
          </div>

          {/* Client context bar */}
          <div className="flex items-center gap-3 px-5 py-2.5 border-b border-[#38435C]/50 bg-[#38435C]/10">
            <span className="text-[11px] text-[#87919E] flex-shrink-0">Consultando sobre:</span>
            <ClientPicker
              clients={clients}
              selected={selectedClient}
              onSelect={handleSelectClient}
              agentColor={agent.color}
            />
            {selectedClient && (
              <span className="text-[10px] text-[#87919E] ml-auto flex-shrink-0">
                Histórico e dados reais disponíveis
              </span>
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
                {selectedClient && (
                  <div
                    className="mt-4 px-4 py-2 rounded-lg text-xs"
                    style={{ backgroundColor: `${agent.color}15`, color: agent.color }}
                  >
                    Contexto completo de <strong>{selectedClient.name}</strong> carregado — perguntas serão respondidas com dados reais do cliente.
                  </div>
                )}
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
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage(input)
                  }
                }}
                placeholder={
                  selectedClient
                    ? `Pergunte sobre ${selectedClient.name}... (Enter para enviar)`
                    : 'Digite sua dúvida... (Enter para enviar, Shift+Enter para nova linha)'
                }
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
                  <Lightbulb size={13} className="mt-0.5 flex-shrink-0" style={{ color: agent.color }} />
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
