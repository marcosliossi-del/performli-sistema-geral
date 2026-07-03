import { requireSession, getProcessosHealth, type ProcessoHealth, type ProcessoHealthStatus } from '@/lib/dal'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import {
  POPS_CATALOG, POP_AREAS, type Pop, type ImplementacaoStatus,
} from '@/lib/pops-catalog'
import { Workflow, Bot, UserCog, AlertTriangle, ArrowRight, HeartPulse } from 'lucide-react'

export const dynamic = 'force-dynamic'

const STATUS_META: Record<ImplementacaoStatus, { label: string; cls: string }> = {
  AUTOMATIZADO: { label: 'Automatizado', cls: 'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20' },
  PARCIAL:      { label: 'Parcial',      cls: 'text-[#EAB308] bg-[#EAB308]/10 border-[#EAB308]/20' },
  MANUAL:       { label: 'Manual',       cls: 'text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/20' },
}

// Estado vivo do processo — linguagem operacional (o que está errado agora).
const HEALTH_META: Record<ProcessoHealthStatus, { dot: string; label: string; cls: string }> = {
  SAUDAVEL:           { dot: '🟢', label: 'Saudável',           cls: 'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20' },
  ATENCAO:            { dot: '🟡', label: 'Em atenção',         cls: 'text-[#EAB308] bg-[#EAB308]/10 border-[#EAB308]/20' },
  CRITICO:            { dot: '🔴', label: 'Crítico',            cls: 'text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/20' },
  SEM_INSTRUMENTACAO: { dot: '⚪', label: 'Sem instrumentação', cls: 'text-[#87919E] bg-[#38435C]/30 border-[#38435C]/50' },
}

function fmtDateTime(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(d)
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo',
  }).format(d)
}

