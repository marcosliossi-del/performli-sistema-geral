'use client'

import { formatCurrency, formatNumber } from '@/lib/utils'

export interface LocalKPIs {
  // Investimento
  investimento: number
  // Alcance & Distribuição
  alcance: number | null
  impressoes: number | null
  frequencia: number | null
  cpm: number | null
  // Cliques
  cliques: number | null
  cpc: number | null
  ctr: number | null
  // Conversão / Captação
  leads: number | null
  cpl: number | null
  // Engajamento (mensagens)
  mensagens: number | null
  custoMensagem: number | null
  // Página de destino
  landingPageViews: number | null
  taxaConexao: number | null   // landingPageViews / cliques * 100
  // Vídeo (opcional — só mostra se > 0)
  thruplays: number | null
  videoViews3s: number | null
  // Vendas via pixel Meta (restaurantes / e-com local)
  adVendas: number | null
  adRevenueMeta: number | null
  custoVenda: number | null
  ticketMedioMeta: number | null
}

function Tile({
  label, value, sub, tag,
}: {
  label: string
  value: string
  sub?: string
  tag?: string
}) {
  return (
    <div className="bg-[#0A1E2C] border border-[#38435C] rounded-xl p-4">
      <div className="flex items-start justify-between mb-1">
        <p className="text-[10px] font-medium text-[#87919E] uppercase tracking-wide">{label}</p>
        {tag && (
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[#38435C] text-[#87919E] uppercase tracking-wide ml-1 flex-shrink-0">
            {tag}
          </span>
        )}
      </div>
      <p className="text-xl font-bold text-[#EBEBEB] leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-[#87919E] mt-1">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-[#87919E] uppercase tracking-widest mb-2 mt-5 first:mt-0">
      {children}
    </p>
  )
}

export function LocalBusinessKPISection({ kpis }: { kpis: LocalKPIs }) {
  const hasVideo = (kpis.thruplays ?? 0) > 0 || (kpis.videoViews3s ?? 0) > 0

  return (
    <div className="space-y-1">
      {/* ── Investimento & Distribuição ─────────────────────────────────────── */}
      <SectionTitle>Investimento & Distribuição</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <Tile
          label="Valor Investido"
          value={kpis.investimento > 0 ? formatCurrency(kpis.investimento) : '—'}
          sub="Meta Ads"
        />
        <Tile
          label="Alcance"
          value={kpis.alcance != null ? formatNumber(kpis.alcance, 0) : '—'}
          sub="pessoas únicas"
        />
        <Tile
          label="Impressões"
          value={kpis.impressoes != null ? formatNumber(kpis.impressoes, 0) : '—'}
          sub="total de exibições"
        />
        <Tile
          label="Frequência"
          value={kpis.frequencia != null ? kpis.frequencia.toFixed(2) : '—'}
          sub="impressões / alcance"
        />
        <Tile
          label="CPM médio"
          value={kpis.cpm != null ? formatCurrency(kpis.cpm) : '—'}
          sub="custo por mil impressões"
        />
      </div>

      {/* ── Cliques ─────────────────────────────────────────────────────────── */}
      <SectionTitle>Cliques no Link</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
        <Tile
          label="Total de Cliques"
          value={kpis.cliques != null ? formatNumber(kpis.cliques, 0) : '—'}
        />
        <Tile
          label="CPC médio"
          value={kpis.cpc != null ? formatCurrency(kpis.cpc) : '—'}
          sub="custo por clique"
        />
        <Tile
          label="CTR"
          value={kpis.ctr != null ? `${kpis.ctr.toFixed(2)}%` : '—'}
          sub="cliques / impressões"
        />
        {kpis.landingPageViews != null && (
          <Tile
            label="Visualiz. Pág. Destino"
            value={formatNumber(kpis.landingPageViews, 0)}
            sub={kpis.taxaConexao != null ? `taxa de conexão ${kpis.taxaConexao.toFixed(1)}%` : undefined}
          />
        )}
      </div>

      {/* ── Captação / Leads ────────────────────────────────────────────────── */}
      {(kpis.leads != null || kpis.mensagens != null) && (
        <>
          <SectionTitle>Captação</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {kpis.leads != null && (
              <Tile
                label="Leads / Formulários"
                value={formatNumber(kpis.leads, 0)}
                sub="conversões da campanha"
              />
            )}
            {kpis.cpl != null && (
              <Tile
                label="Custo por Lead"
                value={formatCurrency(kpis.cpl)}
                sub="invest / leads"
              />
            )}
            {kpis.mensagens != null && (
              <Tile
                label="Conversas Iniciadas"
                value={formatNumber(kpis.mensagens, 0)}
                sub="mensagens via anúncio"
              />
            )}
            {kpis.custoMensagem != null && kpis.mensagens != null && kpis.mensagens > 0 && (
              <Tile
                label="Custo por Conversa"
                value={formatCurrency(kpis.custoMensagem)}
              />
            )}
          </div>
        </>
      )}

      {/* ── Vendas via pixel (restaurantes / e-com local) ──────────────────── */}
      {kpis.adVendas != null && kpis.adVendas > 0 && (
        <>
          <SectionTitle>Vendas</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            <Tile
              label="Vendas"
              value={formatNumber(kpis.adVendas, 0)}
              sub="compras via pixel Meta"
            />
            <Tile
              label="Custo por Venda"
              value={kpis.custoVenda != null ? formatCurrency(kpis.custoVenda) : '—'}
              sub="invest / vendas"
            />
            {kpis.adRevenueMeta != null && kpis.adRevenueMeta > 0 && (
              <Tile
                label="Receita (Meta pixel)"
                value={formatCurrency(kpis.adRevenueMeta)}
                sub="valor das compras"
              />
            )}
            {kpis.ticketMedioMeta != null && (
              <Tile
                label="Ticket Médio"
                value={formatCurrency(kpis.ticketMedioMeta)}
                sub="receita / vendas"
              />
            )}
          </div>
        </>
      )}

      {/* ── Vídeo (condicional) ─────────────────────────────────────────────── */}
      {hasVideo && (
        <>
          <SectionTitle>Vídeo</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {(kpis.videoViews3s ?? 0) > 0 && (
              <Tile
                label="Reproduções ≥3s"
                value={formatNumber(kpis.videoViews3s!, 0)}
                sub="iniciaram o vídeo"
              />
            )}
            {(kpis.thruplays ?? 0) > 0 && (
              <Tile
                label="Thruplays"
                value={formatNumber(kpis.thruplays!, 0)}
                sub="assistiram até o fim"
              />
            )}
            {(kpis.thruplays ?? 0) > 0 && (kpis.videoViews3s ?? 0) > 0 && (
              <Tile
                label="Taxa de Conclusão"
                value={`${((kpis.thruplays! / kpis.videoViews3s!) * 100).toFixed(1)}%`}
                sub="thruplays / views 3s"
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
