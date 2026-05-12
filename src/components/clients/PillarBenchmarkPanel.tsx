'use client'

// Benchmark comparisons grouped by strategic pillar
// Shows client actuals vs market benchmarks for e-commerce

interface PillarBenchmarkProps {
  // from getClientKPIs
  roas: number | null
  ctr: number | null
  cpc: number | null
  taxaConversao: number | null
  ticketMedio: number | null
  cpa: number | null
}

const BENCHMARKS = {
  roas:          { label: 'ROAS',             bad: 2.5,  ok: 4.0,  good: 7.0,  unit: 'x',   lowerIsBetter: false },
  ctr:           { label: 'CTR (Link)',        bad: 0.8,  ok: 1.5,  good: 2.5,  unit: '%',   lowerIsBetter: false },
  cpc:           { label: 'CPC',              bad: 3.0,  ok: 1.5,  good: 0.8,  unit: 'R$',  lowerIsBetter: true  },
  taxaConversao: { label: 'Taxa de Conversão', bad: 0.8,  ok: 1.5,  good: 3.0,  unit: '%',   lowerIsBetter: false },
  ticketMedio:   { label: 'Ticket Médio',      bad: 80,   ok: 200,  good: 500,  unit: 'R$',  lowerIsBetter: false },
  cpa:           { label: 'CPA',              bad: 200,  ok: 80,   good: 30,   unit: 'R$',  lowerIsBetter: true  },
}

type BenchmarkKey = keyof typeof BENCHMARKS

const PILLARS: { label: string; keys: BenchmarkKey[] }[] = [
  { label: 'Receita',    keys: ['roas', 'ticketMedio', 'cpa'] },
  { label: 'Tráfego',   keys: ['ctr', 'cpc'] },
  { label: 'Conversão', keys: ['taxaConversao'] },
]

function getStatus(key: BenchmarkKey, value: number): 'good' | 'ok' | 'bad' {
  const b = BENCHMARKS[key]
  if (b.lowerIsBetter) {
    if (value <= b.good) return 'good'
    if (value <= b.ok)   return 'ok'
    return 'bad'
  } else {
    if (value >= b.good) return 'good'
    if (value >= b.ok)   return 'ok'
    return 'bad'
  }
}

function formatVal(key: BenchmarkKey, value: number): string {
  const b = BENCHMARKS[key]
  if (b.unit === 'R$') return `R$${value.toFixed(2)}`
  if (b.unit === '%')  return `${value.toFixed(2)}%`
  return `${value.toFixed(2)}x`
}

function BenchmarkRow({ benchKey, value }: { benchKey: BenchmarkKey; value: number }) {
  const b = BENCHMARKS[benchKey]
  const status = getStatus(benchKey, value)

  const color =
    status === 'good' ? 'text-[#22C55E]'
    : status === 'ok' ? 'text-[#EAB308]'
    : 'text-[#EF4444]'

  const bgColor =
    status === 'good' ? 'bg-[#22C55E]/10'
    : status === 'ok' ? 'bg-[#EAB308]/10'
    : 'bg-[#EF4444]/10'

  const benchmarkLabel =
    status === 'good' ? `acima do benchmark (${b.unit === 'R$' ? 'R$' : ''}${b.ok}${b.unit !== 'R$' ? b.unit : ''})`
    : status === 'ok'  ? `dentro do benchmark`
    : `abaixo do benchmark (ref: ${b.unit === 'R$' ? 'R$' : ''}${b.ok}${b.unit !== 'R$' ? b.unit : ''})`

  return (
    <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg ${bgColor}`}>
      <span className="text-xs text-[#EBEBEB]">{b.label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-semibold ${color}`}>{formatVal(benchKey, value)}</span>
        <span className="text-[10px] text-[#87919E]">{benchmarkLabel}</span>
      </div>
    </div>
  )
}

export function PillarBenchmarkPanel(props: PillarBenchmarkProps) {
  const values: Record<BenchmarkKey, number | null> = {
    roas:          props.roas,
    ctr:           props.ctr,
    cpc:           props.cpc,
    taxaConversao: props.taxaConversao,
    ticketMedio:   props.ticketMedio,
    cpa:           props.cpa,
  }

  const pillarsFilled = PILLARS.filter((p) =>
    p.keys.some((k) => values[k] != null)
  )

  if (pillarsFilled.length === 0) return null

  return (
    <div>
      <h2 className="text-sm font-semibold text-[#EBEBEB] mb-3">Benchmarks de Mercado</h2>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {PILLARS.map((pillar) => {
          const rows = pillar.keys.filter((k) => values[k] != null)
          if (rows.length === 0) return null
          return (
            <div key={pillar.label} className="card p-3 space-y-2">
              <p className="text-[10px] font-semibold text-[#95BBE2] uppercase tracking-wider">{pillar.label}</p>
              {rows.map((k) => (
                <BenchmarkRow key={k} benchKey={k} value={values[k]!} />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
