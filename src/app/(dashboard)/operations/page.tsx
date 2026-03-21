'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, BookOpen, Plus } from 'lucide-react'
import { timeAgo } from '@/lib/utils'

const mockClients = [
  { id: '1', name: 'Loja Alpha' },
  { id: '2', name: 'E-commerce Beta' },
  { id: '3', name: 'Marca Gamma' },
]

const mockOperations = [
  {
    id: '1',
    clientId: '1',
    clientName: 'Loja Alpha',
    subject: 'Ajuste de segmentação',
    requested: 'Cliente pediu para ampliar o público para 25-45 anos',
    done: 'Atualizei os conjuntos de anúncios para o novo range de idade e ajustei os interesses',
    notes: 'Acompanhar CPC nos próximos 3 dias',
    user: 'Ana Lima',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: '2',
    clientId: '2',
    clientName: 'E-commerce Beta',
    subject: 'Revisão de criativos',
    requested: 'Campanha de remarketing com novos criativos para produto lançado',
    done: 'Criados 4 novos anúncios com imagem do produto, configurado público de remarketing 7d',
    notes: '',
    user: 'Carlos Souza',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  },
]

export default function OperationsPage() {
  const [selectedClient, setSelectedClient] = useState('')
  const [formData, setFormData] = useState({
    subject: '',
    clientId: '',
    requested: '',
    done: '',
    notes: '',
  })
  const [searchTerm, setSearchTerm] = useState('')

  const filteredOperations = mockOperations.filter(
    (op) =>
      (!selectedClient || op.clientId === selectedClient) &&
      (!searchTerm ||
        op.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
        op.requested.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    alert('Operação registrada! (integração com banco em breve)')
    setFormData({ subject: '', clientId: '', requested: '', done: '', notes: '' })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#EBEBEB]">Registro de Operações</h1>
        <p className="text-[#87919E] text-sm mt-0.5">Documentação interna acumulativa por cliente</p>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Form */}
        <div className="col-span-2">
          <Card>
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-[#95BBE2]/15 flex items-center justify-center">
                <BookOpen size={14} className="text-[#95BBE2]" />
              </div>
              <h2 className="text-sm font-semibold text-[#EBEBEB]">Nova Entrada</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#95BBE2] uppercase tracking-wider">
                  Assunto *
                </label>
                <Input
                  placeholder="Título ou assunto da anotação"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#95BBE2] uppercase tracking-wider">
                  Cliente *
                </label>
                <select
                  value={formData.clientId}
                  onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                  required
                  className="w-full h-10 px-3 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2] transition-colors"
                >
                  <option value="">Selecionar cliente</option>
                  {mockClients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#95BBE2] uppercase tracking-wider">
                  O que foi solicitado *
                </label>
                <textarea
                  placeholder="Descreva o que o cliente solicitou..."
                  value={formData.requested}
                  onChange={(e) => setFormData({ ...formData, requested: e.target.value })}
                  required
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2] transition-colors resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#95BBE2] uppercase tracking-wider">
                  O que foi feito *
                </label>
                <textarea
                  placeholder="Descreva as ações realizadas..."
                  value={formData.done}
                  onChange={(e) => setFormData({ ...formData, done: e.target.value })}
                  required
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2] transition-colors resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">
                  Observações
                </label>
                <textarea
                  placeholder="Observações adicionais..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2] transition-colors resize-none"
                />
              </div>

              <Button type="submit" className="w-full">
                <Plus size={16} />
                Registrar Operação
              </Button>
            </form>
          </Card>
        </div>

        {/* Records */}
        <div className="col-span-3 space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#87919E]" />
              <input
                type="text"
                placeholder="Buscar por assunto ou conteúdo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2] transition-colors"
              />
            </div>
            <span className="text-xs text-[#87919E] whitespace-nowrap">
              {filteredOperations.length} registros
            </span>
          </div>

          {filteredOperations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <BookOpen size={32} className="text-[#38435C] mb-3" />
              <p className="text-[#87919E] text-sm">Selecione um cliente no formulário à esquerda</p>
              <p className="text-[#87919E]/60 text-xs mt-1">para visualizar o registro de operações.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOperations.map((op) => (
                <Card key={op.id} className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-[#EBEBEB]">{op.subject}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-[#95BBE2]">{op.clientName}</span>
                        <span className="text-[#38435C]">•</span>
                        <span className="text-xs text-[#87919E]">{op.user}</span>
                        <span className="text-[#38435C]">•</span>
                        <span className="text-xs text-[#87919E]">{timeAgo(op.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-[10px] font-semibold text-[#87919E] uppercase tracking-wider mb-0.5">
                        Solicitado
                      </p>
                      <p className="text-xs text-[#EBEBEB]/80">{op.requested}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-[#87919E] uppercase tracking-wider mb-0.5">
                        Feito
                      </p>
                      <p className="text-xs text-[#EBEBEB]/80">{op.done}</p>
                    </div>
                    {op.notes && (
                      <div>
                        <p className="text-[10px] font-semibold text-[#87919E] uppercase tracking-wider mb-0.5">
                          Obs.
                        </p>
                        <p className="text-xs text-[#87919E]">{op.notes}</p>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
