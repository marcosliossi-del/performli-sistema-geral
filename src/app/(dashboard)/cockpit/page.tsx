import { requireSession, getCockpitData, getCheckinStats, getCronHealth } from '@/lib/dal'
import { LastUpdatedBadge } from '@/components/cockpit/LastUpdatedBadge'
import { CronHealthBanner } from '@/components/cockpit/CronHealthBanner'
import { OperationalCard } from '@/components/cockpit/OperationalCard'
import {
  ShieldAlert, Target, ListTodo, FileWarning, Bell, Banknote,
  HeartPulse, AlertTriangle, CheckCircle2, Lock, ClipboardCheck,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

const BRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

// Blocos cuja fonte de dado ainda não foi sistematizada — plugam por fatia.
const PENDENTES: { titulo: string; pop: string }[] = [
  { titulo: 'Clientes em onboarding / primeiros 30 dias', pop: 'ONB-04 · ONB-05' },
  { titulo: 'MRR previsto vs realizado · margem', pop: 'FIN-21' },
  { titulo: 'Leads em follow-up vencido', pop: 'CAP-03 · CRM' },
]

export default async function CockpitPage() {
  const { userId, role } = await requireSession()
  const [data, checkins, cronHealth] = await Promise.all([
    getCockpitData(userId, role),
    getCheckinStats(userId, role),
    getCronHealth(role),
  ])

  return (
    <div className="space-y-6">
      {/* Watchdog do cron (S1-007): avisa se a atualização automática parou. */}
      <CronHealthBanner health={cronHealth} />

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#EBEBEB]">Cockpit da Arkza</h1>
          <p className="text-[#87919E] text-sm mt-0.5">
            Visão única: o que está saudável, em atenção, crítico — e o que precisa de ação hoje.
          </p>
        </div>
        <LastUpdatedBadge at={data.ultimaAtualizacao} />
      </div>

      {/* Saúde da carteira */}
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

      {/* Financeiro — apenas ADMIN (loader retorna null p/ os demais → seção some) */}
      {data.faturasVencidas && (
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
      )}

      {/* Blocos por fatia — transparência incremental (não esconder o que falta) */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Lock size={13} className="text-[#87919E]" />
          <h2 className="text-sm font-semibold text-[#87919E]">
            Próximos blocos (entram conforme cada POP é sistematizado)
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {PENDENTES.map((p) => (
            <div
              key={p.titulo}
              className="p-3 rounded-lg border border-dashed border-[#38435C] text-[10px] text-[#87919E]"
            >
              <p className="text-[#EBEBEB]/80 font-medium">{p.titulo}</p>
              <p className="mt-0.5">aguardando {p.pop}</p>
            </div>
          ))}
        </div>
      </div>

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
