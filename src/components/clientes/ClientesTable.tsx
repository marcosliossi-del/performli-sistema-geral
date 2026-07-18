'use client'

import { useState, useTransition } from 'react'
import { Search, Plus, MessageCircle, Pencil, ShoppingCart, MapPin, ArrowRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { bulkSetBusinessType } from '@/app/actions/updateClient'
import { ClientIdentity } from '@/components/clients/ClientIdentity'

export interface ClientRow {
  id:            string
  name:          string
  razaoSocial:   string | null
  slug:          string
  source:        string | null
  phone:         string | null
  email:         string | null
  status:        string
  pausedAt:      string | null
  pauseReason:   string | null
  contractValue: number | null
  createdAt:     string
  businessType:  string
  resultado:          string | null
  etapa:              string | null
  resultadoRoas:      number | null
  resultadoUpdatedAt: string | null
  nps:                string | null
  relacionamento:     string | null
  curva:              string | null
}

const ETAPA_CONFIG: Record<string, { label: string; color: string }> = {
  ESCALA:        { label: 'Escala',        color: '#34c97a' },
  MONITORAMENTO: { label: 'Monitoramento', color: '#54e0ee' },
  OTIMIZACAO:    { label: 'Otimização',    color: '#e3ad45' },
}
const REL_CONFIG: Record<string, { label: string; color: string }> = {
  OTIMO:   { label: 'Ótimo',   color: '#34c97a' },
  BOM:     { label: 'Bom',     color: '#54e0ee' },
  REGULAR: { label: 'Regular', color: '#e3ad45' },
  RUIM:    { label: 'Ruim',    color: '#ff5e6a' },
  PESSIMO: { label: 'Péssimo', color: '#ff3b4e' },
}
const NPS_CONFIG: Record<string, { label: string; color: string }> = {
  PROMOTOR: { label: 'Promotor', color: '#34c97a' },
  NEUTRO:   { label: 'Neutro',   color: '#e3ad45' },
  DETRATOR: { label: 'Detrator', color: '#ff5e6a' },
}
const CURVA_CONFIG: Record<string, { label: string; color: string }> = {
  A: { label: 'A', color: '#34c97a' },
  B: { label: 'B', color: '#54e0ee' },
  C: { label: 'C', color: '#e3ad45' },
}

interface Props {
  clients: ClientRow[]
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ACTIVE:  { label: 'Ativo',     color: '#22C55E' },
  PAUSED:  { label: 'Pausado',   color: '#F59E0B' },
  CHURNED: { label: 'Cancelado', color: '#EF4444' },
}

const TYPE_CONFIG = {
  ECOMMERCE: { label: 'E-commerce', icon: ShoppingCart, color: '#95BBE2' },
  LOCAL:     { label: 'Local',       icon: MapPin,       color: '#A78BFA' },
}

export function ClientesTable({ clients }: Props) {
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState<'ALL' | 'ACTIVE' | 'PAUSED' | 'CHURNED'>('ALL')
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'ECOMMERCE' | 'LOCAL'>('ALL')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const filtered = clients.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.phone ?? '').includes(search)
    const matchFilter = filter === 'ALL' || c.status === filter
    const matchType   = typeFilter === 'ALL' || c.businessType === typeFilter
    return matchSearch && matchFilter && matchType
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

  function handleBulkSet(type: 'ECOMMERCE' | 'LOCAL') {
    startTransition(async () => {
      await bulkSetBusinessType(Array.from(selected), type)
      setSelected(new Set())
    })
  }

  return (
    <div className="card overflow-hidden">
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

        {/* Status filter */}
        <div className="flex items-center gap-1 bg-[#0A1E2C] border border-[#38435C] rounded-lg p-1">
          {(['ALL', 'ACTIVE', 'PAUSED', 'CHURNED'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                filter === f ? 'bg-[#38435C] text-[#EBEBEB]' : 'text-[#87919E] hover:text-[#EBEBEB]'
              }`}
            >
              {f === 'ALL' ? 'Todos' : STATUS_LABELS[f].label}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-1 bg-[#0A1E2C] border border-[#38435C] rounded-lg p-1">
          {(['ALL', 'ECOMMERCE', 'LOCAL'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                typeFilter === t ? 'bg-[#38435C] text-[#EBEBEB]' : 'text-[#87919E] hover:text-[#EBEBEB]'
              }`}
            >
              {t === 'ALL' ? 'Todos tipos' : TYPE_CONFIG[t].label}
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

      {/* Bulk action bar — appears when rows are selected */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-[#95BBE2]/10 border-b border-[#95BBE2]/30">
          <span className="text-xs text-[#95BBE2] font-medium">
            {selected.size} cliente{selected.size !== 1 ? 's' : ''} selecionado{selected.size !== 1 ? 's' : ''}
          </span>
          <span className="text-[#38435C]">·</span>
          <span className="text-xs text-[#87919E]">Definir tipo como:</span>
          <button
            onClick={() => handleBulkSet('ECOMMERCE')}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#95BBE2]/20 text-[#95BBE2] text-xs font-semibold hover:bg-[#95BBE2]/30 disabled:opacity-50 transition-colors"
          >
            <ShoppingCart size={12} />
            E-commerce
          </button>
          <button
            onClick={() => handleBulkSet('LOCAL')}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#A78BFA]/20 text-[#A78BFA] text-xs font-semibold hover:bg-[#A78BFA]/30 disabled:opacity-50 transition-colors"
          >
            <MapPin size={12} />
            Negócio Local
          </button>
          {isPending && <span className="text-xs text-[#87919E]">Salvando...</span>}
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-[#87919E] hover:text-[#EBEBEB] transition-colors"
          >
            Cancelar seleção
          </button>
        </div>
      )}

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
              <th className="text-left px-3 py-3 font-medium">TIPO</th>
              {/* Saúde vive num LUGAR SÓ (decisão Marcos 2026-07-18): a lista não
                  repete selo nem %; só um link para o quadro único (Client 360). */}
              <th className="text-left px-3 py-3 font-medium">SAÚDE</th>
              <th className="text-left px-3 py-3 font-medium">ETAPA</th>
              <th className="text-left px-3 py-3 font-medium">RELACIONAMENTO</th>
              <th className="text-left px-3 py-3 font-medium">NPS</th>
              <th className="text-left px-3 py-3 font-medium">CURVA</th>
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
                <td colSpan={14} className="text-center py-12 text-sm text-[#87919E]">
                  Nenhum cliente encontrado
                </td>
              </tr>
            ) : (
              filtered.map(client => {
                const st  = STATUS_LABELS[client.status] ?? STATUS_LABELS.ACTIVE
                const typ = TYPE_CONFIG[client.businessType as 'ECOMMERCE' | 'LOCAL'] ?? TYPE_CONFIG.ECOMMERCE
                const TypeIcon = typ.icon
                return (
                  <tr
                    key={client.id}
                    className={`border-b border-[#38435C]/50 hover:bg-[#38435C]/10 transition-colors ${
                      selected.has(client.id) ? 'bg-[#95BBE2]/5' : ''
                    }`}
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
                      <div className="max-w-[180px]">
                        <ClientIdentity
                          name={client.name}
                          razaoSocial={client.razaoSocial}
                          href={`/clients/${client.slug}`}
                        />
                        {client.email && (
                          <p className="text-[11px] text-[#87919E] truncate">{client.email}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ color: typ.color, background: `${typ.color}18` }}
                      >
                        <TypeIcon size={9} />
                        {typ.label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <a
                        href={`/clients/${client.slug}`}
                        className="inline-flex items-center gap-1 text-[11px] text-[#95BBE2] hover:underline"
                        title="Abrir a saúde do cliente no quadro único"
                      >
                        saúde <ArrowRight size={11} />
                      </a>
                    </td>
                    <td className="px-3 py-3">
                      {client.etapa && ETAPA_CONFIG[client.etapa] ? (
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ color: ETAPA_CONFIG[client.etapa].color, background: `${ETAPA_CONFIG[client.etapa].color}1f` }}
                        >
                          {ETAPA_CONFIG[client.etapa].label}
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#576070]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {client.relacionamento && REL_CONFIG[client.relacionamento] ? (
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ color: REL_CONFIG[client.relacionamento].color, background: `${REL_CONFIG[client.relacionamento].color}1f` }}
                        >
                          {REL_CONFIG[client.relacionamento].label}
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#576070]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {client.nps && NPS_CONFIG[client.nps] ? (
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ color: NPS_CONFIG[client.nps].color, background: `${NPS_CONFIG[client.nps].color}1f` }}
                        >
                          {NPS_CONFIG[client.nps].label}
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#576070]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {client.curva && CURVA_CONFIG[client.curva] ? (
                        <span
                          className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-md"
                          style={{ color: CURVA_CONFIG[client.curva].color, background: `${CURVA_CONFIG[client.curva].color}1f` }}
                        >
                          {CURVA_CONFIG[client.curva].label}
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#576070]">—</span>
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
                        title={
                          client.status === 'PAUSED'
                            ? `Pausado${client.pausedAt ? ` desde ${new Date(client.pausedAt).toLocaleDateString('pt-BR')}` : ''}${client.pauseReason ? ` — ${client.pauseReason}` : ''}`
                            : undefined
                        }
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
                          title="Abrir cliente"
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
