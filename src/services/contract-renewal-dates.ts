/**
 * Datas da renovação por IGUAL período (adendo FUNDACAO). Módulo PURO (sem
 * prisma/side-effects) para ser unit-testável isolado — fonte única usada pelo
 * cron (contract-renewal) E pela reativação (updateClientsStatus).
 *
 * Regra: duração = endDate − startDate; novo início = fim anterior
 * (continuidade); novo fim = novo início + duração.
 */
export function computeRenewalDates(
  startDate: Date,
  endDate: Date,
): { newStart: Date; newEnd: Date } {
  const duration = endDate.getTime() - startDate.getTime()
  const newStart = new Date(endDate.getTime())
  const newEnd = new Date(endDate.getTime() + duration)
  return { newStart, newEnd }
}
