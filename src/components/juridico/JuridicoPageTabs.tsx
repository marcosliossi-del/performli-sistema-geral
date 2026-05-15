'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, DatabaseZap, CheckCircle2 } from 'lucide-react'
import { ContractsTable } from './ContractsTable'
import { ContractFeesBulkTable } from './ContractFeesBulkTable'
import type { ContractRow } from '@/app/actions/contracts'

type Client = { id: string; name: string }
type User   = { id: string; name: string }
type FeeRow = { contractId: string; clientName: string; status: string; startDate: string; endDate: string; feeValue: number }

type Props = {
  contracts: ContractRow[]
  clients:   Client[]
  users:     User[]
  feesData:  FeeRow[]
}

type Tab = 'contratos' | 'fees'

export function JuridicoPageTabs({ contracts, clients, users, feesData }: Props) {
  const [tab, setTab]       = useState<Tab>('contratos')
  const [seeding, start]    = useTransition()
  const [seedResult, setSeedResult] = useState<null | { created: number; results: { match: string; clientName: string; status: string }[] }>(null)
  const router = useRouter()

  function handleSeed() {
    start(async () => {
      const res = await fetch('/api/admin/seed-contracts', { method: 'POST' })
      const data = await res.json()
      setSeedResult(data)
      if (data.created > 0) {
        setTimeout(() => { setSeedResult(null); router.refresh() }, 5000)
      }
    })
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1 bg-[#0A1E2C] border border-[#38435C] rounded-xl p-1">
          <button
            onClick={() => setTab('contratos')}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === 'contratos' ? 'bg-[#95BBE2]/15 text-[#95BBE2]' : 'text-[#87919E] hover:text-[#EBEBEB]'
            }`}
          >
            Contratos
          </button>
          <button
            onClick={() => setTab('fees')}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              tab === 'fees' ? 'bg-[#95BBE2]/15 text-[#95BBE2]' : 'text-[#87919E] hover:text-[#EBEBEB]'
            }`}
          >
            Fees em Massa
            {feesData.filter(f => f.feeValue === 0).length > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#F59E0B]/80 text-[#0A1E2C] text-[10px] font-bold flex items-center justify-center">
                {feesData.filter(f => f.feeValue === 0).length}
              </span>
            )}
          </button>
        </div>

        {/* Seed button — only visible when no contracts exist yet */}
        {contracts.length === 0 && (
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="flex items-center gap-2 h-9 px-4 rounded-xl text-xs font-medium transition-colors border
              bg-[#38435C]/40 text-[#87919E] hover:text-[#EBEBEB] hover:bg-[#38435C]/70 border-[#38435C]"
          >
            {seeding ? <Loader2 size={13} className="animate-spin" /> : <DatabaseZap size={13} />}
            Importar do ClickUp
          </button>
        )}
      </div>

      {/* Seed result feedback */}
      {seedResult && (
        <div className="mb-4 bg-[#0A1E2C] border border-[#38435C] rounded-xl p-4 text-sm">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={15} className="text-[#22C55E]" />
            <span className="font-medium text-[#EBEBEB]">{seedResult.created} contratos criados</span>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {seedResult.results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  r.status === 'created'              ? 'bg-[#22C55E]' :
                  r.status === 'skipped_has_contract' ? 'bg-[#87919E]' :
                  'bg-[#EF4444]'
                }`} />
                <span className="text-[#87919E]">{r.match}</span>
                <span className="text-[#38435C]">→</span>
                <span className={r.status === 'skipped_no_match' ? 'text-[#EF4444]' : 'text-[#EBEBEB]'}>
                  {r.status === 'created'              ? r.clientName :
                   r.status === 'skipped_has_contract' ? `${r.clientName} (já existe)` :
                   'não encontrado no sistema'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'contratos' && (
        <ContractsTable contracts={contracts} clients={clients} users={users} />
      )}

      {tab === 'fees' && (
        <ContractFeesBulkTable contracts={feesData} />
      )}
    </div>
  )
}
