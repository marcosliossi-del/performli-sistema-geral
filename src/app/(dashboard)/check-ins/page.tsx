import type { ReactNode } from 'react'
import { requireSession, getCheckinBoard } from '@/lib/dal'
import { Card } from '@/components/ui/card'
import { CheckinReviewCard } from '@/components/checkins/CheckinReviewCard'
import { CheckinFillCard } from '@/components/checkins/CheckinFillCard'
import { ClipboardCheck, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function CheckinsPage() {
  const { userId, role } = await requireSession()
  const { weekStart, rows } = await getCheckinBoard(userId, role)
  const isReviewer = role === 'ADMIN' || role === 'CS'

  const reviewQueue = rows.filter((r) => r.checkin?.status === 'PREENCHIDO')
  const semCheckin = rows.filter((r) => !r.checkin || r.checkin.status === 'PENDENTE')
  const reprovados = rows.filter((r) => r.checkin?.status === 'REPROVADO')
  const aprovados = rows.filter((r) => r.checkin?.status === 'APROVADO')

  const semana = new Date(weekStart).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#EBEBEB]">Check-ins semanais</h1>
          <p className="text-[#87919E] text-sm mt-0.5">
            {isReviewer
              ? 'Fila de validação da CS · semana de ' + semana
              : 'Preencha o check-in dos seus clientes · semana de ' + semana}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <Stat label="Aguardando revisão" value={reviewQueue.length} cls="text-[#95BBE2]" />
          <Stat label="Sem check-in" value={semCheckin.length} cls="text-[#EAB308]" />
          <Stat label="Reprovados" value={reprovados.length} cls="text-[#EF4444]" />
          <Stat label="Aprovados" value={aprovados.length} cls="text-[#22C55E]" />
        </div>
      </div>

      {isReviewer ? (
        <>
          {/* Fila de validação */}
          <Section icon={ClipboardCheck} title="Aguardando validação" count={reviewQueue.length}>
            {reviewQueue.length === 0 ? (
              <Empty label="Nenhum check-in aguardando validação." />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {reviewQueue.map((r) => (
                  <CheckinReviewCard
                    key={r.checkin!.id}
                    item={{
                      id: r.checkin!.id,
                      clientName: r.clientName,
                      clientSlug: r.clientSlug,
                      managerName: r.managerName,
                      resultadoSemana: r.checkin!.resultadoSemana,
                      oQueFoiFeito: r.checkin!.oQueFoiFeito,
                      proximosPassos: r.checkin!.proximosPassos,
                      submittedAt: r.checkin!.submittedAt,
                    }}
                  />
                ))}
              </div>
            )}
          </Section>

          {/* Sem check-in */}
          <Section icon={AlertTriangle} title="Clientes sem check-in" count={semCheckin.length}>
            {semCheckin.length === 0 ? (
              <Empty label="Todos os clientes preencheram." />
            ) : (
              <Card className="p-3">
                <div className="flex flex-wrap gap-2">
                  {semCheckin.map((r) => (
                    <span key={r.clientId} className="text-xs text-[#EBEBEB] bg-[#0A1E2C]/60 border border-[#38435C]/50 rounded px-2.5 py-1">
                      {r.clientName} <span className="text-[#87919E]">· {r.managerName ?? 'sem gestor'}</span>
                    </span>
                  ))}
                </div>
              </Card>
            )}
          </Section>

          {/* Reprovados aguardando correção */}
          {reprovados.length > 0 && (
            <Section icon={XCircle} title="Reprovados aguardando correção" count={reprovados.length}>
              <Card className="p-3">
                <div className="flex flex-wrap gap-2">
                  {reprovados.map((r) => (
                    <span key={r.clientId} className="text-xs text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/20 rounded px-2.5 py-1">
                      {r.clientName}
                    </span>
                  ))}
                </div>
              </Card>
            </Section>
          )}
        </>
      ) : (
        /* Visão do gestor: preencher */
        <Section icon={ClipboardCheck} title="Meus clientes" count={rows.length}>
          {rows.length === 0 ? (
            <Empty label="Nenhum cliente atribuído a você." />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {rows.map((r) => (
                <CheckinFillCard
                  key={r.clientId}
                  item={{
                    clientId: r.clientId,
                    clientName: r.clientName,
                    clientSlug: r.clientSlug,
                    status: r.checkin?.status ?? 'PENDENTE',
                    resultadoSemana: r.checkin?.resultadoSemana ?? null,
                    oQueFoiFeito: r.checkin?.oQueFoiFeito ?? null,
                    proximosPassos: r.checkin?.proximosPassos ?? null,
                    reviewNote: r.checkin?.reviewNote ?? null,
                  }}
                />
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  )
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="text-center px-2.5 py-1 rounded-lg border border-[#38435C]/50">
      <p className={`text-base font-bold leading-none ${cls}`}>{value}</p>
      <p className="text-[9px] text-[#87919E] mt-0.5">{label}</p>
    </div>
  )
}

function Section({
  icon: Icon, title, count, children,
}: {
  icon: typeof ClipboardCheck; title: string; count: number; children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-[#95BBE2]" />
        <h2 className="text-sm font-semibold text-[#EBEBEB]">{title}</h2>
        <span className="text-[10px] text-[#87919E]">({count})</span>
      </div>
      {children}
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-[#87919E] py-4 justify-center">
      <CheckCircle2 size={14} className="text-[#22C55E]" /> {label}
    </div>
  )
}