function PopRow({ pop, health }: { pop: Pop; health: ProcessoHealth | undefined }) {
  const meta = STATUS_META[pop.implementacao]
  const hStatus: ProcessoHealthStatus = health?.status ?? 'SEM_INSTRUMENTACAO'
  const hMeta = HEALTH_META[hStatus]
  return (
    <div id={`pop-${pop.codigo}`} className="scroll-mt-20 flex items-start justify-between gap-3 py-2.5 px-3 rounded-lg bg-[#0A1E2C]/40 border border-[#38435C]/50">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono text-[#87919E]">{pop.codigo}</span>
          <span className="text-xs font-medium text-[#EBEBEB]">{pop.nome}</span>
          <span className={`text-[9px] rounded px-1.5 py-0.5 border ${hMeta.cls}`}>{hMeta.dot} {hMeta.label}</span>
          <span className={`text-[9px] rounded px-1.5 py-0.5 border ${meta.cls}`}>{meta.label}</span>
        </div>
        <p className="text-[10px] text-[#87919E] mt-0.5">
          {pop.responsavelPadrao} · {pop.frequencia} · SLA: {pop.sla}
        </p>

        {health ? (
          <div className="mt-1 space-y-0.5">
            {health.temTasks && (
              <div className="flex items-center gap-2 flex-wrap text-[10px]">
                <span className="text-[#87919E]">
                  Abertas <span className="text-[#EBEBEB] font-semibold">{health.abertas}</span>
                </span>
                <span className={health.atrasadas > 0 ? 'text-[#EF4444]' : 'text-[#87919E]'}>
                  Atrasadas <span className="font-semibold">{health.atrasadas}</span>
                </span>
                <span className="text-[#87919E]">
                  Concluídas (30d) <span className="text-[#EBEBEB] font-semibold">{health.concluidas30d}</span>
                </span>
                <span className="text-[#87919E]/70">
                  Última atividade: {health.ultimaAtividade ? fmtDate(health.ultimaAtividade) : 'sem registro'}
                </span>
              </div>
            )}
            {health.detalhes.map((d, i) => (
              <p key={i} className="text-[10px] text-[#95BBE2]">• {d}</p>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-[#87919E]/70 mt-1">
            Sem instrumentação — dado ainda não coletado. Se falhar: {pop.riscoSeFalhar}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-[10px] text-[#87919E]">score <span className="text-[#EBEBEB] font-semibold">{pop.score.toFixed(2)}</span></span>
        <div className="w-20 h-1.5 rounded-full bg-[#38435C]/60 overflow-hidden">
          <div className="h-full bg-[#95BBE2]" style={{ width: `${pop.nivelAutomacao}%` }} />
        </div>
        <span className="text-[9px] text-[#87919E]/70">{pop.nivelAutomacao}% automação</span>
        {pop.ondeVive && (
          <Link href={pop.ondeVive} className="inline-flex items-center gap-0.5 text-[10px] text-[#95BBE2] hover:underline">
            abrir <ArrowRight size={10} />
          </Link>
        )}
      </div>
    </div>
  )
}

export default async function ProcessosPage() {
  await requireSession()
  const health = await getProcessosHealth()

  const total = POPS_CATALOG.length
  const instrumentados = Object.keys(health.porCodigo).length
  const semInstrumentacao = total - instrumentados

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#EBEBEB]">Processos (POPs)</h1>
          <p className="text-[#87919E] text-sm mt-0.5">
            Painel de saúde real dos 21 POPs — o que está atrasado, qual rotina não rodou e quem precisa agir.
          </p>
        </div>
        <p className="text-[10px] text-[#87919E]/70 mt-1">
          Consulta em {fmtDateTime(health.consultadoEm)}
        </p>
      </div>

      {/* Resumo do estado vivo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Summary icon={HeartPulse} label="Saudáveis"           value={health.saudaveis}   cls="text-[#22C55E]" />
        <Summary icon={Workflow}   label="Em atenção"          value={health.atencao}     cls="text-[#EAB308]" />
        <Summary icon={AlertTriangle} label="Críticos"         value={health.criticos}    cls="text-[#EF4444]" />
        <Summary icon={UserCog}    label="Sem instrumentação"  value={semInstrumentacao}  cls="text-[#87919E]" />
      </div>

      {/* Processos críticos — agir agora */}
      {health.criticos > 0 && (
        <Card className="p-4 border-l-4 border-l-[#EF4444]">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={15} className="text-[#EF4444]" />
            <h2 className="text-sm font-semibold text-[#EBEBEB]">Processos críticos — agir agora</h2>
          </div>
          <div className="space-y-1.5">
            {POPS_CATALOG.filter((p) => health.porCodigo[p.codigo]?.status === 'CRITICO')
              .sort((a, b) => b.score - a.score)
              .map((p) => {
                const h = health.porCodigo[p.codigo]
                return (
                  <div key={p.codigo} className="text-[11px] text-[#EF4444]">
                    <span className="font-mono">{p.codigo}</span> {p.nome} · {p.responsavelPadrao}
                    {h && h.detalhes.length > 0 && (
                      <span className="text-[#EF4444]/80"> — {h.detalhes[0]}</span>
                    )}
                  </div>
                )
              })}
          </div>
        </Card>
      )}

      {/* Catálogo por área */}
      {POP_AREAS.map((area) => {
        const pops = POPS_CATALOG
          .filter((p) => p.area === area.key)
          .sort((a, b) => b.score - a.score)
        if (pops.length === 0) return null
        return (
          <div key={area.key} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-[#87919E]">{area.key}</span>
              <h2 className="text-sm font-semibold text-[#EBEBEB]">{area.nome}</h2>
            </div>
            <div className="space-y-1.5">
              {pops.map((p) => (
                <PopRow key={p.codigo} pop={p} health={health.porCodigo[p.codigo]} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Summary({
  icon: Icon, label, value, cls,
}: {
  icon: typeof Workflow; label: string; value: number | string; cls: string
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2">
        <Icon size={14} className={cls} />
        <p className="text-[10px] text-[#87919E] uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-2xl font-bold mt-1 ${cls}`}>{value}</p>
    </Card>
  )
}
