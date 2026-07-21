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
  phone:         string | null
  email:         string | null
  status:        string
  pausedAt:      string | null
  pauseReason:   string | null
  createdAt:     string
  businessType:  string
  tipoServico:   string
  classificacao: 'OURO' | 'PRATA' | 'BRONZE' | null
  periodoInicio: string | null
  periodoFim:    string | null
  fonteContrato: 'juridico' | 'cadastro'
  vencido:       boolean
  venceEmDias:   number | null
  plataformas:   string[]
  responsavel:   string | null
  investimento:  number | null
  contractValue: number | null
}

interface Totals {
  count:            number
  somaContrato:     number | null
  somaInvestimento: number | null
}

interface Props {
  clients: ClientRow[]
  totals:  Totals
  isAdmin: boolean
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ACTIVE:  { label: 'Ativo',     color: '#22C55E' },
  PAUSED:  { label: 'Pausado',   color: '#F59E0B' },
  CHURNED: { label: 'Cancelado', color: '#EF4444' },
}

const TYPE_CONFIG = {
  ECOMMERCE: { label: 'E-commerce', icon: ShoppingCart, color: '#95BBE2' },
  LOCAL:     { label: 'Negócio Local', icon: MapPin,    color: '#A78BFA' },
}

const CLASSIF_CONFIG: Record<string, { label: string; color: string }> = {
  OURO:   { label: 'Ouro',   color: '#D4AF37' },
  PRATA:  { label: 'Prata',  color: '#9CA3AF' },
  BRONZE: { label: 'Bronze', color: '#CD7F32' },
}

