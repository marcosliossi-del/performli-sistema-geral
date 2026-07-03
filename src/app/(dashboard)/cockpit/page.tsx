import Link from 'next/link'
import { requireSession, getCockpitData, getCheckinStats, getCronHealth, getDashboardData } from '@/lib/dal'
import { LastUpdatedBadge } from '@/components/cockpit/LastUpdatedBadge'
import { CronHealthBanner } from '@/components/cockpit/CronHealthBanner'
import { OperationalCard } from '@/components/cockpit/OperationalCard'
import { ClientHealthGrid } from '@/components/dashboard/ClientHealthGrid'
import { Card } from '@/components/ui/card'
import { timeAgo } from '@/lib/utils'
import { AlertType } from '@prisma/client'
import {
  ShieldAlert, Target, ListTodo, FileWarning, Bell, Banknote,
  HeartPulse, AlertTriangle, CheckCircle2, Lock, ClipboardCheck,
  Clock, ArrowDownRight, ArrowUpRight, TrendingDown, AlertCircle, Scale,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

const BRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

// Mapa exaustivo de AlertType → ícone/cor (espelha /alerts e o antigo Painel).
// Se um novo AlertType for criado, o TS obriga a mapeá-lo aqui — nada cai num
// fallback amarelo enganoso. Valor fora do enum usa tom neutro, nunca warning.
const alertIcons: Record<AlertType, { icon: typeof AlertTriangle; color: string }> = {
  STATUS_DROPPED_TO_RUIM:         { icon: AlertTriangle,  color: 'text-[#EF4444]' },
  STATUS_DROPPED_TO_REGULAR:      { icon: TrendingDown,   color: 'text-[#EAB308]' },
  STATUS_IMPROVED_TO_OTIMO:       { icon: CheckCircle2,   color: 'text-[#22C55E]' },
  SYNC_FAILED:                    { icon: AlertTriangle,  color: 'text-[#EAB308]' },
  BUDGET_EXHAUSTED:               { icon: AlertTriangle,  color: 'text-[#EF4444]' },
  BUDGET_WARNING:                 { icon: AlertTriangle,  color: 'text-[#EAB308]' },
  KPI_DROP_24H:                   { icon: ArrowDownRight, color: 'text-[#EF4444]' },
  KPI_SPIKE_24H:                  { icon: ArrowUpRight,   color: 'text-[#22C55E]' },
  ROAS_BELOW_TARGET_2W:           { icon: ShieldAlert,    color: 'text-[#EF4444]' },
  FATURAMENTO_BELOW_70PCT_WEEK2:  { icon: ShieldAlert,    color: 'text-[#EF4444]' },
  CONTRACT_EXPIRING_SOON:         { icon: Scale,          color: 'text-[#F59E0B]' },
  WARROOM_NO_REVIEW:              { icon: ShieldAlert,    color: 'text-[#EAB308]' },
  WARROOM_EXIT_CRITERIA_MET:      { icon: CheckCircle2,   color: 'text-[#22C55E]' },
  WARROOM_REGRESSION:             { icon: TrendingDown,   color: 'text-[#EF4444]' },
  INVOICE_OVERDUE:                { icon: AlertCircle,    color: 'text-[#EF4444]' },
  CLIENT_WITHOUT_BILLING:         { icon: AlertTriangle,  color: 'text-[#EAB308]' },
  ANTICHURN_ACTION_NEEDED:        { icon: ShieldAlert,    color: 'text-[#EF4444]' },
  CHECKIN_MISSING:                { icon: AlertTriangle,  color: 'text-[#EAB308]' },
  CHECKIN_REJECTED_STALE:         { icon: AlertCircle,    color: 'text-[#EF4444]' },
  TASK_AUTOMATION:                { icon: Bell,           color: 'text-[#95BBE2]' },
}
const alertIconFallback = { icon: Bell, color: 'text-[#87919E]' }

// Blocos cuja fonte de dado ainda não foi sistematizada — plugam por fatia.
const PENDENTES: { titulo: string; pop: string }[] = [
  { titulo: 'Clientes em onboarding / primeiros 30 dias', pop: 'ONB-04 · ONB-05' },
  { titulo: 'MRR previsto vs realizado · margem', pop: 'FIN-21' },
  { titulo: 'Leads em follow-up vencido', pop: 'CAP-03 · CRM' },
]

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/5 pb-1.5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[#EBEBEB]">{title}</h2>
      {hint && <span className="text-[11px] text-[#87919E]">{hint}</span>}
    </div>
  )
}

