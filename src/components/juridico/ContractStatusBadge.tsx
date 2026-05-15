import { ContractStatus } from '@prisma/client'

const config: Record<ContractStatus, { label: string; className: string }> = {
  RASCUNHO:  { label: 'Rascunho',  className: 'bg-[#38435C]/60 text-[#87919E]' },
  VIGENTE:   { label: 'Em Vigor',  className: 'bg-[#22C55E]/15 text-[#22C55E]' },
  RENOVACAO: { label: 'Renovação', className: 'bg-[#F59E0B]/15 text-[#F59E0B]' },
  CANCELADO: { label: 'Cancelado', className: 'bg-[#EF4444]/15 text-[#EF4444]' },
}

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  const { label, className } = config[status]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
  )
}
