import { Store, CloudOff } from 'lucide-react'
import { getPortalBreakdowns } from '@/lib/portal/ga4sync'
import type { PortalPeriod } from '@/lib/portal/kpis'
import { BreakdownBarList, type BreakdownBarRow } from './BreakdownBarList'
import { ProductsSection } from './ProductsSection'
import { RetentionCard } from './RetentionCard'

interface BreakdownsSectionProps {
  /** SEMPRE da sessão (getAuthorizedClient). Nunca de param/query. */
  clientId: string
  period: PortalPeriod
}

/** contagem pt-BR com rótulo ("12 pedidos", "48 un."). */
function countLabel(n: number, singular: string, plural: string): string {
  const fmt = n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
  return `${fmt} ${n === 1 ? singular : plural}`
}

/**
 * Nota discreta e honesta (não é erro): usada quando a loja não está conectada
 * ou quando as análises estão temporariamente indisponíveis. Mantém o espírito
 * do ComingSoonNote — visual calmo, sem stack, linguagem de lojista.
 */
function BreakdownNote({
  icon,
  title,
  message,
}: {
  icon: 'store' | 'offline'
  title: string
  message: string
}) {
  return (
    <section
      aria-labelledby="breakdowns-note-title"
      className="rounded-2xl border border-dashed border-[#38435C] bg-[#0A1E2C]/50 p-5"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#95BBE2]/25 bg-[#95BBE2]/10 text-[#95BBE2]">
          {icon === 'store' ? (
            <Store size={16} aria-hidden />
          ) : (
            <CloudOff size={16} aria-hidden />
          )}
        </span>
        <div className="min-w-0">
          <h2 id="breakdowns-note-title" className="text-sm font-semibold text-[#EBEBEB]">
            {title}
          </h2>
          <p className="mt-1 text-xs text-[#87919E]">{message}</p>
        </div>
      </div>
    </section>
  )
}

/**
 * Quebras de e-commerce do portal (canais, produtos, categorias, regiões,
 * retenção/LTV). Server component que CONSOME o adapter getPortalBreakdowns
 * (nunca lança). Renderiza os 3 estados de degrade:
 *
 *  1. storeConnected=false → nota honesta "conecte a loja" (sem erro).
 *  2. unavailable=true     → nota "temporariamente indisponível" (sem stack).
 *  3. normal               → só as seções != null; seção null some.
 *
 * clientId SEMPRE da sessão (repassado pela página).
 */
export async function BreakdownsSection({ clientId, period }: BreakdownsSectionProps) {
  const b = await getPortalBreakdowns(clientId, period)

  // Estado 1: loja não conectada — nota honesta, nunca erro.
  if (!b.storeConnected) {
    return (
      <BreakdownNote
        icon="store"
        title="Análises de e-commerce da sua loja"
        message="As análises por canais, produtos, categorias e regiões aparecem aqui assim que sua loja Nuvemshop estiver conectada."
      />
    )
  }

  // Estado 2: indisponível no momento — sem stack, tom tranquilo.
  if (b.unavailable) {
    return (
      <BreakdownNote
        icon="offline"
        title="Análises de e-commerce temporariamente indisponíveis"
        message="Não conseguimos carregar as quebras da sua loja agora. Tente novamente em instantes."
      />
    )
  }

  const channelRows: BreakdownBarRow[] | null =
    b.channels?.map((r) => ({
      id: r.channel,
      label: r.channel,
      revenue: r.revenue,
      sharePct: r.sharePct,
      countLabel: countLabel(r.orders, 'pedido', 'pedidos'),
    })) ?? null

  const categoryRows: BreakdownBarRow[] | null =
    b.categories?.map((r) => ({
      id: r.category,
      label: r.category,
      revenue: r.revenue,
      sharePct: r.sharePct,
      countLabel: countLabel(r.unitsSold, 'unidade', 'unidades'),
    })) ?? null

  const regionRows: BreakdownBarRow[] | null =
    b.regions?.map((r) => ({
      id: r.region,
      label: r.region,
      revenue: r.revenue,
      sharePct: r.sharePct,
      countLabel: countLabel(r.orders, 'pedido', 'pedidos'),
    })) ?? null

  const hasAny =
    channelRows || categoryRows || regionRows || b.products || b.retention

  // Loja conectada mas nenhuma seção para mostrar. DISTINGUIR a causa
  // (anti-falha-silenciosa): se houve falha parcial, NÃO chamar de "sem vendas".
  if (!hasAny) {
    return b.partialFailure ? (
      <BreakdownNote
        icon="offline"
        title="Não foi possível carregar as análises agora"
        message="Tivemos um problema ao buscar as quebras da sua loja neste período. Tente novamente em instantes."
      />
    ) : (
      <BreakdownNote
        icon="store"
        title="Análises de e-commerce da sua loja"
        message="Ainda não há vendas suficientes neste período para detalhar canais, produtos, categorias e regiões. Experimente ampliar o período."
      />
    )
  }

  // Estado 3 (normal): só renderiza seção != null. Uma seção null simplesmente
  // não aparece — nunca gráfico/número inventado.
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[#647488]">
        Análises da sua loja
      </h2>
      {/* Falha parcial: algumas seções carregaram, outras não. Aviso honesto
          para o lojista não interpretar a ausência como "não teve venda". */}
      {b.partialFailure && (
        <p className="flex items-center gap-1.5 text-xs text-[#87919E]">
          <CloudOff size={12} aria-hidden />
          Algumas análises não puderam ser carregadas agora e podem aparecer
          incompletas. Tente novamente em instantes.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {channelRows && (
          <BreakdownBarList
            id="channels"
            title="Vendas por canal"
            subtitle="De onde vem a receita da sua loja no período."
            rows={channelRows}
          />
        )}
        {categoryRows && (
          <BreakdownBarList
            id="categories"
            title="Vendas por categoria"
            subtitle="As categorias que mais faturam no período."
            rows={categoryRows}
          />
        )}
        {regionRows && (
          <BreakdownBarList
            id="regions"
            title="Vendas por região"
            subtitle="De quais regiões vêm seus clientes no período."
            rows={regionRows}
          />
        )}
        {b.products && <ProductsSection rows={b.products} />}
      </div>
      {b.retention && <RetentionCard data={b.retention} />}
    </div>
  )
}
