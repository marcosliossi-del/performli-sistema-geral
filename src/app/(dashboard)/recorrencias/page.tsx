import Link from 'next/link'
import { requireSession } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import { Card } from '@/components/ui/card'
import { Repeat, Pause, CircleCheck, Archive, ListChecks, ArrowUpRight } from 'lucide-react'
import { timeAgo, formatSaoPauloDateTime, saoPauloDateString } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { ToggleRecurrenceButton } from '@/components/recorrencias/ToggleRecurrenceButton'
import {
  RecurrenceRowActions,
  type TemplateOption,
} from '@/components/recorrencias/EditRecurrenceModal'
import { RestoreRecurrenceButton } from '@/components/recorrencias/RestoreRecurrenceButton'
import { EndTaskRecurrenceButton } from '@/components/recorrencias/EndTaskRecurrenceButton'
import { shouldRunToday } from '@/services/recurrence-engine'
import { parseRecurrenceRule, computeNextOccurrence } from '@/lib/tasks/recurrence'
import { redirect } from 'next/navigation'
import { Prisma, type RecurrenceFrequency } from '@prisma/client'

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

// T-17: rótulos alinhados aos papéis que o MOTOR realmente resolve no fan-out
// (GESTOR/MANAGER/CS/CRM/SUPERVISOR/HEAD). ADMIN/ANALYST não geram tarefas —
// deixamos isso explícito para o admin não configurar uma regra que nunca roda.
const ROLE_LABEL: Record<string, string> = {
  GESTOR: 'Gestor',
  MANAGER: 'Gestor',
  CS: 'Sucesso do Cliente',
  CRM: 'CRM / Comercial',
  SUPERVISOR: 'Supervisor',
  HEAD: 'Head',
  ADMIN: 'Administrador (não gera tarefas)',
  ANALYST: 'Analista (não gera tarefas)',
}

// Papéis que o motor de recorrência sabe distribuir por cliente ativo.
const FANOUT_ROLES = new Set(['GESTOR', 'MANAGER', 'CS', 'CRM', 'SUPERVISOR', 'HEAD'])

type NextRunRule = {
  frequency: RecurrenceFrequency
  dayOfWeek: number | null
  dayOfMonth: number | null
  hour: number | null
  minute: number | null
  anchorDate: Date | null
}

/**
 * T-30: próxima data concreta em que a regra vai disparar, calculada na parede
 * de America/Sao_Paulo reusando a MESMA régua do cron (shouldRunToday). Varre os
 * próximos ~370 dias procurando o primeiro que dispara com horário no futuro.
 * Retorna null para frequências event-driven (POR_*) — não têm data agendada.
 */
function computeNextRun(rule: NextRunRule, now: Date = new Date()): Date | null {
  if (String(rule.frequency).startsWith('POR_')) return null
  const todayStr = saoPauloDateString(now)
  const anchorNoon = new Date(`${todayStr}T12:00:00Z`)
  const hh = rule.hour ?? 9
  const mm = rule.minute ?? 0
  for (let i = 0; i <= 370; i++) {
    const dayStr = new Date(anchorNoon.getTime() + i * 86_400_000).toISOString().slice(0, 10)
    const candidateNoon = new Date(`${dayStr}T12:00:00Z`)
    if (!shouldRunToday(rule.frequency, rule.dayOfWeek, rule.dayOfMonth, rule.anchorDate, candidateNoon)) {
      continue
    }
    const run = new Date(`${dayStr}T${pad(hh)}:${pad(mm)}:00-03:00`)
    if (run.getTime() > now.getTime()) return run
  }
  return null
}

// ── Motor B: recorrência POR TASK (D-010) ────────────────────────────────────
// Séries estilo ClickUp cujo estado canônico vive na própria Task.recurrenceRule
// (não em TaskRecurrenceRule). NÃO apareciam em nenhuma tela — tornar visível e
// encerrável aqui. Vínculo fonte↔ocorrências: idempotencyKey `recur:{taskId}:{data}`
// (mesma chave usada por on-complete e schedule em recurClone.ts).

type SourceStatus = 'aberta' | 'atrasada' | 'concluida'

