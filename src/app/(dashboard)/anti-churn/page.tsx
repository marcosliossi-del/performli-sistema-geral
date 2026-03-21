import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ShieldAlert, Phone, MessageSquare, CheckCircle } from 'lucide-react'

const atRiskClients = [
  {
    id: '1',
    name: 'Marca Gamma',
    manager: 'Ana Lima',
    weeksRuim: 3,
    lastContact: '7 dias atrás',
    riskLevel: 'ALTO',
    roas: 2.1,
    roasTarget: 4.0,
    actions: [],
  },
  {
    id: '2',
    name: 'E-commerce Beta',
    manager: 'Carlos Souza',
    weeksRuim: 1,
    lastContact: '2 dias atrás',
    riskLevel: 'MÉDIO',
    roas: 2.8,
    roasTarget: 3.5,
    actions: ['Ligação realizada'],
  },
]

const riskColors = {
  ALTO: 'ruim',
  MÉDIO: 'regular',
  BAIXO: 'otimo',
} as const

export default function AntiChurnPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#EBEBEB]">Anti Churn & Retenção</h1>
        <p className="text-[#87919E] text-sm mt-0.5">
          Clientes em risco identificados automaticamente
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-[#EF4444]">
          <p className="text-xs text-[#87919E] uppercase tracking-wider mb-1">Risco Alto</p>
          <p className="text-3xl font-bold text-[#EF4444]">1</p>
          <p className="text-xs text-[#87919E] mt-1">3+ semanas em Ruim</p>
        </Card>
        <Card className="border-l-4 border-l-[#EAB308]">
          <p className="text-xs text-[#87919E] uppercase tracking-wider mb-1">Risco Médio</p>
          <p className="text-3xl font-bold text-[#EAB308]">1</p>
          <p className="text-xs text-[#87919E] mt-1">1–2 semanas em Ruim</p>
        </Card>
        <Card className="border-l-4 border-l-[#22C55E]">
          <p className="text-xs text-[#87919E] uppercase tracking-wider mb-1">Recuperados</p>
          <p className="text-3xl font-bold text-[#22C55E]">0</p>
          <p className="text-xs text-[#87919E] mt-1">Este mês</p>
        </Card>
      </div>

      {/* At-risk clients */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-[#EBEBEB]">Clientes em Risco</h2>
        {atRiskClients.map((client) => (
          <Card key={client.id} className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#0A1E2C] flex items-center justify-center flex-shrink-0">
                  <ShieldAlert size={18} className="text-[#EF4444]" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-[#EBEBEB]">{client.name}</h3>
                    <Badge variant={riskColors[client.riskLevel as keyof typeof riskColors]}>
                      Risco {client.riskLevel}
                    </Badge>
                  </div>
                  <p className="text-xs text-[#87919E]">
                    Gestor: {client.manager} · Último contato: {client.lastContact}
                  </p>
                  <p className="text-xs text-[#87919E] mt-0.5">
                    {client.weeksRuim} semana(s) com performance Ruim ·{' '}
                    ROAS atual: <span className="text-[#EF4444]">{client.roas}x</span> / meta:{' '}
                    <span className="text-[#EBEBEB]">{client.roasTarget}x</span>
                  </p>
                  {client.actions.length > 0 && (
                    <div className="flex gap-2 mt-2">
                      {client.actions.map((a) => (
                        <span
                          key={a}
                          className="flex items-center gap-1 text-[10px] text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 rounded-full px-2 py-0.5"
                        >
                          <CheckCircle size={10} /> {a}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Phone size={13} />
                  Ligar
                </Button>
                <Button variant="outline" size="sm">
                  <MessageSquare size={13} />
                  Script IA
                </Button>
                <Button size="sm">
                  <CheckCircle size={13} />
                  Marcar Recuperado
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
