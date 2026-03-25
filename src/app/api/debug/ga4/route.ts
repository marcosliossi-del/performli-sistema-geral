import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { GA4Client } from '@/services/ga4/client'

/**
 * GET /api/debug/ga4?propertyId=XXXXXX
 * Retorna os dados brutos da GA4 API para diagnóstico.
 * Apenas ADMIN. Remover após diagnóstico.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const propertyId = request.nextUrl.searchParams.get('propertyId')
  if (!propertyId) {
    return NextResponse.json({ error: 'propertyId é obrigatório' }, { status: 400 })
  }

  try {
    const ga4 = new GA4Client()
    const since = new Date()
    since.setDate(since.getDate() - 30)
    const sinceStr = since.toISOString().split('T')[0]
    const untilStr = new Date().toISOString().split('T')[0]

    const rows = await ga4.getReport(propertyId, sinceStr, untilStr)

    const summary = rows.map((r) => ({
      date: r.date,
      sessions: r.sessions,
      ecommercePurchases: r.ecommercePurchases,
      purchaseRevenue: r.purchaseRevenue,
      totalRevenue: r.totalRevenue,
      newUsers: r.newUsers,
    }))

    const totals = rows.reduce(
      (acc, r) => ({
        sessions: acc.sessions + parseInt(r.sessions || '0'),
        ecommercePurchases: acc.ecommercePurchases + parseInt(r.ecommercePurchases || '0'),
        purchaseRevenue: acc.purchaseRevenue + parseFloat(r.purchaseRevenue || '0'),
        totalRevenue: acc.totalRevenue + parseFloat(r.totalRevenue || '0'),
        newUsers: acc.newUsers + parseInt(r.newUsers || '0'),
      }),
      { sessions: 0, ecommercePurchases: 0, purchaseRevenue: 0, totalRevenue: 0, newUsers: 0 }
    )

    return NextResponse.json({ propertyId, period: `${sinceStr} → ${untilStr}`, totals, rows: summary })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
