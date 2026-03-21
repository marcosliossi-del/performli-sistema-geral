'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardValue } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { BarChart3, Search } from 'lucide-react'
import { healthLabels } from '@/lib/health'
import { HealthStatus } from '@prisma/client'

const mockClients = [
  { id: '1', name: 'Loja Alpha' },
  { id: '2', name: 'E-commerce Beta' },
  { id: '3', name: 'Marca Gamma' },
]

const mockReport = {
  clientName: 'Loja Alpha',
  period: 'Semana atual (17/03 – 23/03)',
  metrics: [
    { name: 'ROAS', target: 4.0, actual: 4.4, unit: 'x', status: 'OTIMO' as HealthStatus, pct: 110 },
    { name: 'CPL', target: 25, actual: 31, unit: 'R$', status: 'REGULAR' as HealthStatus, pct: 78, lowerIsBetter: true },
    { name: 'Investimento', target: 5000, actual: 4900, unit: 'R$', status: 'OTIMO' as HealthStatus, pct: 98 },
    { name: 'Conversões', target: 80, actual: 56, unit: '', status: 'RUIM' as HealthStatus, pct: 70 },
    { name: 'CPA', target: 62, actual: 87, unit: 'R$', status: 'RUIM' as HealthStatus, pct: 58, lowerIsBetter: true },
    { name: 'CTR', target: 2.5, actual: 2.8, unit: '%', status: 'OTIMO' as HealthStatus, pct: 112 },
  ],
}

export default function ReportsPage() {
  const [selectedClient, setSelectedClient] = useState('')
  const [year, setYear] = useState('2026')

  const hasSelection = selectedClient !== ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#EBEBEB]">Relatórios de Performance</h1>
        <p className="text-[#87919E] text-sm mt-0.5">Gerencie KPIs semanais e mensais dos seus clientes</p>
      </div>

      {/* Filters */}
      <div className="flex items-end gap-4 bg-[#38435C]/20 border border-[#38435C] rounded-xl p-5">
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">Cliente</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#87919E]" />
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2] appearance-none transition-colors"
            >
              <option value="">PESQUISAR CLIENTE...</option>
              {mockClients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="w-32 space-y-1.5">
          <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">Ano</label>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-full h-10 px-3 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2] transition-colors"
          >
            <option value="2026">2026</option>
            <option value="2025">2025</option>
          </select>
        </div>
      </div>

      {!hasSelection ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-2xl bg-[#38435C]/50 flex items-center justify-center mb-4">
            <BarChart3 size={32} className="text-[#87919E]" />
          </div>
          <p className="text-[#EBEBEB] font-medium">Nenhum cliente selecionado</p>
          <p className="text-[#87919E] text-sm mt-1 max-w-xs">
            Selecione um cliente acima para visualizar seus relatórios de performance, KPIs e análises inteligentes.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Period info */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#EBEBEB]">{mockReport.clientName}</h2>
            <span className="text-sm text-[#87919E]">{mockReport.period}</span>
          </div>

          {/* Metrics grid */}
          <div className="grid grid-cols-3 gap-4">
            {mockReport.metrics.map((metric) => (
              <Card key={metric.name}>
                <CardHeader>
                  <CardTitle>{metric.name}</CardTitle>
                  <Badge
                    variant={metric.status.toLowerCase() as 'otimo' | 'regular' | 'ruim'}
                  >
                    {healthLabels[metric.status]}
                  </Badge>
                </CardHeader>
                <div className="space-y-3">
                  <div className="flex items-end gap-2">
                    <CardValue>
                      {metric.unit === 'R$' ? `R$ ${metric.actual.toLocaleString('pt-BR')}` : `${metric.actual}${metric.unit}`}
                    </CardValue>
                    <p className="text-xs text-[#87919E] mb-1.5">
                      / meta: {metric.unit === 'R$' ? `R$ ${metric.target.toLocaleString('pt-BR')}` : `${metric.target}${metric.unit}`}
                    </p>
                  </div>
                  <Progress value={Math.min(metric.pct, 100)} />
                  <p className="text-xs text-[#87919E]">
                    {Math.round(metric.pct)}% da meta atingido
                    {metric.lowerIsBetter && ' (menor = melhor)'}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
