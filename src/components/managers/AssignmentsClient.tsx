'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, AlertTriangle, Loader2, Search, UserCheck, ArrowRight } from 'lucide-react'
import { updateClientPrimaryManager } from '@/app/actions/assignments'
import type { AssignmentClientRow, AssignmentManager } from '@/lib/dal'

const platformColors: Record<string, string> = {
  META_ADS:    '#1877F2',
  GOOGLE_ADS:  '#4285F4',
  GA4:         '#E37400',
  NUVEMSHOP:   '#1ED6A4',
}
const platformIcons: Record<string, string> = {
  META_ADS:   'M',
  GOOGLE_ADS: 'G',
  GA4:        'A',
  NUVEMSHOP:  'N',
}

function ManagerSelect({
  client,
  managers,
}: {
  client: AssignmentClientRow
  managers: AssignmentManager[]
}) {
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentManagerId, setCurrentManagerId] = useState(client.primaryManagerId ?? '')

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newId = e.target.value
    setCurrentManagerId(newId)
    setError(null)
    setSaved(false)

    startTransition(async () => {
      const res = await updateClientPrimaryManager(client.id, newId)
      if (res.error) {
        setError(res.error)
        setCurrentManagerId(client.primaryManagerId ?? '')
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <select
          value={currentManagerId}
          onChange={handleChange}
          disabled={pending}
          className="h-8 pl-3 pr-8 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2] appearance-none disabled:opacity-50 cursor-pointer transition-colors hover:border-[#95BBE2]/60 min-w-[160px]"
        >
          <option value="" disabled>— sem gestor —</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.clientCount})
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#87919E]">
          ▾
        </div>
      </div>

      <div className="w-5 flex items-center justify-center">
        {pending && <Loader2 size={14} className="text-[#95BBE2] animate-spin" />}
        {saved && !pending && <CheckCircle2 size={14} className="text-[#22C55E]" />}
        {error && !pending && <AlertTriangle size={14} className="text-[#EF4444]" />}
      </div>
    </div>
  )
}

interface Props {
  clients: AssignmentClientRow[]
  managers: AssignmentManager[]
}

export function AssignmentsClient({ clients, managers }: Props) {
  const [search, setSearch] = useState('')
  const [managerFilter, setManagerFilter] = useState<string>('ALL')

  const unassignedCount = clients.filter((c) => !c.primaryManagerId).length

  const filtered = clients.filter((c) => {
    const matchSearch = search === '' || c.name.toLowerCase().includes(search.toLowerCase())
    const matchManager =
      managerFilter === 'ALL'
        ? true
        : managerFilter === 'NONE'
        ? !c.primaryManagerId
        : c.primaryManagerId === managerFilter
    return matchSearch && matchManager
  })

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          className="bg-[#0A1E2C] border border-[#38435C] rounded-xl px-4 py-3 cursor-pointer hover:border-[#95BBE2]/50 transition-colors"
          onClick={() => setManagerFilter('ALL')}
        >
          <p className="text-[10px] text-[#87919E] uppercase tracking-wide">Total</p>
          <p className="text-2xl font-bold text-[#EBEBEB]">{clients.length}</p>
          <p className="text-[10px] text-[#87919E]">clientes ativos</p>
        </div>
        {managers.slice(0, 3).map((m) => (
          <div
            key={m.id}
            className="bg-[#0A1E2C] border border-[#38435C] rounded-xl px-4 py-3 cursor-pointer hover:border-[#95BBE2]/50 transition-colors"
            onClick={() => setManagerFilter(m.id)}
          >
            <p className="text-[10px] text-[#87919E] uppercase tracking-wide truncate">{m.name}</p>
            <p className="text-2xl font-bold text-[#95BBE2]">{m.clientCount}</p>
            <p className="text-[10px] text-[#87919E]">clientes</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#87919E]" />
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2] transition-colors"
          />
        </div>

        <select
          value={managerFilter}
          onChange={(e) => setManagerFilter(e.target.value)}
          className="h-9 px-3 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2] appearance-none"
        >
          <option value="ALL">Todos os gestores</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>{m.name} ({m.clientCount})</option>
          ))}
          {unassignedCount > 0 && (
            <option value="NONE">Sem gestor ({unassignedCount})</option>
          )}
        </select>

        <span className="text-xs text-[#87919E] ml-auto">
          {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Unassigned warning */}
      {unassignedCount > 0 && managerFilter === 'ALL' && (
        <div className="flex items-center gap-2 bg-[#F59E0B]/10 border border-[#F59E0B]/20 rounded-lg px-4 py-2.5">
          <AlertTriangle size={14} className="text-[#F59E0B] flex-shrink-0" />
          <p className="text-sm text-[#F59E0B]">
            {unassignedCount} cliente{unassignedCount !== 1 ? 's' : ''} sem gestor atribuído —
            atribua um gestor para que os dados apareçam no painel por gestor.
          </p>
        </div>
      )}

      {/* Table */}
      <div className="bg-[#38435C]/20 border border-[#38435C] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#38435C]">
              <th className="text-left text-xs font-semibold text-[#87919E] uppercase tracking-wider px-5 py-3">
                Cliente
              </th>
              <th className="text-left text-xs font-semibold text-[#87919E] uppercase tracking-wider px-4 py-3">
                Gestor Principal
              </th>
              <th className="text-left text-xs font-semibold text-[#87919E] uppercase tracking-wider px-4 py-3">
                Plataformas
              </th>
              {/* Saúde vive num LUGAR SÓ (decisão Marcos 2026-07-18): esta tela é
                  só atribuição de gestor; a saúde some daqui e vira link. */}
              <th className="text-right text-xs font-semibold text-[#87919E] uppercase tracking-wider px-4 py-3">
                Saúde
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#38435C]/50">
            {filtered.map((client) => (
              <tr key={client.id} className="hover:bg-[#38435C]/20 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#0A1E2C] flex items-center justify-center flex-shrink-0">
                      <span className="text-[#95BBE2] font-bold text-sm">
                        {client.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-[#EBEBEB]">{client.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <ManagerSelect client={client} managers={managers} />
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex gap-1">
                    {client.platforms.length === 0 ? (
                      <span className="text-xs text-[#87919E]">—</span>
                    ) : (
                      client.platforms.map((p) => (
                        <span
                          key={p}
                          className="w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center text-white"
                          style={{ backgroundColor: platformColors[p] ?? '#38435C' }}
                          title={p}
                        >
                          {platformIcons[p] ?? p[0]}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <a
                    href={`/clients/${client.slug}`}
                    className="inline-flex items-center gap-1 text-xs text-[#95BBE2] hover:underline"
                    title="Abrir a saúde do cliente no quadro único"
                  >
                    ver saúde <ArrowRight size={12} />
                  </a>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center">
                  <UserCheck size={28} className="text-[#38435C] mx-auto mb-2" />
                  <p className="text-sm text-[#87919E]">Nenhum cliente encontrado</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
