import { Clock } from 'lucide-react'

/**
 * Selo de "última atualização dos dados" (CLAUDE.md: toda tela com dado crítico
 * mostra data/hora da última atualização). Fica vermelho se os dados estão velhos.
 */
export function LastUpdatedBadge({ at, staleHours = 26 }: { at: Date | null; staleHours?: number }) {
  if (!at) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-[#EAB308]">
        <Clock size={12} /> Sem registro de sincronização
      </span>
    )
  }
  const d = new Date(at)
  const hours = (Date.now() - d.getTime()) / 3_600_000
  const stale = hours > staleHours
  const label = d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] ${stale ? 'text-[#EF4444]' : 'text-[#87919E]'}`}>
      <Clock size={12} />
      Dados atualizados em {label}
      {stale && ' · desatualizado'}
    </span>
  )
}
