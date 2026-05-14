import { formatCurrency, formatNumber } from '@/lib/utils'

interface LocalKPIs {
  investimento: number
  adLeads: number | null
  adAlcance: number | null
  adImpressions: number | null
  ctr: number | null
  cpc: number | null
  cpl: number | null
}

function Tile({ label, value, sub, lowerIsBetter = false }: {
  label: string
  value: string
  sub?: string
  lowerIsBetter?: boolean
}) {
  void lowerIsBetter
  return (
    <div className="bg-[#0A1E2C] border border-[#38435C] rounded-xl p-4">
      <p className="text-[10px] font-medium text-[#87919E] uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-bold text-[#EBEBEB] leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-[#87919E] mt-1">{sub}</p>}
    </div>
  )
}

export function LocalBusinessKPISection({ kpis }: { kpis: LocalKPIs }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-[#EBEBEB] mb-3">KPIs de Tráfego e Captação</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
        <Tile
          label="Investimento"
          value={kpis.investimento > 0 ? formatCurrency(kpis.investimento) : '—'}
          sub="Meta Ads"
        />
        <Tile
          label="Leads / Conversões"
          value={kpis.adLeads != null ? formatNumber(kpis.adLeads, 0) : '—'}
          sub="eventos de campanha"
        />
        <Tile
          label="CPL (Custo por Lead)"
          value={kpis.cpl != null ? formatCurrency(kpis.cpl) : '—'}
          sub="invest / leads"
          lowerIsBetter
        />
        <Tile
          label="Alcance"
          value={kpis.adAlcance != null ? formatNumber(kpis.adAlcance, 0) : '—'}
          sub="pessoas únicas"
        />
        <Tile
          label="Impressões"
          value={kpis.adImpressions != null ? formatNumber(kpis.adImpressions, 0) : '—'}
        />
        <Tile
          label="CTR Link"
          value={kpis.ctr != null ? `${kpis.ctr.toFixed(2)}%` : '—'}
          sub="cliques / impressões"
        />
        <Tile
          label="CPC"
          value={kpis.cpc != null ? formatCurrency(kpis.cpc) : '—'}
          sub="custo por clique"
          lowerIsBetter
        />
      </div>
    </div>
  )
}
