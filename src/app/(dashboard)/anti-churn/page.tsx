import { requireSession, getAtRiskClients, getClientChurnHistory, getWarRoomResponsibleOptions } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShieldAlert, CheckCircle, TrendingDown } from 'lucide-react'
import Link from 'next/link'
import { ChurnRiskChart } from '@/components/anti-churn/ChurnRiskChart'
import { ProtocolCard } from '@/components/anti-churn/ProtocolCard'
import { WarRoomPlanPanel } from '@/components/anti-churn/WarRoomPlanPanel'

export default async function AntiChurnPage() {
  const session = await requireSession()
  const { userId, role } = session
  const clients = await getAtRiskClients(userId, role)

  // Fetch churn risk history for all at-risk clients
  const churnHistories = await Promise.all(
    clients.map((c) => getClientChurnHistory(c.id, 10).then((h) => ({ clientId: c.id, history: h })))
  )
  const historyMap = new Map(churnHistories.map(({ clientId, history }) => [clientId, history]))

  const alto  = clients.filter((c) => c.riskLevel === 'ALTO').length
  const medio = clients.filter((c) => c.riskLevel === 'MÉDIO').length

  // ── Protocolos ativos ──────────────────────────────────────────────────────
  const isViewAll = role === 'ADMIN' || role === 'CS'
  const protocolWhere = isViewAll
    ? {}
    : { client: { assignments: { some: { userId } } } }

  const rawProtocols = await prisma.criticalProtocol.findMany({
    where: protocolWhere,
    include: {
      responsible: { select: { name: true } },
      client: {
        select: {
          name: true,
          slug: true,
          assignments: {
            where: { isPrimary: true },
            select: { user: { select: { name: true } } },
            take: 1,
          },
        },
      },
    },
    orderBy: [{ status: 'asc' }, { activatedAt: 'desc' }],
  })

  const now = Date.now()
  const protocols = rawProtocols.map((p) => ({
    id: p.id,
    trigger: p.trigger,
    status: p.status,
    activatedAt: p.activatedAt,
    closedAt: p.closedAt,
    briefingCS: p.briefingCS,
    notes: p.notes,
    client: { name: p.client.name, slug: p.client.slug },
    managerName: p.client.assignments[0]?.user?.name ?? 'Sem Gestor',
    daysSince: Math.floor((now - new Date(p.activatedAt).getTime()) / 86_400_000),
    plan: {
      id: p.id,
      clientName: p.client.name,
      status: p.status,
      diagnosis: p.diagnosis,
      exitCriteria: p.exitCriteria,
      exitMetric: p.exitMetric,
      exitTarget: p.exitTarget != null ? p.exitTarget.toString() : null,
      responsibleId: p.responsibleId,
      responsibleName: p.responsible?.name ?? null,
      deadline: p.deadline,
    },
  }))

  const activeProtocols   = protocols.filter((p) => p.status !== 'ENCERRADO')
  const closedProtocols   = protocols.filter((p) => p.status === 'ENCERRADO')

  // WAR-14: plano da War Room (critério de saída, responsável, prazo)
  const responsibleOptions = await getWarRoomResponsibleOptions()
  const canEditWarRoom = role === 'ADMIN' || role === 'CS' || role === 'MANAGER'

  return (
    <div className="space-y-8">
      {/* ── Protocolos de Conta Crítica ───────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#EBEBEB]">Protocolo de Conta Crítica</h1>
            <p className="text-[#87919E] text-sm mt-0.5">
              Contas em protocolo ativo · ROAS 2 semanas abaixo · Faturamento &lt;70% na 2ª semana
            </p>
          </div>
          {activeProtocols.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/20">
              <ShieldAlert size={14} className="text-[#EF4444]" />
              <span className="text-xs font-semibold text-[#EF4444]">
                {activeProtocols.length} ativo{activeProtocols.length > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Fluxo do protocolo */}
        <div className="grid grid-cols-4 gap-2">
          {(['ATIVADO', 'EM_EXECUCAO', 'MONITORANDO', 'ENCERRADO'] as const).map((s, i) => {
            const labels = ['1. Ativado', '2. Em Execução', '3. Monitorando', '4. Encerrado']
            const descs  = ['Aguarda diagnóstico', 'Plano em andamento', 'CS acompanha cliente', 'Saída do protocolo']
            const count  = protocols.filter((p) => p.status === s).length
            return (
              <Card key={s} className="p-3 text-center">
                <p className="text-[10px] font-semibold text-[#87919E] uppercase tracking-wider">{labels[i]}</p>
                <p className="text-2xl font-bold text-[#EBEBEB] my-1">{count}</p>
                <p className="text-[10px] text-[#87919E]/70">{descs[i]}</p>
              </Card>
            )
          })}
        </div>

        {activeProtocols.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle size={32} className="text-[#22C55E] mb-3" />
            <p className="text-[#EBEBEB] font-medium">Nenhum protocolo ativo</p>
            <p className="text-[#87919E] text-sm mt-1">
              O sistema detecta automaticamente e ativa o protocolo quando necessário.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeProtocols.map((p) => (
              <div key={p.id} className="space-y-2">
                <ProtocolCard protocol={p} role={role} />
                <WarRoomPlanPanel
                  plan={p.plan}
                  responsibleOptions={responsibleOptions}
                  canEdit={canEditWarRoom}
                />
              </div>
            ))}
          </div>
        )}

        {closedProtocols.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-xs text-[#87919E] hover:text-[#EBEBEB] transition-colors list-none flex items-center gap-1">
              <span className="group-open:hidden">▶</span>
              <span className="hidden group-open:inline">▼</span>
              Ver {closedProtocols.length} protocolo{closedProtocols.length > 1 ? 's' : ''} encerrado{closedProtocols.length > 1 ? 's' : ''}
            </summary>
            <div className="mt-3 space-y-3">
              {closedProtocols.map((p) => (
                <ProtocolCard key={p.id} protocol={p} role={role} />
              ))}
            </div>
          </details>
        )}
      </div>

      {/* ── Anti Churn — Score de Risco ───────────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-[#EBEBEB]">Anti Churn & Retenção</h2>
          <p className="text-[#87919E] text-sm mt-0.5">
            Score de risco 0–100 · semanas consecutivas em RUIM · tendência de evolução
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-[#EF4444]">
            <p className="text-xs text-[#87919E] uppercase tracking-wider mb-1">Risco Alto</p>
            <p className="text-3xl font-bold text-[#EF4444]">{alto}</p>
            <p className="text-xs text-[#87919E] mt-1">3+ semanas em Ruim · score ≥70</p>
          </Card>
          <Card className="border-l-4 border-l-[#EAB308]">
            <p className="text-xs text-[#87919E] uppercase tracking-wider mb-1">Risco Médio</p>
            <p className="text-3xl font-bold text-[#EAB308]">{medio}</p>
            <p className="text-xs text-[#87919E] mt-1">1–2 semanas em Ruim · score 40–69</p>
          </Card>
          <Card className="border-l-4 border-l-[#22C55E]">
            <p className="text-xs text-[#87919E] uppercase tracking-wider mb-1">Em Risco Total</p>
            <p className="text-3xl font-bold text-[#EBEBEB]">{clients.length}</p>
            <p className="text-xs text-[#87919E] mt-1">de todos os clientes ativos</p>
          </Card>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-[#EBEBEB]">Clientes em Risco</h3>

          {clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <CheckCircle size={32} className="text-[#22C55E] mb-3" />
              <p className="text-[#EBEBEB] font-medium">Nenhum cliente em risco</p>
              <p className="text-[#87919E] text-sm mt-1">
                Todos os clientes estão com performance estável.
              </p>
            </div>
          ) : (
            clients.map((client) => {
              const isAlto  = client.riskLevel === 'ALTO'
              const isMedio = client.riskLevel === 'MÉDIO'
              const borderColor = isAlto ? 'border-l-[#EF4444]' : isMedio ? 'border-l-[#EAB308]' : 'border-l-[#22C55E]'
              const iconColor   = isAlto ? 'text-[#EF4444]' : 'text-[#EAB308]'
              const variant     = isAlto ? 'ruim' : isMedio ? 'regular' : 'otimo'
              const history     = historyMap.get(client.id) ?? []

              return (
                <div key={client.id} className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <div className="xl:col-span-2">
                    <Card className={`p-5 border-l-4 ${borderColor}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-xl bg-[#0A1E2C] flex items-center justify-center flex-shrink-0">
                            <ShieldAlert size={18} className={iconColor} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-sm font-semibold text-[#EBEBEB]">{client.name}</h3>
                              <Badge variant={variant as 'otimo' | 'regular' | 'ruim'}>
                                Risco {client.riskLevel}
                              </Badge>
                            </div>
                            {client.primaryManager && (
                              <p className="text-xs text-[#87919E] mb-1">Gestor: {client.primaryManager}</p>
                            )}
                            <div className="flex items-center gap-1.5 text-xs text-[#87919E]">
                              <TrendingDown size={12} className={iconColor} />
                              <span>
                                <span className={`font-semibold ${iconColor}`}>{client.consecutiveRuimWeeks}</span>{' '}
                                semana{client.consecutiveRuimWeeks !== 1 ? 's' : ''} consecutiva{client.consecutiveRuimWeeks !== 1 ? 's' : ''} em Ruim
                              </span>
                              {client.worstMetric && (
                                <>
                                  <span className="text-[#38435C]">·</span>
                                  <span>Pior: <span className="text-[#EBEBEB]">{client.worstMetric}</span> ({client.worstPct}%)</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Link
                            href="/ai-agents"
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#95BBE2]/10 text-[#95BBE2] text-xs font-medium hover:bg-[#95BBE2]/20 transition-colors border border-[#95BBE2]/20"
                          >
                            Script IA
                          </Link>
                          <Link
                            href={`/clients/${client.slug}`}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#38435C]/50 text-[#EBEBEB] text-xs font-medium hover:bg-[#38435C] transition-colors border border-[#38435C]"
                          >
                            Ver cliente →
                          </Link>
                        </div>
                      </div>
                    </Card>
                  </div>
                  <div>
                    <ChurnRiskChart data={history} clientName={client.name} />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
