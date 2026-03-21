import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { healthLabels } from '@/lib/health'
import { HealthStatus } from '@prisma/client'
import { Plus, Search } from 'lucide-react'

const mockClients = [
  {
    id: '1', name: 'Loja Alpha', slug: 'loja-alpha', industry: 'E-commerce',
    status: 'ACTIVE', manager: 'Ana Lima', overallStatus: 'OTIMO' as HealthStatus,
    achievementPct: 95, platforms: ['META_ADS', 'GOOGLE_ADS'],
  },
  {
    id: '2', name: 'E-commerce Beta', slug: 'ecommerce-beta', industry: 'Moda',
    status: 'ACTIVE', manager: 'Carlos Souza', overallStatus: 'REGULAR' as HealthStatus,
    achievementPct: 74, platforms: ['META_ADS'],
  },
  {
    id: '3', name: 'Marca Gamma', slug: 'marca-gamma', industry: 'Cosméticos',
    status: 'ACTIVE', manager: 'Ana Lima', overallStatus: 'RUIM' as HealthStatus,
    achievementPct: 52, platforms: ['META_ADS', 'GOOGLE_ADS', 'GA4'],
  },
  {
    id: '4', name: 'Tech Delta', slug: 'tech-delta', industry: 'SaaS',
    status: 'ACTIVE', manager: 'Carlos Souza', overallStatus: 'OTIMO' as HealthStatus,
    achievementPct: 102, platforms: ['GOOGLE_ADS', 'GA4'],
  },
]

const platformIcons: Record<string, string> = {
  META_ADS: 'M',
  GOOGLE_ADS: 'G',
  GA4: 'A',
}

const platformColors: Record<string, string> = {
  META_ADS: '#1877F2',
  GOOGLE_ADS: '#4285F4',
  GA4: '#E37400',
}

export default function ClientsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#EBEBEB]">Meus Clientes</h1>
          <p className="text-[#87919E] text-sm mt-0.5">
            {mockClients.length} clientes ativos
          </p>
        </div>
        <Link href="/clients/new">
          <Button>
            <Plus size={16} />
            Novo Cliente
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#87919E]" />
        <input
          type="text"
          placeholder="Buscar cliente..."
          className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2] transition-colors"
        />
      </div>

      {/* Table */}
      <div className="bg-[#38435C]/20 border border-[#38435C] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#38435C]">
              <th className="text-left text-xs font-semibold text-[#87919E] uppercase tracking-wider px-5 py-3">
                Cliente
              </th>
              <th className="text-left text-xs font-semibold text-[#87919E] uppercase tracking-wider px-4 py-3">
                Gestor
              </th>
              <th className="text-left text-xs font-semibold text-[#87919E] uppercase tracking-wider px-4 py-3">
                Plataformas
              </th>
              <th className="text-left text-xs font-semibold text-[#87919E] uppercase tracking-wider px-4 py-3 w-48">
                Atingimento
              </th>
              <th className="text-left text-xs font-semibold text-[#87919E] uppercase tracking-wider px-4 py-3">
                Status
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#38435C]/50">
            {mockClients.map((client) => (
              <tr
                key={client.id}
                className="hover:bg-[#38435C]/20 transition-colors"
              >
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#0A1E2C] flex items-center justify-center flex-shrink-0">
                      <span className="text-[#95BBE2] font-bold text-sm">
                        {client.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#EBEBEB]">{client.name}</p>
                      <p className="text-xs text-[#87919E]">{client.industry}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <p className="text-sm text-[#87919E]">{client.manager}</p>
                </td>
                <td className="px-4 py-4">
                  <div className="flex gap-1">
                    {client.platforms.map((p) => (
                      <span
                        key={p}
                        className="w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center text-white"
                        style={{ backgroundColor: platformColors[p] }}
                        title={p}
                      >
                        {platformIcons[p]}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-xs text-[#87919E]">
                        {Math.round(client.achievementPct)}% da meta
                      </span>
                    </div>
                    <Progress value={Math.min(client.achievementPct, 100)} />
                  </div>
                </td>
                <td className="px-4 py-4">
                  <Badge
                    variant={client.overallStatus.toLowerCase() as 'otimo' | 'regular' | 'ruim'}
                  >
                    {healthLabels[client.overallStatus]}
                  </Badge>
                </td>
                <td className="px-4 py-4 text-right">
                  <Link
                    href={`/clients/${client.slug}`}
                    className="text-xs text-[#95BBE2] hover:underline"
                  >
                    Ver detalhes →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