// Cores das plataformas — alinhadas às badges já usadas no sistema.
const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  META_ADS:   { label: 'Meta Ads',   color: '#1877F2' },
  GOOGLE_ADS: { label: 'Google Ads', color: '#EA4335' },
  TIKTOK_ADS: { label: 'TikTok Ads', color: '#EE1D52' },
  GA4:        { label: 'GA4',         color: '#E37400' },
  NUVEMSHOP:  { label: 'Nuvemshop',   color: '#2D9CDB' },
  GA4SYNC:    { label: 'GA4',         color: '#E37400' },
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function ClientesTable({ clients, totals, isAdmin }: Props) {
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

  // Somas do rodapé recalculadas sobre o subconjunto FILTRADO (o que está à vista),
  // só para ADMIN (valores financeiros). Não filtrado → usa o total do servidor.
  const isFilteredView = search !== '' || filter !== 'ALL' || typeFilter !== 'ALL'
  const footContrato = isAdmin
    ? (isFilteredView ? filtered.reduce((s, c) => s + (c.contractValue ?? 0), 0) : totals.somaContrato ?? 0)
    : null
  const footInvest = isAdmin
    ? (isFilteredView ? filtered.reduce((s, c) => s + (c.investimento ?? 0), 0) : totals.somaInvestimento ?? 0)
    : null

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

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-[#95BBE2]/10 border-b border-[#95BBE2]/30">
          <span className="text-xs text-[#95BBE2] font-medium">
            {selected.size} cliente{selected.size !== 1 ? 's' : ''} selecionado{selected.size !== 1 ? 's' : ''}
          </span>
          <span className="text-[#38435C]">·</span>
          <span className="text-xs text-[#87919E]">Definir modelo de negócio como:</span>
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
              <th className="text-left px-3 py-3 font-medium">STATUS</th>
              <th className="text-left px-3 py-3 font-medium">NOME</th>
              <th className="text-left px-3 py-3 font-medium">TIPO DE SERVIÇO</th>
              <th className="text-left px-3 py-3 font-medium">CLASSIFICAÇÃO</th>
              <th className="text-left px-3 py-3 font-medium">PERÍODO DO CONTRATO</th>
              <th className="text-left px-3 py-3 font-medium">MODELO DE NEGÓCIO</th>
              <th className="text-left px-3 py-3 font-medium">PLATAFORMA</th>
              <th className="text-left px-3 py-3 font-medium">RESPONSÁVEL</th>
              <th className="text-right px-3 py-3 font-medium">INVEST. ANÚNCIOS</th>
              <th className="text-right px-3 py-3 font-medium">VALOR CONTRATO</th>
              {/* Saúde vive num LUGAR SÓ: link para o quadro único (Client 360). */}
              <th className="text-left px-3 py-3 font-medium">SAÚDE</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={13} className="text-center py-12 text-sm text-[#87919E]">
                  Nenhum cliente encontrado
                </td>
              </tr>
            ) : (
              filtered.map(client => {
                const st  = STATUS_LABELS[client.status] ?? STATUS_LABELS.ACTIVE
                const typ = TYPE_CONFIG[client.businessType as 'ECOMMERCE' | 'LOCAL'] ?? TYPE_CONFIG.ECOMMERCE
                const TypeIcon = typ.icon
                const classif = client.classificacao ? CLASSIF_CONFIG[client.classificacao] : null

                // Cor do período: vencido = vermelho; vence em <30d = âmbar (diz o porquê).
                let periodoColor = '#87919E'
                let periodoNota: string | null = null
                if (client.periodoFim) {
                  if (client.vencido) {
                    periodoColor = '#EF4444'
                    const d = client.venceEmDias != null ? Math.abs(client.venceEmDias) : null
                    periodoNota = d != null ? `Vencido há ${d}d` : 'Vencido'
                  } else if (client.venceEmDias != null && client.venceEmDias < 30) {
                    periodoColor = '#F59E0B'
                    periodoNota = `Vence em ${client.venceEmDias}d`
                  }
                }

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

                    {/* STATUS */}
                    <td className="px-3 py-3">
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
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

                    {/* NOME */}
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

                    {/* TIPO DE SERVIÇO */}
                    <td className="px-3 py-3 text-xs text-[#C7CDD6] whitespace-nowrap">
                      {client.tipoServico}
                    </td>

                    {/* CLASSIFICAÇÃO */}
                    <td className="px-3 py-3">
                      {classif ? (
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={{ color: classif.color, background: `${classif.color}22` }}
                        >
                          {classif.label}
                        </span>
                      ) : (
                        <span className="text-[#38435C]">—</span>
                      )}
                    </td>

                    {/* PERÍODO DO CONTRATO */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      {client.periodoFim ? (
                        <div className="flex flex-col leading-tight">
                          <span className="text-xs" style={{ color: periodoColor }}>
                            {fmtDate(client.periodoInicio)} → {fmtDate(client.periodoFim)}
                          </span>
                          <span className="text-[10px] flex items-center gap-1">
                            {periodoNota && (
                              <span style={{ color: periodoColor }} className="font-semibold">{periodoNota}</span>
                            )}
                            {client.fonteContrato === 'cadastro' && (
                              <span
                                className="text-[#87919E]"
                                title="Sem contrato no Jurídico — dado do cadastro. Registre o contrato em /juridico para amarrar a fonte única."
                              >
                                {periodoNota ? '· ' : ''}do cadastro
                              </span>
                            )}
                          </span>
                        </div>
                      ) : (
                        <span
                          className="text-[11px] text-[#F59E0B]"
                          title="Nenhum contrato vigente no Jurídico e sem período no cadastro."
                        >
                          Sem contrato registrado
                        </span>
                      )}
                    </td>

                    {/* MODELO DE NEGÓCIO */}
                    <td className="px-3 py-3">
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                        style={{ color: typ.color, background: `${typ.color}18` }}
                      >
                        <TypeIcon size={9} />
                        {typ.label}
                      </span>
                    </td>

                    {/* PLATAFORMA */}
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[160px]">
                        {client.plataformas.length === 0 ? (
                          <span className="text-[#38435C] text-xs">—</span>
                        ) : (
                          client.plataformas.map(p => {
                            const cfg = PLATFORM_CONFIG[p] ?? { label: p, color: '#87919E' }
                            return (
                              <span
                                key={p}
                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
                                style={{ color: cfg.color, background: `${cfg.color}1F` }}
                              >
                                {cfg.label}
                              </span>
                            )
                          })
                        )}
                      </div>
                    </td>

                    {/* RESPONSÁVEL */}
                    <td className="px-3 py-3 text-xs text-[#C7CDD6] whitespace-nowrap">
                      {client.responsavel ?? <span className="text-[#F59E0B]">Sem gestor</span>}
                    </td>

                    {/* INVESTIMENTO EM ANÚNCIOS */}
                    <td className="px-3 py-3 text-right text-xs text-[#EBEBEB] whitespace-nowrap">
                      {isAdmin
                        ? (client.investimento ? formatCurrency(client.investimento) : <span className="text-[#38435C]">—</span>)
                        : <span className="text-[#38435C]" title="Restrito ao administrador">—</span>}
                    </td>

                    {/* VALOR DO CONTRATO */}
                    <td className="px-3 py-3 text-right text-xs font-semibold text-[#22C55E] whitespace-nowrap">
                      {isAdmin
                        ? (client.contractValue ? formatCurrency(client.contractValue) : <span className="text-[#38435C] font-normal">—</span>)
                        : <span className="text-[#38435C] font-normal" title="Restrito ao administrador">—</span>}
                    </td>

                    {/* SAÚDE */}
                    <td className="px-3 py-3">
                      <a
                        href={`/clients/${client.slug}`}
                        className="inline-flex items-center gap-1 text-[11px] text-[#95BBE2] hover:underline"
                        title="Abrir a saúde do cliente no quadro único"
                      >
                        saúde <ArrowRight size={11} />
                      </a>
                    </td>

                    {/* AÇÕES */}
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

          {/* Rodapé: CONTAGEM + SOMAS (valores só para ADMIN) */}
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[#38435C] bg-[#0A1E2C]/40 text-xs font-semibold text-[#EBEBEB]">
                <td className="px-4 py-3" />
                <td className="px-3 py-3 text-[#87919E]" colSpan={8}>
                  {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
                  {selected.size > 0 && ` · ${selected.size} selecionado${selected.size !== 1 ? 's' : ''}`}
                  {isFilteredView && ' (filtrado)'}
                </td>
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  {isAdmin ? formatCurrency(footInvest ?? 0) : '—'}
                </td>
                <td className="px-3 py-3 text-right text-[#22C55E] whitespace-nowrap">
                  {isAdmin ? formatCurrency(footContrato ?? 0) : '—'}
                </td>
                <td className="px-3 py-3" colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
