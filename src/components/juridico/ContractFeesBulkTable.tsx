'use client'

import { useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, DollarSign, RefreshCw } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

type ContractFeeRow = {
  contractId: string
  clientName: string
  status:     string
  startDate:  string
  endDate:    string
  feeValue:   number
}

type RowState = {
  fee:   string
  saved: boolean
  error: string | null
}

async function saveFee(contractId: string, fee: number) {
  const fd = new FormData()
  fd.set('id',       contractId)
  fd.set('feeValue', fee.toString())
  const res = await fetch('/api/admin/contract-fee', {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) throw new Error('Erro ao salvar')
}

type Props = { contracts: ContractFeeRow[] }

export function ContractFeesBulkTable({ contracts }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      contracts.map(c => [c.contractId, { fee: c.feeValue > 0 ? String(c.feeValue) : '', saved: false, error: null }])
    )
  )
  const [savingAll, startSaveAll] = useTransition()
  const [savedAll, setSavedAll]  = useState(false)

  function updateFee(contractId: string, value: string) {
    setRows(r => ({ ...r, [contractId]: { ...r[contractId], fee: value, saved: false, error: null } }))
  }

  const handleSaveAll = useCallback(() => {
    startSaveAll(async () => {
      const toSave = contracts.filter(c => {
        const v = parseFloat(rows[c.contractId]?.fee || '0')
        return !isNaN(v) && v >= 0
      })

      await Promise.all(
        toSave.map(async c => {
          const fee = parseFloat(rows[c.contractId].fee || '0')
          try {
            await saveFee(c.contractId, fee)
            setRows(r => ({ ...r, [c.contractId]: { ...r[c.contractId], saved: true, error: null } }))
          } catch {
            setRows(r => ({ ...r, [c.contractId]: { ...r[c.contractId], error: 'Erro ao salvar' } }))
          }
        })
      )

      setSavedAll(true)
      setTimeout(() => { setSavedAll(false); router.refresh() }, 2000)
    })
  }, [contracts, rows, router])

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  const STATUS_LABEL: Record<string, string> = {
    RASCUNHO:  'Rascunho',
    VIGENTE:   'Em Vigor',
    RENOVACAO: 'Renovação',
    CANCELADO: 'Cancelado',
  }
  const STATUS_COLOR: Record<string, string> = {
    RASCUNHO:  'text-[#87919E]',
    VIGENTE:   'text-[#22C55E]',
    RENOVACAO: 'text-[#F59E0B]',
    CANCELADO: 'text-[#EF4444]',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-[#EBEBEB] font-medium">Fees em Massa</p>
          <p className="text-xs text-[#87919E] mt-0.5">Edite os valores de fee mensal de todos os contratos de uma vez.</p>
        </div>
        <button
          onClick={handleSaveAll}
          disabled={savingAll}
          className="flex items-center gap-2 h-9 px-5 rounded-xl text-sm font-medium transition-colors border
            bg-[#95BBE2]/15 text-[#95BBE2] hover:bg-[#95BBE2]/25 border-[#95BBE2]/20 disabled:opacity-50"
        >
          {savingAll ? (
            <><Loader2 size={13} className="animate-spin" /> Salvando...</>
          ) : savedAll ? (
            <><Check size={13} className="text-[#22C55E]" /> Salvo!</>
          ) : (
            <><Check size={13} /> Salvar todos</>
          )}
        </button>
      </div>

      <div className="bg-[#0A1E2C] border border-[#38435C] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#38435C]">
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#87919E] uppercase tracking-wider">Cliente</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#87919E] uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#87919E] uppercase tracking-wider">Vigência</th>
              <th className="px-4 py-2.5 text-[11px] font-semibold text-[#87919E] uppercase tracking-wider w-48">Fee Mensal (R$)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#38435C]/40">
            {contracts.map(c => {
              const row   = rows[c.contractId]
              const feeNum = parseFloat(row.fee || '0')

              return (
                <tr key={c.contractId} className="hover:bg-[#38435C]/10 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-[#EBEBEB]">{c.clientName}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs ${STATUS_COLOR[c.status] ?? 'text-[#87919E]'}`}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[#87919E]">
                    {fmtDate(c.startDate)} → {fmtDate(c.endDate)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#87919E] text-xs">R$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.fee}
                          onChange={e => updateFee(c.contractId, e.target.value)}
                          placeholder="0,00"
                          className="w-36 h-8 pl-8 pr-2 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2] placeholder-[#4A5568]"
                        />
                      </div>
                      {row.saved && <Check size={13} className="text-[#22C55E] flex-shrink-0" />}
                      {row.error && <span className="text-[11px] text-[#EF4444]">{row.error}</span>}
                      {!row.saved && feeNum > 0 && (
                        <span className="text-[11px] text-[#87919E]">{formatCurrency(feeNum)}/mês</span>
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
}
