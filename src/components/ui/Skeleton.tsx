export function Skeleton({ className }: { className?: string }) {
  return <div className={`ak-skeleton ${className ?? ''}`} />
}

/** Esqueleto genérico de página: título + faixa de KPIs + tabela. Estilo iOS. */
export function PageSkeleton({ kpis = 5, rows = 8 }: { kpis?: number; rows?: number }) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-3.5 w-72" />
      </div>
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: kpis }).map((_, i) => (
          <div key={i} className="card p-4 min-w-[128px]">
            <Skeleton className="h-7 w-14" />
            <Skeleton className="h-2.5 w-16 mt-2" />
          </div>
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.05]">
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="divide-y divide-white/[0.05]">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              <Skeleton className="h-4 flex-1 max-w-[280px]" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-16 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
