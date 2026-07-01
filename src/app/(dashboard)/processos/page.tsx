import { requireSession } from '@/lib/dal'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import {
  POPS_CATALOG, POP_AREAS, type Pop, type ImplementacaoStatus,
} from '@/lib/pops-catalog'
import { Workflow, Bot, UserCog, AlertTriangle, ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

const STATUS_META: Record<ImplementacaoStatus, { label: string; cls: string }> = {
  AUTOMATIZADO: { label: 'Automatizado', cls: 'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20' },
  PARCIAL:      { label: 'Parcial',      cls: 'text-[#EAB308] bg-[#EAB308]/10 border-[#EAB308]/20' },
  MANUAL:       { label: 'Manual',       cls: 'text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/20' },
}

function PopRow({ pop }: { pop: Pop }) {
  const meta = STATUS_META[pop.implementacao]
  return (
    <div id={`pop-${pop.codigo}`} className="scroll-mt-20 flex items-start justify-between gap-3 py-2.5 px-3 rounded-lg bg-[#0A1E2C]/40 border border-[#38435C]/50">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono text-[#87919E]">{pop.codigo}</span>
          <span className="text-xs font-medium text-[#EBEBEB]">{pop.nome}</span>
          <span className={`text-[9px] rounded px-1.5 py-0.5 border ${meta.cls}`}>{meta.label}</span>
        </div>
        <p className="text-[10px] text-[#87919E] mt-0.5">
          {pop.responsavelPadrao} · {pop.frequencia} · SLA: {pop.sla}
        </p>
        <p className="text-[10px] text-[#87919E]/70 mt-0.5">Se falhar: {pop.riscoSeFalhar}</p>
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

  const total = POPS_CATALOG.length
  const automatizados = POPS_CATALOG.filter((p) => p.implementacao === 'AUTOMATIZADO').length
  const parciais = POPS_CATALOG.filter((p) => p.implementacao === 'PARCIAL').length
  const manuais = POPS_CATALOG.filter((p) => p.implementacao === 'MANUAL').length
  const automacaoMedia = Math.round(
    POPS_CATALOG.reduce((s, p) => s + p.nivelAutomacao, 0) / total,
  )

  // Onde o Marcos ainda é gargalo: manual + score alto
  const gargalos = POPS_CATALOG
    .filter((p) => p.implementacao === 'MANUAL' && p.score >= 4)
    .sort((a, b) => b.score - a.score)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#EBEBEB]">Processos (POPs)</h1>
        <p className="text-[#87919E] text-sm mt-0.5">
          Catálogo vivo dos 21 POPs — o que já roda no sistema e o que ainda depende de pessoas.
        </p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Summary icon={Bot}     label="Automatizados" value={automatizados} cls="text-[#22C55E]" />
        <Summary icon={Workflow} label="Parciais"     value={parciais}     cls="text-[#EAB308]" />
        <Summary icon={UserCog} label="Manuais"       value={manuais}      cls="text-[#EF4444]" />
        <Summary icon={Workflow} label="Automação média" value={`${automacaoMedia}%`} cls="text-[#95BBE2]" />
      </div>

      {/* Gargalos do Marcos */}
      {gargalos.length > 0 && (
        <Card className="p-4 border-l-4 border-l-[#EF4444]">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={15} className="text-[#EF4444]" />
            <h2 className="text-sm font-semibold text-[#EBEBEB]">Onde o Marcos ainda é o gargalo</h2>
          </div>
          <p className="text-[11px] text-[#87919E] mb-3">
            Processos de alto impacto (score ≥ 4) que ainda rodam no manual — prioridade de sistematização.
          </p>
          <div className="flex flex-wrap gap-2">
            {gargalos.map((p) => (
              <span key={p.codigo} className="text-[11px] text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/20 rounded px-2.5 py-1">
                <span className="font-mono">{p.codigo}</span> {p.nome} · {p.score.toFixed(2)}
              </span>
            ))}
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
              {pops.map((p) => <PopRow key={p.codigo} pop={p} />)}
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
