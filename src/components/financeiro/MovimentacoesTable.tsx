import { formatCurrency } from '@/lib/utils'

interface Row {
  name: string       // cliente ou categoria
  razaoSocial?: string | null
  unlinked?: boolean // entrada do Asaas sem cliente vinculado no Performli
  description?: string
  value: number
  date?: string
}

interface Props {
  title: string
  rows: Row[]
  type: 'entrada' | 'saida'
}

export function MovimentacoesTable({ title, rows, type }: Props) {
  const color = type === 'entrada' ? 'text-[#22C55E]' : 'text-[#EF4444]'

  return (
    <div className="bg-[#38435C]/20 border border-[#38435C] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#38435C]">
        <h3 className="text-sm font-semibold text-[#EBEBEB]">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-[#87919E] text-sm">
          Sem movimentações no período
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#38435C]/50">
              <th className="text-left text-xs font-semibold text-[#87919E] uppercase tracking-wider px-4 py-2.5">
                {type === 'entrada' ? 'Cliente' : 'Categoria'}
              </th>
              <th className="text-left text-xs font-semibold text-[#87919E] uppercase tracking-wider px-4 py-2.5">
                Descrição
              </th>
              <th className="text-right text-xs font-semibold text-[#87919E] uppercase tracking-wider px-4 py-2.5">
                Valor
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#38435C]/30">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-[#38435C]/20 transition-colors">
                <td className="px-4 py-3 max-w-[180px]">
                  <span className="block text-sm text-[#EBEBEB] font-medium truncate">
                    {row.name}
                    {row.unlinked && (
                      <span className="ml-1.5 text-[10px] font-normal text-[#F59E0B]" title="Cobrança do Asaas ainda não vinculada a um cliente do Performli">
                        (sem vínculo)
                      </span>
                    )}
                  </span>
                  {row.razaoSocial && (
                    <span className="block text-[10px] text-[#647488] truncate" title={row.razaoSocial}>
                      {row.razaoSocial}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-[#87919E] max-w-[200px] truncate">
                  {row.description ?? '—'}
                </td>
                <td className={`px-4 py-3 text-sm font-semibold text-right ${color}`}>
                  {formatCurrency(row.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