export default async function CockpitPage() {
  const { userId, role } = await requireSession()
  // Tudo em UM Promise.all — nenhum N+1, loaders já existentes.
  const [data, checkins, cronHealth, dashboard] = await Promise.all([
    getCockpitData(userId, role),
    getCheckinStats(userId, role),
    getCronHealth(role),
    getDashboardData(userId, role),
  ])

  const { clients, alerts, oscillationAlerts, lastSyncAt } = dashboard

  return (
    <div className="space-y-8">
      {/* Watchdog do cron (S1-007): avisa se a atualização automática parou. */}
      <CronHealthBanner health={cronHealth} />

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#EBEBEB]">Cockpit da Arkza</h1>
          <p className="text-[#87919E] text-sm mt-0.5">
            A tela única da agência: o que está errado agora, a saúde da carteira, sua operação e o financeiro.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Selo "Último sync" — horário do dado de mídia (convive com o banner,
              que é staleness de cron). */}
          {lastSyncAt ? (
            <div className="flex items-center gap-1.5 text-xs text-[#87919E]">
              <Clock size={12} />
              <span>Último sync {timeAgo(new Date(lastSyncAt))}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-[#EF4444]">
              <AlertTriangle size={12} />
              <span>Nunca sincronizado</span>
            </div>
          )}
          <LastUpdatedBadge at={data.ultimaAtualizacao} />
        </div>
      </div>

      {/* ─── 1. O QUE ESTÁ ERRADO AGORA ─────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader title="O que está errado agora" hint="Aja hoje" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <OperationalCard
            icon={ShieldAlert}
            title="Clientes críticos"
            value={data.clientesCriticos}
            severity={data.clientesCriticos > 0 ? 'critical' : 'ok'}
            why="Clientes em status RUIM — maior risco de cancelamento."
            responsible="Gestor + CS"
            deadline="Hoje"
            impact="Crítico por 3 semanas escala para Marcos."
            action={{ href: '/anti-churn', label: 'Ver contas críticas' }}
          />
          <OperationalCard
            icon={Target}
            title="War Rooms ativas"
            value={data.warRoomsAtivas}
            severity={data.warRoomsAtivas > 0 ? 'warning' : 'ok'}
            why={
              data.warRoomsSemCriterio > 0
                ? `${data.warRoomsSemCriterio} sem critério de saída definido.`
                : 'Todas com critério de saída definido.'
            }
            responsible="Responsável da War Room"
            deadline="Revisão semanal"
            impact="War Room sem critério de saída não fecha nunca."
            action={{ href: '/anti-churn', label: 'Abrir War Rooms' }}
          />
          <OperationalCard
            icon={Bell}
            title="Alertas não lidos"
            value={data.alertasNaoLidos}
            severity={data.alertasNaoLidos > 0 ? 'warning' : 'ok'}
            why="Alertas operacionais ainda não tratados."
            responsible="Quem o alerta indicar"
            deadline="Hoje"
            impact="Sinal de risco fica parado sem ação."
            action={{ href: '/alerts', label: 'Ver alertas' }}
          />
        </div>

        {/* Oscilações de hoje (KPI ±24h) */}
        {oscillationAlerts.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[#EBEBEB]">Oscilações de hoje</h3>
              <span className="text-[11px] text-[#87919E]">
                {oscillationAlerts.length} variaç{oscillationAlerts.length !== 1 ? 'ões' : 'ão'} detectada{oscillationAlerts.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {oscillationAlerts.map((alert) => {
                const isDrop = alert.type === 'KPI_DROP_24H'
                return (
                  <Link key={alert.id} href={`/clients/${alert.client.slug}`} className="block">
                    <Card className={`p-3 border-l-4 transition-colors hover:bg-white/[0.03] ${isDrop ? 'border-l-[#EF4444]' : 'border-l-[#22C55E]'}`}>
                      <div className="flex items-start gap-2">
                        {isDrop ? (
                          <ArrowDownRight size={14} className="text-[#EF4444] mt-0.5 flex-shrink-0" />
                        ) : (
                          <ArrowUpRight size={14} className="text-[#22C55E] mt-0.5 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#EBEBEB] truncate">{alert.client.name}</p>
                          <p className="text-xs text-[#87919E] mt-0.5 line-clamp-2">{alert.title}</p>
                          <p className="text-[10px] text-[#87919E]/60 mt-1">{timeAgo(new Date(alert.createdAt))}</p>
                        </div>
                      </div>
                    </Card>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Alertas recentes (cards clicáveis) */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#EBEBEB]">Alertas recentes</h3>
            <Link href="/alerts" className="text-[11px] text-[#95BBE2] hover:underline">
              Ver todos →
            </Link>
          </div>
          {alerts.length === 0 ? (
            <Card className="p-4 flex flex-col items-center text-center py-6">
              <CheckCircle2 size={22} className="text-[#22C55E] mb-2" />
              <p className="text-xs text-[#87919E]">Nenhum alerta não lido</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {alerts.map((alert) => {
                const config = alertIcons[alert.type as AlertType] ?? alertIconFallback
                const Icon = config.icon
                return (
                  <Link key={alert.id} href={`/clients/${alert.client.slug}`} className="block">
                    <Card className="p-3 transition-colors hover:bg-white/[0.03]">
                      <div className="flex items-start gap-2">
                        <Icon size={14} className={`${config.color} mt-0.5 flex-shrink-0`} />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#EBEBEB] truncate">{alert.client.name}</p>
                          <p className="text-xs text-[#87919E] mt-0.5 line-clamp-2">{alert.body}</p>
                          <p className="text-[10px] text-[#87919E]/60 mt-1">{timeAgo(new Date(alert.createdAt))}</p>
                        </div>
                      </div>
                    </Card>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* ─── 2. SAÚDE DA CARTEIRA ────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader title="Saúde da carteira" hint="Termômetro por cliente" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <OperationalCard
            icon={HeartPulse}
            title="Saúde da carteira"
            value={
              <MiniStats
                items={[
                  { n: data.clientesOk, label: 'ok', cls: 'text-[#22C55E]' },
                  { n: data.clientesAtencao, label: 'atenção', cls: 'text-[#EAB308]' },
                  { n: data.clientesCriticos, label: 'críticos', cls: 'text-[#EF4444]' },
                ]}
              />
            }
            severity={data.clientesCriticos > 0 ? 'warning' : 'ok'}
            why="Clientes OK · em atenção · críticos (status atual)."
            responsible="CS"
            deadline="Fechamento semanal"
            impact="Tendência de piora antecipa churn."
            action={{ href: '/anti-churn', label: 'Termômetro da carteira' }}
          />
        </div>
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#EBEBEB]">Saúde por cliente</h3>
            <Link href="/clients" className="text-[11px] text-[#95BBE2] hover:underline">
              Ver todos →
            </Link>
          </div>
          <ClientHealthGrid clients={clients} />
        </div>
      </section>

      {/* ─── 3. MINHA OPERAÇÃO ───────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader title="Minha operação" hint="Tarefas, check-ins e contratos" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <OperationalCard
            icon={ListTodo}
            title="Demandas atrasadas"
            value={data.demandasAtrasadas}
            severity={data.demandasAtrasadas > 0 ? 'warning' : 'ok'}
            why="Tarefas com prazo vencido e ainda não concluídas."
            responsible="Responsável de cada tarefa"
            deadline="SLA: D+3 alerta, D+7 escala"
            impact="Demanda atrasada reincidente gera insatisfação."
            action={{ href: '/operacional', label: 'Ver demandas' }}
          />
          <OperationalCard
            icon={ClipboardCheck}
            title="Check-ins da semana"
            value={
              <MiniStats
                items={[
                  { n: checkins.semCheckin, label: 'sem preencher', cls: 'text-[#EAB308]' },
                  { n: checkins.aguardandoRevisao, label: 'em revisão', cls: 'text-[#95BBE2]' },
                  { n: checkins.reprovados, label: 'reprovados', cls: 'text-[#EF4444]' },
                ]}
              />
            }
            severity={checkins.semCheckin > 0 || checkins.reprovados > 0 ? 'warning' : 'ok'}
            why={`${checkins.semCheckin} sem preencher · ${checkins.aguardandoRevisao} em revisão · ${checkins.reprovados} reprovados.`}
            responsible="Gestor preenche · CS valida"
            deadline="Preenchimento até quarta"
            impact="Sem check-in não há prestação de contas ao cliente."
            action={{ href: '/check-ins', label: 'Abrir fila de check-ins' }}
          />
          <OperationalCard
            icon={FileWarning}
            title="Contratos vencendo (30d)"
            value={data.contratosVencendo30d}
            severity={data.contratosVencendo30d > 0 ? 'warning' : 'ok'}
            why="Contratos vigentes que vencem nos próximos 30 dias."
            responsible="ADMIN + gestor"
            deadline="Antes do vencimento"
            impact="Cliente opera sem contrato vigente."
            action={{ href: '/juridico', label: 'Ver contratos' }}
          />
        </div>
      </section>

      {/* ─── 4. FINANCEIRO — apenas ADMIN (loader retorna null → seção some) ── */}
      {data.faturasVencidas && (
        <section className="space-y-3">
          <SectionHeader title="Financeiro" hint="Visível apenas para o administrador" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <OperationalCard
              icon={Banknote}
              title="Faturas vencidas"
              value={data.faturasVencidas.count}
              severity={data.faturasVencidas.count > 0 ? 'critical' : 'ok'}
              why={`${BRL(data.faturasVencidas.total)} em aberto — receita contratada e não recebida.`}
              responsible="ADMIN (cobrança)"
              deadline="D+3 alerta · D+15 pausa"
              impact="D+30 escala para Marcos + risco de churn."
              action={{ href: '/financeiro', label: 'Ver inadimplência' }}
            />
          </div>
        </section>
      )}

      {/* Próximos blocos — transparência incremental em uma linha discreta no rodapé */}
      <p className="flex items-start gap-1.5 text-[10px] text-[#87919E]/70">
        <Lock size={11} className="text-[#87919E]/70 mt-0.5 flex-shrink-0" />
        <span>
          Em breve, conforme cada POP é sistematizado:{' '}
          {PENDENTES.map((p, i) => (
            <span key={p.titulo}>
              {i > 0 && ' · '}
              <span className="text-[#EBEBEB]/70">{p.titulo}</span> ({p.pop})
            </span>
          ))}
        </span>
      </p>

      <p className="flex items-center gap-1.5 text-[10px] text-[#87919E]/60">
        <CheckCircle2 size={11} className="text-[#22C55E]" />
        Cockpit incremental — cada fatia vertical pluga seu bloco aqui.
        <AlertTriangle size={11} className="text-[#EAB308] ml-2" />
        Financeiro visível apenas para ADMIN/CS.
      </p>
    </div>
  )
}

function MiniStats({ items }: { items: { n: number; label: string; cls: string }[] }) {
  return (
    <span className="flex items-center gap-2">
      {items.map((it, i) => (
        <span key={it.label} className="flex items-baseline gap-1">
          {i > 0 && <span className="text-[#576070] text-xs mr-1">·</span>}
          <span className={`text-xl font-bold leading-none ${it.n > 0 ? it.cls : 'text-[#576070]'}`}>{it.n}</span>
          <span className="text-[9px] font-medium text-[#87919E]">{it.label}</span>
        </span>
      ))}
    </span>
  )
}
