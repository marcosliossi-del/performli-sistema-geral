import { requireSession, getOperations, getClientsForSelect } from '@/lib/dal'
import { Card } from '@/components/ui/card'
import { BookOpen } from 'lucide-react'
import { timeAgo } from '@/lib/utils'
import { OperationForm } from '@/components/clients/OperationForm'
import { EmptyState } from '@/components/ui/EmptyState'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ clientId?: string; q?: string; page?: string }>
}

export default async function OperationsPage({ searchParams }: Props) {
  const { userId, role } = await requireSession()
  const params = await searchParams
  const clientId = params.clientId ?? ''
  const search   = params.q ?? ''
  const page     = Number(params.page ?? '1')

  const [{ items, total, totalPages }, clients] = await Promise.all([
    getOperations(userId, role, { clientId: clientId || undefined, search: search || undefined, page }),
    getClientsForSelect(userId, role),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#EBEBEB]">Registro de Operações</h1>
        <p className="text-[#87919E] text-sm mt-0.5">Documentação interna acumulativa por cliente</p>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Form */}
        <div className="col-span-2">
          <OperationForm clients={clients} />
        </div>

        {/* Records */}
        <div className="col-span-3 space-y-4">
          {/* Filters */}
          <form method="GET" className="flex items-center gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                name="q"
                defaultValue={search}
                placeholder="Buscar por assunto ou conteúdo..."
                className="w-full h-9 pl-3 pr-3 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2] transition-colors"
              />
            </div>
            <select
              name="clientId"
              defaultValue={clientId}
              className="h-9 px-3 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2] transition-colors"
            >
              <option value="">Todos os clientes</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              type="submit"
              className="h-9 px-4 rounded-lg bg-[#95BBE2]/15 text-[#95BBE2] text-sm font-medium hover:bg-[#95BBE2]/25 transition-colors"
            >
              Filtrar
            </button>
            {(search || clientId) && (
              <Link
                href="/operations"
                className="h-9 px-3 flex items-center rounded-lg text-[#87919E] text-sm hover:text-[#EBEBEB] transition-colors"
              >
                Limpar
              </Link>
            )}
          </form>

          <div className="flex items-center justify-between">
            <span className="text-xs text-[#87919E]">{total} registro{total !== 1 ? 's' : ''}</span>
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon={<BookOpen size={20} />}
              title="Nenhuma operação registrada ainda"
              description="Registre a primeira prestação de contas no formulário ao lado, assim fica o histórico do que foi feito para o cliente."
            />
          ) : (
            <div className="space-y-3">
              {items.map((op) => (
                <Card key={op.id} className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-[#EBEBEB]">{op.subject}</h3>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <Link href={`/clients/${op.client.slug}`} className="text-xs text-[#95BBE2] hover:underline">
                          {op.client.name}
                        </Link>
                        <span className="text-[#38435C]">•</span>
                        <span className="text-xs text-[#87919E]">{op.user.name}</span>
                        <span className="text-[#38435C]">•</span>
                        <span className="text-xs text-[#87919E]">{timeAgo(op.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-[10px] font-semibold text-[#87919E] uppercase tracking-wider mb-0.5">Solicitado</p>
                      <p className="text-xs text-[#EBEBEB]/80">{op.requested}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-[#87919E] uppercase tracking-wider mb-0.5">Feito</p>
                      <p className="text-xs text-[#EBEBEB]/80">{op.done}</p>
                    </div>
                    {op.notes && (
                      <div>
                        <p className="text-[10px] font-semibold text-[#87919E] uppercase tracking-wider mb-0.5">Obs.</p>
                        <p className="text-xs text-[#87919E]">{op.notes}</p>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              {page > 1 && (
                <Link
                  href={`/operations?clientId=${clientId}&q=${search}&page=${page - 1}`}
                  className="h-8 px-3 flex items-center rounded-lg bg-[#0A1E2C] border border-[#38435C] text-xs text-[#EBEBEB] hover:border-[#95BBE2] transition-colors"
                >
                  ← Anterior
                </Link>
              )}
              <span className="text-xs text-[#87919E]">Pág. {page} de {totalPages}</span>
              {page < totalPages && (
                <Link
                  href={`/operations?clientId=${clientId}&q=${search}&page=${page + 1}`}
                  className="h-8 px-3 flex items-center rounded-lg bg-[#0A1E2C] border border-[#38435C] text-xs text-[#EBEBEB] hover:border-[#95BBE2] transition-colors"
                >
                  Próxima →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
