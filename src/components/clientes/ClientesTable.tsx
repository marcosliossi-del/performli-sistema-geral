'use client'

import { useState } from 'react'
import { Search, Filter, Plus, MessageCircle, Pencil, Trash2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export interface ClientRow {
  id:            string
  name:          string
  slug:          string
  source:        string | null
  phone:         string | null
  email:         string | null
  status:        string
  contractValue: number | null
  createdAt:     string
}

interface Props {
  clients: ClientRow[]
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ACTIVE:  { label: 'Ativo',      color: '#22C55E' },
  PAUSED:  { label: 'Pausado',    color: '#F59E0B' },
  CHURNED: { label: 'Cancelado',  color: '#EF4444' },
}

export function ClientesTable({ clients }: Props) {
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState<'ALL' | 'ACTIVE' | 'PAUSED' | 'CHURNED'>('ALL')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const filtered = clients.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.phone ?? '').includes(search)
    const matchFilter = filter === 'ALL' || c.status === filter
    return matchSearch && matchFilter
  })

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(c => c.id)))
    }
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="bg-[#0D2137] border border-[#38435C] rounded-2xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#38435C]">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#87919E]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar clientes..."
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2] transition-colors"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 bg-[#0A1E2C] border border-[#38435C] rounded-lg p-1">
          {(['ALL', 'ACTIVE', 'PAUSED', 'CHURNED'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-[#38435C] text-[#EBEBEB]'
                  : 'text-[#87919E] hover:text-[#EBEBEB]'
              }`}
            >
              {f === 'ALL' ? 'Todos' : STATUS_LABELS[f].label}
            </button>
          ))}
        </div>

        <a
          href="/clients/new"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#22C55E] text-white hover:bg-[#16A34A] transition-colors ml-auto"
        >
          <Plus size={13} />
          Novo cliente
        </a>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#38435C] text-[#87919E] text-xs">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                  className="rounded border-[#38435C] bg-[#0A1E2C] accent-[#22C55E]"
                />
              </th>
              <th className="text-left px-3 py-3 font-medium">NOME</th>
              <th className="text-left px-3 py-3 font-medium">ORIGEM</th>
              <th className="text-left px-3 py-3 font-medium">TELEFONE</th>
              <th className="text-left px-3 py-3 font-medium">CONTRATO</th>
              <th className="text-left px-3 py-3 font-medium">STATUS</th>
              <th className="text-left px-3 py-3 font-medium">CRIADO EM</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-sm text-[#87919E]">
                  Nenhum cliente encontrado
                </td>
              </tr>
            ) : (
              filtered.map(client => {
                const st = STATUS_LABELS[client.status] ?? STATUS_LABELS.ACTIVE
                return (
                  <tr
                    key={client.id}
                    className="border-b border-[#38435C]/50 hover:bg-[#38435C]/10 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(client.id)}
                        onChange={() => toggleOne(client.id)}
                        className="rounded border-[#38435C] bg-[#0A1E2C] accent-[#22C55E]"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <a
                        href={`/clients/${client.slug}`}
                        className="font-medium text-[#EBEBEB] hover:text-[#95BBE2] transition-colors truncate max-w-[180px] block"
                      >
                        {client.name}
                      </a>
                      {client.email && (
                        <p className="text-[11px] text-[#87919E] truncate max-w-[180px]">{client.email}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-[#87919E]">
                      {client.source ?? <span className="text-[#38435C]">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs text-[#87919E]">
                      {client.phone ?? <span className="text-[#38435C]">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs font-semibold text-[#22C55E]">
                      {client.contractValue ? formatCurrency(client.contractValue) : <span className="text-[#38435C] font-normal">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ color: st.color, background: `${st.color}18` }}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-[#87919E]">
                      {new Date(client.createdAt).toLocaleDateString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                      })}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {client.phone && (
                          <a
                            href={`https://wa.me/55${client.phone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-[#25D366] hover:bg-[#25D366]/10 transition-colors"
                            title="WhatsApp"
                          >
                            <MessageCircle size={14} />
                          </a>
                        )}
                        <a
                          href={`/clients/${client.slug}`}
                          className="p-1.5 rounded-lg text-[#87919E] hover:text-[#EBEBEB] hover:bg-[#38435C]/40 transition-colors"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </a>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="px-4 py-3 border-t border-[#38435C] flex items-center justify-between">
          <p className="text-xs text-[#87919E]">
            {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
            {selected.size > 0 && ` · ${selected.size} selecionado${selected.size !== 1 ? 's' : ''}`}
          </p>
        </div>
      )}
    </div>
  )
}
