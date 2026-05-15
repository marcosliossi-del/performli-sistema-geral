import Link from 'next/link'
import { Scale, ExternalLink, FileText, AlertTriangle } from 'lucide-react'
import { ContractStatusBadge } from '@/components/juridico/ContractStatusBadge'
import { formatCurrency } from '@/lib/utils'
import { ContractStatus, ContractType } from '@prisma/client'

type ContractData = {
  id:          string
  status:      ContractStatus
  type:        ContractType
  feeValue:    number
  setupFee:    number | null
  startDate:   string
  endDate:     string
  signedAt:    string | null
  documentUrl: string | null
  autoRenew:   boolean
  responsible: { name: string } | null
}

type Props = {
  contract: ContractData | null
  clientId: string
}

const TYPE_LABEL: Record<ContractType, string> = {
  FEE_MENSAL: 'Fee Mensal',
  PROJETO:    'Projeto',
  AVULSO:     'Avulso',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function daysUntil(iso: string): number {
  const end  = new Date(iso)
  const now  = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.ceil((end.getTime() - now.getTime()) / 86_400_000)
}

export function ClientContractCard({ contract, clientId }: Props) {
  if (!contract) {
    return (
      <div className="bg-[#0A1E2C] border border-[#38435C] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Scale size={14} className="text-[#87919E]" />
            <span className="text-xs font-semibold text-[#87919E] uppercase tracking-wide">Contrato</span>
          </div>
          <Link href="/juridico" className="text-[11px] text-[#95BBE2] hover:underline">
            Criar →
          </Link>
        </div>
        <p className="text-sm text-[#87919E]">Nenhum contrato registrado</p>
      </div>
    )
  }

  const days     = daysUntil(contract.endDate)
  const expiring = contract.status === 'VIGENTE' && days >= 0 && days <= 30
  const expired  = days < 0 && contract.status !== 'CANCELADO'

  return (
    <div className="bg-[#0A1E2C] border border-[#38435C] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Scale size={14} className="text-[#87919E]" />
          <span className="text-xs font-semibold text-[#87919E] uppercase tracking-wide">Contrato</span>
        </div>
        <Link href="/juridico" className="text-[11px] text-[#95BBE2] hover:underline">
          Gerenciar →
        </Link>
      </div>

      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-lg font-bold text-[#EBEBEB]">{formatCurrency(contract.feeValue)}<span className="text-xs text-[#87919E] font-normal">/mês</span></p>
          <p className="text-xs text-[#87919E] mt-0.5">{TYPE_LABEL[contract.type]}</p>
        </div>
        <ContractStatusBadge status={contract.status} />
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-[#87919E]">Início</span>
          <span className="text-[#EBEBEB]">{fmtDate(contract.startDate)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[#87919E]">Vencimento</span>
          <span className={expired ? 'text-[#EF4444]' : expiring ? 'text-[#F59E0B]' : 'text-[#EBEBEB]'}>
            {fmtDate(contract.endDate)}
            {expiring && ` (${days}d)`}
            {expired  && ' (vencido)'}
          </span>
        </div>
        {contract.responsible && (
          <div className="flex items-center justify-between">
            <span className="text-[#87919E]">Responsável</span>
            <span className="text-[#EBEBEB]">{contract.responsible.name}</span>
          </div>
        )}
      </div>

      {(expiring || expired) && (
        <div className={`mt-3 flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded-lg ${
          expired ? 'bg-[#EF4444]/10 text-[#EF4444]' : 'bg-[#F59E0B]/10 text-[#F59E0B]'
        }`}>
          <AlertTriangle size={11} />
          {expired ? 'Contrato vencido — requer ação' : `Vence em ${days} dias`}
        </div>
      )}

      {contract.documentUrl && (
        <a
          href={contract.documentUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex items-center gap-1.5 text-[11px] text-[#87919E] hover:text-[#95BBE2] transition-colors"
        >
          <FileText size={11} />
          Ver PDF do contrato
          <ExternalLink size={10} />
        </a>
      )}
    </div>
  )
}
