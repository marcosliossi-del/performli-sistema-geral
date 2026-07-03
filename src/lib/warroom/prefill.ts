import 'server-only'
import { prisma } from '@/lib/prisma'

/**
 * WAR-14 — Pré-preenchimento do diagnóstico do gestor (MENOS CLIQUES).
 *
 * Ao abrir o form de um protocolo ativo, sugerimos automaticamente o que o
 * sistema já sabe, para o gestor só completar hipótese/teste:
 *   • situacao       — comparação de números (ROAS/faturamento/spend) dos 7 dias
 *                      ANTES da abertura do protocolo vs os 7 dias mais recentes;
 *   • desdeQuando     — data de ativação do protocolo (dd/mm/aaaa);
 *   • oQueJaFoiFeito  — títulos das últimas 5 tasks CONCLUÍDAS do cliente desde
 *                      a ativação.
 * Sem dados suficientes → strings vazias (o gestor preenche à mão).
 *
 * TRADE-OFF (N+1): a página chama esta função uma vez por protocolo ativo (2
 * queries cada: agregação + tasks concluídas). Com a realidade da Arkza (~30
 * clientes, poucos protocolos ativos simultâneos) o custo é irrelevante e o
 * código fica legível. Se o volume de War Rooms ativas crescer muito, trocar
 * por agregação em lote (groupBy por clientId) — hoje não compensa.
 */

export type DiagnosticoPrefill = {
  situacao: string
  desdeQuando: string
  oQueJaFoiFeito: string
}

const DAY = 86_400_000

type Agg = { spend: number; faturamento: number; roas: number | null }

async function aggregateWindow(clientId: string, start: Date, end: Date): Promise<Agg | null> {
  const res = await prisma.metricSnapshot.aggregate({
    where: { clientId, date: { gte: start, lt: end } },
    _sum: { spend: true, conversionValue: true },
    _count: { _all: true },
  })
  if (res._count._all === 0) return null
  const spend = Number(res._sum.spend ?? 0)
  const faturamento = Number(res._sum.conversionValue ?? 0)
  const roas = spend > 0 ? faturamento / spend : null
  return { spend, faturamento, roas }
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function trecho(label: string, antes: number, agora: number, fmt: (n: number) => string): string {
  const delta = antes !== 0 ? Math.round(((agora - antes) / antes) * 100) : null
  const sinal = delta == null ? '' : delta >= 0 ? ` (+${delta}%)` : ` (${delta}%)`
  return `${label}: ${fmt(antes)} → ${fmt(agora)}${sinal}`
}

/**
 * Monta a sugestão de situação comparando as duas janelas de 7 dias. Retorna ''
 * se faltar qualquer uma das janelas (comparação sem base não é honesta).
 */
export async function buildDiagnosticoPrefill(args: {
  clientId: string
  activatedAt: Date
}): Promise<DiagnosticoPrefill> {
  const { clientId, activatedAt } = args

  const desdeQuando = new Date(activatedAt).toLocaleDateString('pt-BR')

  // ── Situação: 7d antes da abertura vs 7d mais recentes ─────────────────────
  const antesEnd = new Date(activatedAt)
  const antesStart = new Date(antesEnd.getTime() - 7 * DAY)
  const agoraEnd = new Date()
  const agoraStart = new Date(agoraEnd.getTime() - 7 * DAY)

  const [antes, agora] = await Promise.all([
    aggregateWindow(clientId, antesStart, antesEnd),
    aggregateWindow(clientId, agoraStart, agoraEnd),
  ])

  let situacao = ''
  if (antes && agora) {
    const linhas: string[] = []
    if (antes.roas != null && agora.roas != null) {
      linhas.push(trecho('ROAS', antes.roas, agora.roas, (n) => n.toFixed(2)))
    }
    linhas.push(trecho('Faturamento 7d', antes.faturamento, agora.faturamento, fmtBRL))
    linhas.push(trecho('Investimento 7d', antes.spend, agora.spend, fmtBRL))
    situacao = `Comparativo automático (7 dias antes da abertura vs 7 dias mais recentes):\n${linhas.join('\n')}`
  }

  // ── O que já foi feito: últimas 5 tasks concluídas desde a ativação ────────
  const tasks = await prisma.task.findMany({
    where: {
      clientId,
      status: 'CONCLUIDO',
      completedAt: { gte: new Date(activatedAt) },
    },
    orderBy: { completedAt: 'desc' },
    take: 5,
    select: { title: true },
  })
  const oQueJaFoiFeito = tasks.length > 0 ? tasks.map((t) => `• ${t.title}`).join('\n') : ''

  return { situacao, desdeQuando, oQueJaFoiFeito }
}