/** Dias corridos (na parede SP) entre uma data passada e agora — nunca negativo. */
function daysOverdue(dueDate: Date | null, now: Date): number {
  if (dueDate == null) return 0
  const a = new Date(`${saoPauloDateString(dueDate)}T12:00:00Z`).getTime()
  const b = new Date(`${saoPauloDateString(now)}T12:00:00Z`).getTime()
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

export default async function RecorrenciasPage() {
  const session = await requireSession()
  if (session.role !== 'ADMIN') redirect('/cockpit')

  const allRules = await prisma.taskRecurrenceRule.findMany({
    orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    include: {
      template: {
        select: { name: true, defaultAssigneeRole: true, area: { select: { name: true } } },
      },
    },
  })

  // Regras arquivadas saem da lista padrão e vão para a seção colapsada.
  const rules = allRules.filter((r) => r.archivedAt == null)
  const arquivadas = allRules.filter((r) => r.archivedAt != null)

  // Modelos de tarefa ativos — opções do seletor de modelo na edição.
  // Só templates SEM regra vinculada (templateId é @unique — escolher um já
  // ligado a outra regra violaria a constraint). O template da própria regra é
  // sempre oferecido pelo modal via prop separada.
  const templates = await prisma.taskTemplate.findMany({
    where: { active: true, recurrence: null },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
  const templateOptions: TemplateOption[] = templates

  // Contagem de tarefas geradas por recorrência — um groupBy só, sem N+1.
  const counts = await prisma.task.groupBy({
    by: ['recurrenceId'],
    where: { recurrenceId: { in: allRules.map((r) => r.id) } },
    _count: { _all: true },
  })
  const countMap = new Map<string, number>()
  for (const c of counts) {
    if (c.recurrenceId) countMap.set(c.recurrenceId, c._count._all)
  }

  const ativas = rules.filter((r) => r.active).length
  const pausadas = rules.length - ativas

  // ── Motor B: séries por task (D-010) — CABEÇA VIVA de cada série ────────────
  // A série onComplete é uma CADEIA: a fonte concluída mantém a recurrenceRule e
  // o clone (carryRule) leva a regra adiante. Listar toda task com regra != null
  // infla a lista (uma linha por conclusão histórica). Representamos cada série
  // UMA vez pela sua cabeça viva:
  //   • cabeça viva = recurrenceRule != DbNull E status NOT IN (CONCLUIDO, CANCELADO).
  //   • cadeia morta = fonte CONCLUIDO com regra mas SEM sucessor (clone `recur:{id}:`
  //     nunca nasceu — ex. clone falhou, T-11). Vira sinal útil, não some.
  //   • concluída COM sucessor: oculta (o sucessor É a série).
  //   • cancelada: parada explícita — não listada.
  const now = new Date()
  const commonSelect = {
    id: true,
    title: true,
    status: true,
    dueDate: true,
    updatedAt: true,
    recurrenceRule: true,
    client: { select: { name: true } },
    user: { select: { name: true } },
  } as const

  const [liveHeads, concludedSources] = await Promise.all([
    prisma.task.findMany({
      where: {
        recurrenceRule: { not: Prisma.DbNull },
        status: { notIn: ['CONCLUIDO', 'CANCELADO'] },
      },
      select: commonSelect,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.task.findMany({
      where: { recurrenceRule: { not: Prisma.DbNull }, status: 'CONCLUIDO' },
      select: commonSelect,
      orderBy: { updatedAt: 'desc' },
    }),
  ])

  // Todos os clones da árvore de recorrência (uma query). idempotencyKey
  // `recur:{parentId}:{data}` — cuid não tem `:`, split(':')[1] = pai imediato.
  const clones = await prisma.task.findMany({
    where: { idempotencyKey: { startsWith: 'recur:' } },
    select: { id: true, idempotencyKey: true },
  })
  const childToParent = new Map<string, string>() // filho → pai imediato
  const childrenOf = new Map<string, string[]>() // pai → filhos diretos
  for (const c of clones) {
    if (!c.idempotencyKey) continue
    const parentId = c.idempotencyKey.split(':')[1]
    if (!parentId) continue
    childToParent.set(c.id, parentId)
    const arr = childrenOf.get(parentId)
    if (arr) arr.push(c.id)
    else childrenOf.set(parentId, [c.id])
  }

  const hasSuccessor = (id: string): boolean => (childrenOf.get(id)?.length ?? 0) > 0

  // Sobe até a raiz da cadeia a partir de qualquer nó (segue o pai imediato).
  function chainRoot(id: string): string {
    let cur = id
    const seen = new Set<string>([cur])
    let parent = childToParent.get(cur)
    while (parent && !seen.has(parent)) {
      cur = parent
      seen.add(cur)
      parent = childToParent.get(cur)
    }
    return cur
  }

  // Conta TODAS as ocorrências geradas na série = descendentes da raiz (cada
  // descendente é um clone materializado). Vale para onComplete (cadeia linear)
  // e schedule (várias ocorrências inertes sob a mesma fonte).
  function occurrencesGenerated(headId: string): number {
    const root = chainRoot(headId)
    let total = 0
    const stack = [root]
    const seen = new Set<string>([root])
    while (stack.length) {
      const node = stack.pop() as string
      for (const child of childrenOf.get(node) ?? []) {
        if (seen.has(child)) continue
        seen.add(child)
        total++
        stack.push(child)
      }
    }
    return total
  }

  type SeriesRow = (typeof liveHeads)[number] & { dead: boolean }
  const rawSeries: SeriesRow[] = [
    ...liveHeads.map((t) => ({ ...t, dead: false })),
    // Só concluídas SEM sucessor são cadeias mortas legítimas de exibir.
    ...concludedSources.filter((t) => !hasSuccessor(t.id)).map((t) => ({ ...t, dead: true })),
  ]

  // Monta a linha operacional. Regra Json inválida é descartada (flatMap) —
  // parseRecurrenceRule nunca lança.
  const series = rawSeries.flatMap((t) => {
    const rule = parseRecurrenceRule(t.recurrenceRule)
    if (!rule) return []
    const overdue = daysOverdue(t.dueDate, now)
    const status: SourceStatus = t.dead
      ? 'concluida'
      : t.dueDate != null && t.dueDate.getTime() < now.getTime()
        ? 'atrasada'
        : 'aberta'

    // schedule: próxima ocorrência real. Se cair no passado, ainda não foi
    // materializada (cron pendente) — não exibir data passada como "próximo".
    let nextLabel: string
    if (t.dead) {
      nextLabel = '—'
    } else if (rule.mode === 'onComplete') {
      nextLabel = t.dueDate
        ? `Ao concluir a atual (vence ${formatSaoPauloDateTime(t.dueDate)})`
        : 'Ao concluir a atual'
    } else {
      const next = computeNextOccurrence(rule, t.dueDate ?? now)
      nextLabel =
        next.getTime() < now.getTime()
          ? 'Vencida — aguardando geração no próximo ciclo'
          : formatSaoPauloDateTime(next)
    }

    return [
      {
        id: t.id,
        title: t.title,
        clientName: t.client?.name ?? null,
        assigneeName: t.user?.name ?? null,
        mode: rule.mode,
        freq: rule.freq,
        interval: rule.interval,
        status,
        dead: t.dead,
        overdue,
        nextLabel,
        updatedAt: t.updatedAt,
        occurrences: occurrencesGenerated(t.id),
      },
    ]
  })

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
            const role = rule.template?.defaultAssigneeRole ?? null
            const responsavel = role
              ? ROLE_LABEL[role] ?? role
              : 'A definir na criação'
            // T-17: papel que o motor não distribui → a regra não gera nada.
            const roleGeraTarefas = role != null && FANOUT_ROLES.has(role)

            // T-30: data real da próxima execução (SP), não mais texto fixo.
            const nextRun = rule.active ? computeNextRun(rule) : null
            const nextRunLabel = !rule.active
              ? 'Pausada — não vai gerar'
              : !roleGeraTarefas
                ? 'Papel não gera tarefas — corrigir a regra'
                : nextRun
                  ? formatSaoPauloDateTime(nextRun)
                  : 'Sob demanda (disparada por evento)'

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
                      <Field label="Próxima execução" value={nextRunLabel} />
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

                  <div className="flex-shrink-0 flex flex-col items-end gap-2">
                    <ToggleRecurrenceButton
                      ruleId={rule.id}
                      active={rule.active}
                      templateName={rule.template?.name ?? 'esta recorrência'}
                    />
                    <RecurrenceRowActions
                      templates={templateOptions}
                      rule={{
                        id: rule.id,
                        templateName: rule.template?.name ?? 'esta recorrência',
                        frequency: rule.frequency,
                        dayOfWeek: rule.dayOfWeek,
                        dayOfMonth: rule.dayOfMonth,
                        hour: rule.hour,
                        minute: rule.minute,
                        defaultAssigneeRole: rule.template?.defaultAssigneeRole ?? null,
                        templateId: rule.templateId,
                        hasTemplate: rule.templateId != null,
                      }}
                    />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Motor B: recorrências por tarefa (individual, estilo ClickUp) ───── */}
      <section className="pt-2">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-[#EBEBEB] flex items-center gap-2">
            <ListChecks size={15} /> Recorrências por tarefa (motor individual)
          </h2>
          <p className="text-[11px] text-[#87919E] mt-0.5">
            Séries presas a uma tarefa específica. Regeneram ao concluir a atual, ou seguem uma
            agenda fixa. Diferente do motor acima, elas não distribuem por cliente ativo.
          </p>
        </div>

        {series.length === 0 ? (
          <EmptyState
            icon={<Repeat size={20} />}
            title="Nenhuma tarefa com recorrência própria"
            description="Quando uma tarefa for configurada para se repetir sozinha (ao concluir ou em agenda fixa), ela aparece aqui para você acompanhar e, se preciso, encerrar a série."
          />
        ) : (
          <div className="space-y-3">
            {series.map((s) => {
              const freqLabel =
                s.freq === 'DAILY' ? 'diária' : s.freq === 'WEEKLY' ? 'semanal' : 'mensal'
              const modeLabel =
                s.mode === 'onComplete' ? 'Regenera ao concluir' : 'Agenda fixa'
              const intervaloLabel =
                s.interval > 1 ? `${freqLabel} · a cada ${s.interval}` : freqLabel

              // Badge honesto de situação da série.
              let alerta: { text: string; tone: 'ok' | 'warn' | 'crit' } | null = null
              if (s.dead) {
                alerta = {
                  text: 'Série parada — última ocorrência concluída sem gerar a próxima',
                  tone: 'crit',
                }
              } else if (s.status === 'atrasada' && s.mode === 'onComplete') {
                alerta = {
                  text: `Parada há ${s.overdue} dia${s.overdue !== 1 ? 's' : ''} — a próxima só nasce ao concluir`,
                  tone: 'crit',
                }
              } else if (s.status === 'atrasada') {
                alerta = {
                  text: `Atrasada há ${s.overdue} dia${s.overdue !== 1 ? 's' : ''} — ocorrência pendente de geração`,
                  tone: 'warn',
                }
              }

              return (
                <Card key={s.id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="text-sm font-semibold text-[#EBEBEB] truncate">{s.title}</h3>
                        <TaskBadge tone={s.mode === 'onComplete' ? 'ok' : 'info'}>
                          {modeLabel}
                        </TaskBadge>
                        {s.clientName && (
                          <span className="text-[10px] text-[#87919E] border border-[#38435C] rounded px-1.5 py-0.5">
                            {s.clientName}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-[#95BBE2]">Recorrência {intervaloLabel}</p>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 mt-3">
                        <Field label="Responsável" value={s.assigneeName ?? 'Sem responsável'} />
                        <Field label="Próximo vencimento" value={s.nextLabel} />
                        <Field
                          label="Ocorrências criadas"
                          value={`${s.occurrences} tarefa${s.occurrences !== 1 ? 's' : ''}`}
                        />
                        <Field label="Última atualização" value={timeAgo(new Date(s.updatedAt))} />
                      </div>

                      {alerta && (
                        <p
                          className={`text-[11px] mt-3 ${
                            alerta.tone === 'crit'
                              ? 'text-[#EF4444]'
                              : alerta.tone === 'warn'
                                ? 'text-[#EAB308]'
                                : 'text-[#22C55E]'
                          }`}
                        >
                          {alerta.text}
                        </p>
                      )}

                      <Link
                        href={`/t/${s.id}`}
                        className="text-[11px] text-[#95BBE2] hover:underline inline-flex items-center gap-1 mt-2"
                      >
                        Abrir tarefa-fonte <ArrowUpRight size={12} />
                      </Link>
                    </div>

                    <div className="flex-shrink-0">
                      <EndTaskRecurrenceButton taskId={s.id} title={s.title} />
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {arquivadas.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs font-semibold text-[#87919E] hover:text-[#EBEBEB] transition-colors list-none flex items-center gap-1.5">
            <Archive size={13} />
            Arquivadas ({arquivadas.length}) — não geram tarefas
          </summary>
          <div className="space-y-3 mt-3">
            {arquivadas.map((rule) => {
              const generated = countMap.get(rule.id) ?? 0
              return (
                <Card key={rule.id} className="p-4 opacity-60 border-l-4 border-l-[#38435C]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="text-sm font-semibold text-[#EBEBEB]">
                          {rule.template?.name ?? 'Modelo de tarefa não vinculado'}
                        </h3>
                        <Badge tone="warn">Arquivada</Badge>
                      </div>
                      <p className="text-xs text-[#95BBE2]">{scheduleLabel(rule)}</p>
                      <p className="text-[11px] text-[#87919E] mt-2">
                        Não gera tarefas. As {generated} tarefa{generated !== 1 ? 's' : ''} já
                        criada{generated !== 1 ? 's' : ''} continua{generated !== 1 ? 'm' : ''}{' '}
                        no sistema. Restaure para voltar a usar (volta pausada).
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      <RestoreRecurrenceButton
                        ruleId={rule.id}
                        templateName={rule.template?.name ?? 'esta recorrência'}
                      />
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </details>
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

function TaskBadge({ children, tone }: { children: React.ReactNode; tone: 'ok' | 'info' }) {
  return (
    <span
      className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
        tone === 'ok' ? 'bg-[#22C55E]/12 text-[#22C55E]' : 'bg-[#95BBE2]/12 text-[#95BBE2]'
      }`}
    >
      {children}
    </span>
  )
}
