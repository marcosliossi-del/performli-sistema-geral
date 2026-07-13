import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/financeiro/cashflow?months=6
 * Returns monthly entrada/saída aggregation for the chart.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const months = parseInt(request.nextUrl.searchParams.get('months') ?? '6', 10)
  const today  = new Date()

  const results: Array<{
    month: string       // "Jan", "Fev"
    year: number
    entradas: number
    saidas: number
    lucro: number
  }> = []

  const ptMonths = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

  // Build month descriptors from newest-back (mantém a ordem: i = months-1 → 0)
  const monthDescriptors = []
  for (let i = months - 1; i >= 0; i--) {
    const d     = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const start = new Date(d.getFullYear(), d.getMonth(), 1)
    const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
    monthDescriptors.push({ d, start, end })
  }

  // Aggregate all months in parallel (mantém a ordem via Promise.all)
  const monthAggs = await Promise.all(
    monthDescriptors.map(({ start, end }) =>
      Promise.all([
        prisma.asaasPayment.aggregate({
          where: {
            status: { in: ['RECEIVED', 'CONFIRMED'] },
            paymentDate: { gte: start, lte: end },
          },
          _sum: { value: true },
        }),
        // Saídas realizadas: despesas (extrato Asaas + manuais)
        prisma.expense.aggregate({
          where: { date: { gte: start, lte: end } },
          _sum: { value: true },
        }),
      ]),
    ),
  )

  monthDescriptors.forEach(({ d }, idx) => {
    const [entradasAgg, expensesAgg] = monthAggs[idx]
    const entradas = Number(entradasAgg._sum.value ?? 0)
    const saidas   = Number(expensesAgg._sum.value ?? 0)

    results.push({
      month: ptMonths[d.getMonth()],
      year: d.getFullYear(),
      entradas,
      saidas,
      lucro: entradas - saidas,
    })
  })

  // Receita média por cliente over time (activeCount é invariante — 1× fora do loop)
  const activeCount = await prisma.client.count({ where: { status: 'ACTIVE' } })
  const receitaMedia: Array<{ month: string; value: number }> = results.map((row) => ({
    month: row.month,
    value: activeCount > 0 ? row.entradas / activeCount : 0,
  }))

  return NextResponse.json({ cashflow: results, receitaMedia })
}
