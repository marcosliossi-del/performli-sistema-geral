/**
 * Fallback de carregamento das quebras de e-commerce, exibido pelo <Suspense>
 * próprio da BreakdownsSection — assim o dashboard principal (10 cards + funil)
 * NÃO espera o GA4Sync, que pode ser mais lento. Coerente com os demais
 * skeletons do portal (rounded-2xl, borda #38435C, bg #0A1E2C, pulse).
 */
export function BreakdownsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando análises da sua loja">
      <div className="h-4 w-40 animate-pulse rounded bg-[#38435C]/40" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-52 animate-pulse rounded-2xl border border-[#38435C] bg-[#0A1E2C]"
          />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-2xl border border-[#38435C] bg-[#0A1E2C]" />
    </div>
  )
}
