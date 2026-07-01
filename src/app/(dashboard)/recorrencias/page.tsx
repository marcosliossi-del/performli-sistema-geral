import { requireSession } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import { Card } from '@/components/ui/card'
import { Repeat, Pause, CircleCheck } from 'lucide-react'
import { timeAgo } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { ToggleRecurrenceButton } from '@/components/recorrencias/ToggleRecurrenceButton'
import { redirect } from 'next/navigation'
import type { RecurrenceFrequency } from '@prisma/client'

// Tela restrita ao ADMIN: pausar/reativar o motor de recorrência afeta a
// geração de tarefas de toda a agência, então só o administrador tem acesso.

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Descreve o horário do dia (ex.: "às 12h", "às 14h30") quando definido. */
function timeLabel(hour: number | null, minute: number | null): string {
  if (hour == null) return ''
  const m = minute ?? 0
  return m === 0 ? `às ${hour}h` : `às ${hour}h${pad(m)}`
}

/** Traduz a regra de agendamento para linguagem operacional em pt-BR. */
function scheduleLabel(rule: {
  frequency: RecurrenceFrequency
  dayOfWeek: number | null
  dayOfMonth: number | null
  hour: number | null
  minute: number | null
}): string {
  const time = timeLabel(rule.hour, rule.minute)
  const dow = rule.dayOfWeek != null ? WEEKDAYS[rule.dayOfWeek] ?? '' : ''
  const dom = rule.dayOfMonth

  switch (rule.frequency) {
    case 'DIARIA':
      return `Todo dia ${time}`.trim()
    case 'DIA_UTIL':
      return `Todo dia útil (seg a sex) ${time}`.trim()
    case 'SEMANAL':
    case 'DIA_DA_SEMANA':
      return dow ? `Toda ${dow}-feira ${time}`.trim() : `Toda semana ${time}`.trim()
    case 'QUINZENAL':
      return `A cada 15 dias ${time}`.trim()
    case 'MENSAL':
    case 'DIA_DO_MES':
      return dom != null ? `Todo dia ${dom} do mês ${time}`.trim() : `Todo mês ${time}`.trim()
    case 'TRIMESTRAL':
      return `A cada 3 meses ${time}`.trim()
    case 'POR_CLIENTE_ATIVO':
      return 'Para cada cliente ativo'
    case 'POR_STATUS_CLIENTE':
      return 'Quando o status do cliente muda'
    case 'POR_MUDANCA_ETAPA':
      return 'Quando o cliente muda de etapa'
    case 'POR_EVENTO':
      return 'Disparada por evento do sistema'
    case 'POR_CONDICAO':
      return 'Quando uma condição é atendida'
    default:
      return 'Agendamento personalizado'
  }
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  CS: 'Sucesso do Cliente',
  MANAGER: 'Gestor',
  ANALYST: 'Analista',
}

export default async function RecorrenciasPage() {
  const session = await requireSession()
  if (session.role !== 'ADMIN') redirect('/cockpit')

  const rules = await prisma.taskRecurrenceRule.findMany({
    orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    include: {
      template: {
        select: { name: true, defaultAssigneeRole: true, area: { select: { name: true } } },
      },
    },
  })

  // Contagem de tarefas geradas por recorrência — um groupBy só, sem N+1.
  const counts = await prisma.task.groupBy({
    by: ['recurrenceId'],
    where: { recurrenceId: { in: rules.map((r) => r.id) } },
    _count: { _all: true },
  })
  const countMap = new Map<string, number>()
  for (const c of counts) {
    if (c.recurrenceId) countMap.set(c.recurrenceId, c._count._all)
  }

  const ativas = rules.filter((r) => r.active).length
  const pausadas = rules.length - ativas

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#EBEBEB]">Recorrências</h1>
        <p className="text-[#87919E] text-sm mt-0.5">
          O motor que cria as tarefas repetitivas da agência sozinho. Aqui você vê o que está
          rodando, quando roda de novo e pode pausar o que não deve mais gerar tarefas.
        </p>
      </div>

      {rules.length > 0 && (
        <div className="flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 text-[#22C55E]">
            <CircleCheck size={13} /> {ativas} ativa{ativas !== 1 ? 's' : ''}
          </span>
          {pausadas > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[#EAB308]">
              <Pause size={13} /> {pausadas} pausada{pausadas !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {rules.length === 0 ? (
        <EmptyState
          icon={<Repeat size={20} />}
          title="Nenhuma recorrência configurada ainda"
          description="Quando existirem regras de recorrência, elas aparecem aqui para você acompanhar o que o sistema gera automaticamente."
        />
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => {
            const generated = countMap.get(rule.id) ?? 0
            const responsavel = rule.template?.defaultAssigneeRole
              ? ROLE_LABEL[rule.template.defaultAssigneeRole] ?? rule.template.defaultAssigneeRole
              : 'A definir na criação'

            return (
              <Card
                key={rule.id}
                className={`p-4 ${rule.active ? '' : 'opacity-60 border-l-4 border-l-[#EAB308]'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-sm font-semibold text-[#EBEBEB]">
                        {rule.template?.name ?? 'Modelo de tarefa não vinculado'}
                      </h3>
                      {rule.active ? (
                        <Badge tone="ok">Ativa</Badge>
                      ) : (
                        <Badge tone="warn">Pausada</Badge>
                      )}
                      {rule.template?.area?.name && (
                        <span className="text-[10px] text-[#87919E] border border-[#38435C] rounded px-1.5 py-0.5">
                          {rule.template.area.name}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-[#95BBE2]">{scheduleLabel(rule)}</p>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 mt-3">
                      <Field label="Responsável" value={responsavel} />
                      <Field
                        label="Última execução"
                        value={rule.lastRunAt ? timeAgo(new Date(rule.lastRunAt)) : 'Nunca rodou ainda'}
                      />
                      <Field
                        label="Próxima execução"
                        value={rule.active ? 'No próximo ciclo agendado' : 'Pausada — não vai gerar'}
                      />
                      <Field
                        label="Tarefas geradas"
                        value={`${generated} tarefa${generated !== 1 ? 's' : ''}`}
                      />
                    </div>

                    {!rule.active && (
                      <p className="text-[11px] text-[#EAB308] mt-3">
                        Enquanto pausada, nenhuma tarefa nova é criada por esta regra. Reative para
                        voltar a gerar.
                      </p>
                    )}
                  </div>

                  <div className="flex-shrink-0">
                    <ToggleRecurrenceButton
                      ruleId={rule.id}
                      active={rule.active}
                      templateName={rule.template?.name ?? 'esta recorrência'}
                    />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-[#87919E] uppercase tracking-wider mb-0.5">
        {label}
      </p>
      <p className="text-xs text-[#EBEBEB]/80">{value}</p>
    </div>
  )
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'ok' | 'warn' }) {
  return (
    <span
      className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
        tone === 'ok' ? 'bg-[#22C55E]/12 text-[#22C55E]' : 'bg-[#EAB308]/12 text-[#EAB308]'
      }`}
    >
      {children}
    </span>
  )
}
