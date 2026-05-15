'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, FileText, ExternalLink, RefreshCw, XCircle, Pencil } from 'lucide-react'
import { ContractStatusBadge } from './ContractStatusBadge'
import { ContractFormModal } from './ContractFormModal'
import { renewContract, cancelContract, ContractRow } from '@/app/actions/contracts'
import { formatCurrency } from '@/lib/utils'
import { ContractStatus } from '@prisma/client'

type Client = { id: string; name: string }
type User   = { id: string; name: string }

type Props = {
  contracts: ContractRow[]
  clients:   Client[]
  users:     User[]
}

const STATUS_ORDER: ContractStatus[] = ['RENOVACAO', 'VIGENTE', 'RASCUNHO', 'CANCELADO']
const STATUS_LABEL: Record<ContractStatus, string> = {
  RENOVACAO: 'Renovação',
  VIGENTE:   'Em Vigor',
  RASCUNHO:  'Rascunho',
  CANCELADO: 'Cancelado',
}

function daysUntil(iso: string): number {
  const end  = new Date(iso)
  const now  = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.ceil((end.getTime() - now.getTime()) / 86_400_000)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function ContractsTable({ contracts, clients, users }: Props) {
  const router  = useRouter()
  const [showCreate, setShowCreate]   = useState(false)
  const [editing, setEditing]         = useState<ContractRow | null>(null)
  const [activeTab, setActiveTab]     = useState<ContractStatus | 'TODOS'>('TODOS')
  const [, startTransition]           = useTransition()

  const grouped = STATUS_ORDER.reduce<Record<ContractStatus, ContractRow[]>>((acc, s) => {
    acc[s] = contracts.filter(c => c.status === s)
    return acc
  }, { RENOVACAO: [], VIGENTE: [], RASCUNHO: [], CANCELADO: [] })

  const filtered = activeTab === 'TODOS'
    ? contracts
    : contracts.filter(c => c.status === activeTab)

  const filteredGrouped = STATUS_ORDER.reduce<Record<ContractStatus, ContractRow[]>>((acc, s) => {
    acc[s] = filtered.filter(c => c.status === s)
    return acc
  }, { RENOVACAO: [], VIGENTE: [], RASCUNHO: [], CANCELADO: [] })

  function handleRenew(id: string) {
    startTransition(async () => {
      const res = await renewContract(id)
      if (res.ok) router.refresh()
    })
  }

  function handleCancel(id: string) {
    const reason = window.prompt('Motivo do cancelamento (opcional):') ?? undefined
    startTransition(async () => {
      const res = await cancelContract(id, reason)
      if (res.ok) router.refresh()
    })
  }

  function onSaved() {
    setShowCreate(false)
    setEditing(null)
    router.refresh()
  }

  const tabCounts: Record<ContractStatus | 'TODOS', number> = {
    TODOS:    contracts.length,
    VIGENTE:  grouped.VIGENTE.length,
    RENOVACAO:grouped.RENOVACAO.length,
    RASCUNHO: grouped.RASCUNHO.length,
    CANCELADO:grouped.CANCELADO.length,
  }

  return (
    <>
      {/* Tabs */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1 bg-[#0A1E2C] border border-[#38435C] rounded-xl p-1">
          {(['TODOS', ...STATUS_ORDER] as (ContractStatus | 'TODOS')[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-[#95BBE2]/15 text-[#95BBE2]'
                  : 'text-[#87919E] hover:text-[#EBEBEB]'
              }`}
            >
              {tab === 'TODOS' ? 'Todos' : STATUS_LABEL[tab]}
              <span className="ml-1.5 opacity-60">({tabCounts[tab]})</span>
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 h-9 px-4 rounded-xl bg-[#95BBE2]/15 text-[#95BBE2] hover:bg-[#95BBE2]/25 text-sm font-medium transition-colors border border-[#95BBE2]/20"
        >
          <Plus size={14} />
          Novo contrato
        </button>
      </div>

      {/* Tables grouped by status */}
      {STATUS_ORDER.map(status => {
        const rows = filteredGrouped[status]
        if (rows.length === 0) return null

        return (
          <div key={status} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <ContractStatusBadge status={status} />
              <span className="text-xs text-[#87919E]">{rows.length}</span>
            </div>

            <div className="bg-[#0A1E2C] border border-[#38435C] rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#38435C]">
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#87919E] uppercase tracking-wider">Cliente</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#87919E] uppercase tracking-wider">Tipo</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#87919E] uppercase tracking-wider">Fee Mensal</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#87919E] uppercase tracking-wider">Início</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#87919E] uppercase tracking-wider">Vencimento</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#87919E] uppercase tracking-wider">Responsável</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#38435C]/40">
                  {rows.map(contract => {
                    const days = daysUntil(contract.endDate)
                    const expiring = status === 'VIGENTE' && days <= 30
                    const expired  = days < 0

                    return (
                      <tr key={contract.id} className="hover:bg-[#38435C]/15 transition-colors group">
                        <td className="px-4 py-3">
                          <span className="font-medium text-[#EBEBEB]">{contract.client.name}</span>
                        </td>
                        <td className="px-4 py-3 text-[#87919E]">
                          {contract.type === 'FEE_MENSAL' ? 'Fee Mensal' : contract.type === 'PROJETO' ? 'Projeto' : 'Avulso'}
                        </td>
                        <td className="px-4 py-3 text-[#EBEBEB] font-medium">
                          {formatCurrency(contract.feeValue)}
                        </td>
                        <td className="px-4 py-3 text-[#87919E]">
                          {fmtDate(contract.startDate)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={expired ? 'text-[#EF4444]' : expiring ? 'text-[#F59E0B]' : 'text-[#87919E]'}>
                              {fmtDate(contract.endDate)}
                            </span>
                            {expiring && !expired && (
                              <span className="text-[10px] text-[#F59E0B] bg-[#F59E0B]/10 px-1.5 py-0.5 rounded">
                                {days}d
                              </span>
                            )}
                            {expired && (
                              <span className="text-[10px] text-[#EF4444] bg-[#EF4444]/10 px-1.5 py-0.5 rounded">
                                vencido
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[#87919E]">
                          {contract.responsible?.name || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                            {contract.documentUrl && (
                              <a
                                href={contract.documentUrl}
                                target="_blank"
                                rel="noreferrer"
                                title="Ver PDF"
                                className="p-1.5 rounded-lg text-[#87919E] hover:text-[#95BBE2] hover:bg-[#38435C]/50 transition-colors"
                              >
                                <FileText size={13} />
                              </a>
                            )}
                            <button
                              onClick={() => setEditing(contract)}
                              title="Editar"
                              className="p-1.5 rounded-lg text-[#87919E] hover:text-[#EBEBEB] hover:bg-[#38435C]/50 transition-colors"
                            >
                              <Pencil size={13} />
                            </button>
                            {status !== 'CANCELADO' && status !== 'RASCUNHO' && (
                              <button
                                onClick={() => handleRenew(contract.id)}
                                title="Renovar"
                                className="p-1.5 rounded-lg text-[#87919E] hover:text-[#22C55E] hover:bg-[#22C55E]/10 transition-colors"
                              >
                                <RefreshCw size={13} />
                              </button>
                            )}
                            {status !== 'CANCELADO' && (
                              <button
                                onClick={() => handleCancel(contract.id)}
                                title="Cancelar"
                                className="p-1.5 rounded-lg text-[#87919E] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors"
                              >
                                <XCircle size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center">
          <FileText size={36} className="text-[#38435C] mb-3" />
          <p className="text-sm text-[#87919E]">Nenhum contrato encontrado.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 text-xs text-[#95BBE2] hover:underline"
          >
            Criar primeiro contrato
          </button>
        </div>
      )}

      {(showCreate || editing) && (
        <ContractFormModal
          clients={clients}
          users={users}
          contract={editing ?? undefined}
          onClose={() => { setShowCreate(false); setEditing(null) }}
          onSaved={onSaved}
        />
      )}
    </>
  )
}
