import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { AlertCircle, CheckCircle2, ExternalLink, UserX } from 'lucide-react'
import { ClientIdentity } from '@/components/clients/ClientIdentity'
import type { OverdueInvoiceRow, ClientWithoutBillingRow, ReguaStep } from '@/lib/dal'

const BRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const REGUA_COLOR: Record<ReguaStep, string> = {
  'Vencida':                'text-[#EAB308] border-[#EAB308]/30 bg-[#EAB308]/10',
  'Cobrança (D+3)':         'text-[#EAB308] border-[#EAB308]/30 bg-[#EAB308]/10',
  'Cobrança firme (D+7)':   'text-[#F59E0B] border-[#F59E0B]/30 bg-[#F59E0B]/10',
  'Pausa sugerida (D+15)':  'text-[#EF4444] border-[#EF4444]/30 bg-[#EF4444]/10',
  'Escalar Marcos (D+30)':  'text-[#EF4444] border-[#EF4444]/40 bg-[#EF4444]/15',
}

/**
 * FIN-19 — Fila priorizada de inadimplência (faturas vencidas, mais atrasada
 * primeiro) + clientes ativos sem cobrança. Linguagem operacional, ação clicável.
 */
export function InadimplenciaFila({
  overdue,
  withoutBilling,
}: {
  overdue: OverdueInvoiceRow[]
  withoutBilling: ClientWithoutBillingRow[]
}) {
  const total = overdue.reduce((s, r) => s + r.value, 0)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Fila de faturas vencidas */}
      <Card className="lg:col-span-2 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="text-[#EF4444]" />
            <h3 className="text-sm font-semibold text-[#EBEBEB]">Fila de cobrança</h3>
          </div>
          {overdue.length > 0 && (
            <span className="text-[11px] text-[#87919E]">
              {overdue.length} fatura{overdue.length > 1 ? 's' : ''} · {BRL(total)} em aberto
            </span>
          )}
        </div>

        {overdue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CheckCircle2 size={28} className="text-[#22C55E] mb-2" />
            <p className="text-[#EBEBEB] text-sm font-medium">Nenhuma fatura vencida</p>
            <p className="text-[#87919E] text-xs mt-0.5">Contas a receber em dia.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {overdue.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-[#0A1E2C]/40 border border-[#38435C]/50"
              >
                <div className="min-w-0">
                  <ClientIdentity
                    name={r.clientName}
                    razaoSocial={r.clientRazaoSocial}
                    href={r.clientSlug ? `/clients/${r.clientSlug}` : undefined}
                  />
                  <p className="text-[10px] text-[#87919E]">
                    {BRL(r.value)} · vencida há {r.daysOverdue} dia{r.daysOverdue !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[10px] rounded px-2 py-1 border ${REGUA_COLOR[r.regua]}`}>
                    {r.regua}
                  </span>
                  {r.invoiceUrl && (
                    <a
                      href={r.invoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#87919E] hover:text-[#EBEBEB]"
                      title="Abrir fatura no Asaas"
                    >
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Clientes ativos sem cobrança */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <UserX size={15} className="text-[#EAB308]" />
          <h3 className="text-sm font-semibold text-[#EBEBEB]">Ativos sem cobrança</h3>
        </div>
        {withoutBilling.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CheckCircle2 size={28} className="text-[#22C55E] mb-2" />
            <p className="text-[#EBEBEB] text-sm font-medium">Todos com cobrança</p>
            <p className="text-[#87919E] text-xs mt-0.5">Nenhum cliente ativo sem assinatura.</p>
          </div>
        ) : (
          <>
            <p className="text-[10px] text-[#87919E] mb-2">
              Cliente ativo sem assinatura no Asaas — receita pode estar sendo perdida.
            </p>
            <div className="space-y-1">
              {withoutBilling.map((c) => (
                <Link
                  key={c.id}
                  href={`/clients/${c.slug}`}
                  className="block text-xs text-[#95BBE2] hover:underline py-1 border-b border-[#38435C]/40 last:border-0"
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
