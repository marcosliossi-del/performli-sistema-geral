import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { formatCurrency, formatNumber, formatSaoPauloDateTime } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/**
 * Diagnóstico de Fontes (ADMIN) — criado no caso "New Man Store" (dados ~10x
 * menores que o GA4 real). Mostra, por cliente: contas vinculadas (externalId +
 * última sync), snapshots dos últimos 8 dias lado a lado por plataforma e o
 * SyncLog recente. Objetivo: comparar com o Looker/GA4 e apontar ONDE o número
 * encolhe (vínculo errado × sync falhando × precedência GA4Sync).
 */
export default async function DiagnosticoFontesPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>
}) {
  const session = await requireSession()
  if (session.role !== 'ADMIN') redirect('/cockpit')
  const { slug } = await searchParams

  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' },
  })
  const client = slug ? clients.find((c) => c.slug === slug) ?? null : null

  let accounts: Array<{
    id: string; platform: string; externalId: string | null; name: string | null
    active: boolean; lastSyncAt: Date | null
  }> = []
  let days: Array<{
    date: string
    byPlatform: Record<string, { revenue: number; sessions: number; conversions: number; spend: number }>
  }> = []
  let logs: Array<{ platform: string; status: string; errorMessage: string | null; startedAt: Date; recordsUpserted: number }> = []

  if (client) {
    const since = new Date(Date.now() - 9 * 86_400_000)
    const [accs, snaps, rawLogs] = await Promise.all([
      prisma.platformAccount.findMany({
        where: { clientId: client.id },
        select: { id: true, platform: true, externalId: true, name: true, active: true, lastSyncAt: true },
        orderBy: { platform: 'asc' },
      }),
      prisma.metricSnapshot.findMany({
        where: { platformAccount: { clientId: client.id }, date: { gte: since } },
        select: {
          date: true, conversionValue: true, conversions: true, spend: true, clicks: true,
          platformAccount: { select: { platform: true } },
        },
        orderBy: { date: 'desc' },
      }),
      prisma.syncLog.findMany({
        where: { platformAccount: { clientId: client.id } },
        select: { platform: true, status: true, errorMessage: true, startedAt: true, recordsUpserted: true },
        orderBy: { startedAt: 'desc' },
        take: 15,
      }),
    ])
    accounts = accs

    const byDay = new Map<string, Record<string, { revenue: number; sessions: number; conversions: number; spend: number }>>()
    for (const s of snaps) {
      const key = s.date.toISOString().slice(0, 10)
      const plat = s.platformAccount.platform
      const day = byDay.get(key) ?? {}
      const cur = day[plat] ?? { revenue: 0, sessions: 0, conversions: 0, spend: 0 }
      cur.revenue += Number(s.conversionValue ?? 0)
      cur.sessions += Number(s.clicks ?? 0) // GA4 grava sessões na coluna clicks
      cur.conversions += Number(s.conversions ?? 0)
      cur.spend += Number(s.spend ?? 0)
      day[plat] = cur
      byDay.set(key, day)
    }
    days = Array.from(byDay.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, byPlatform]) => ({ date, byPlatform }))
    logs = rawLogs as typeof logs
  }

  const platforms = ['GA4', 'GA4SYNC', 'META_ADS', 'GOOGLE_ADS', 'NUVEMSHOP']

  return (
    <div className="p-5 flex flex-col gap-5 min-h-screen">
      <div>
        <h1 className="text-xl font-bold text-[#EBEBEB]">Diagnóstico de Fontes</h1>
        <p className="text-sm text-[#87919E] mt-0.5">
          O que está vinculado e o que cada sincronização gravou, dia a dia — para conferir
          contra o GA4/Looker real. Se o número já chega pequeno aqui, o problema é o vínculo
          da conta; se chega certo e a tela mostra errado, é agregação.
        </p>
      </div>

      {/* Seletor simples por links (server-side, sem JS) */}
      <div className="flex flex-wrap gap-1.5">
        {clients.map((c) => (
          <a
            key={c.id}
            href={`/diagnostico-fontes?slug=${c.slug}`}
            className={`px-2.5 py-1 rounded-lg text-[12px] border ${
              c.slug === slug
                ? 'border-[#54e0ee] text-[#54e0ee]'
                : 'border-[#38435C] text-[#a3b2c2] hover:text-[#f2f6fa]'
            }`}
          >
            {c.name}
          </a>
        ))}
      </div>

      {client && (
        <>
          <div className="bg-[#0D2137] border border-[#38435C] rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-[#EBEBEB] mb-3">Contas vinculadas — {client.name}</h2>
            {accounts.length === 0 ? (
              <p className="text-sm text-[#EF4444]">Nenhuma conta vinculada — nenhum dado pode entrar.</p>
            ) : (
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-[#87919E] text-left">
                    <th className="py-1 pr-3">Plataforma</th>
                    <th className="py-1 pr-3">ID externo (confira com o Looker/BM)</th>
                    <th className="py-1 pr-3">Nome</th>
                    <th className="py-1 pr-3">Ativa</th>
                    <th className="py-1">Última sincronização</th>
                  </tr>
                </thead>
                <tbody className="text-[#EBEBEB]">
                  {accounts.map((a) => (
                    <tr key={a.id} className="border-t border-white/5">
                      <td className="py-1.5 pr-3 font-medium">{a.platform}</td>
                      <td className="py-1.5 pr-3 font-mono text-[11.5px]">{a.externalId ?? '—'}</td>
                      <td className="py-1.5 pr-3">{a.name ?? '—'}</td>
                      <td className="py-1.5 pr-3">{a.active ? 'sim' : 'NÃO'}</td>
                      <td className="py-1.5">{a.lastSyncAt ? formatSaoPauloDateTime(a.lastSyncAt) : 'nunca'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-[11px] text-[#87919E] mt-2">
              Faltando GOOGLE_ADS aqui? O investimento do Google não entra. TikTok ainda não é
              integração suportada (spend TikTok nunca entra — lacuna conhecida).
            </p>
          </div>

          <div className="bg-[#0D2137] border border-[#38435C] rounded-2xl p-4 overflow-x-auto">
            <h2 className="text-sm font-semibold text-[#EBEBEB] mb-3">
              O que cada fonte gravou — últimos 8 dias (receita · sessões* · compras · spend — *GA4 grava sessões na coluna clicks)
            </h2>
            <table className="w-full text-[12px] min-w-[720px]">
              <thead>
                <tr className="text-[#87919E] text-left">
                  <th className="py-1 pr-3">Dia</th>
                  {platforms.map((p) => <th key={p} className="py-1 pr-3">{p}</th>)}
                </tr>
              </thead>
              <tbody className="text-[#EBEBEB]">
                {days.map((d) => (
                  <tr key={d.date} className="border-t border-white/5 align-top">
                    <td className="py-1.5 pr-3 font-medium whitespace-nowrap">{d.date}</td>
                    {platforms.map((p) => {
                      const v = d.byPlatform[p]
                      return (
                        <td key={p} className="py-1.5 pr-3 whitespace-nowrap">
                          {v ? (
                            <>
                              {formatCurrency(v.revenue)} · {formatNumber(v.sessions, 0)}s ·{' '}
                              {formatNumber(v.conversions, 0)}c · {formatCurrency(v.spend)}
                            </>
                          ) : (
                            <span className="text-[#647488]">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {days.length === 0 && (
                  <tr><td colSpan={6} className="py-3 text-[#EF4444]">Nenhum snapshot nos últimos 8 dias — o sync não está gravando para este cliente.</td></tr>
                )}
              </tbody>
            </table>
            <p className="text-[11px] text-[#87919E] mt-2">
              Regra de exibição nas telas: dia com GA4SYNC usa GA4SYNC; senão GA4. Se o GA4SYNC
              estiver menor que o GA4 no mesmo dia, é loja errada/parcial vinculada — o número
              real do GA4 está sendo suprimido.
            </p>
          </div>

          <div className="bg-[#0D2137] border border-[#38435C] rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-[#EBEBEB] mb-3">Sincronizações recentes</h2>
            {logs.length === 0 ? (
              <p className="text-sm text-[#87919E]">Sem registros de sync para este cliente.</p>
            ) : (
              <ul className="text-[12px] text-[#a3b2c2] space-y-1">
                {logs.map((l, i) => (
                  <li key={i}>
                    <span className="text-[#EBEBEB]">{l.platform}</span> · {l.status} ·{' '}
                    {formatSaoPauloDateTime(l.startedAt)} · {l.recordsUpserted} registros
                    {l.errorMessage ? ` — ${l.errorMessage}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
