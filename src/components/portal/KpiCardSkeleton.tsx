export function KpiCardSkeleton() {
  return (
    <div
      className="flex animate-pulse flex-col rounded-2xl border border-[#38435C] bg-[#0A1E2C] p-5"
      aria-busy="true"
      aria-label="Carregando indicador"
    >
      <div className="mb-4 h-4 w-24 rounded bg-[#38435C]/60" />
      <div className="mb-3 h-7 w-32 rounded bg-[#38435C]/60" />
      <div className="h-[120px] rounded-xl bg-[#38435C]/30" />
    </div>
  )
}
