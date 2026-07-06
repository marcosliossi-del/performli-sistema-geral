import 'server-only'
import { prisma } from '@/lib/prisma'
import { getMonthRange } from '@/lib/utils'
import { investimentoTotal } from '@/lib/metas/projection'
import { getRealizado } from '@/lib/metas/realizado'
import { recalculateClientHealth } from '@/services/health-scorer'
import { syncWeeklyGoalsFromMonthly } from '@/services/weekly-goals-sync'
import { writeAuditLog } from '@/lib/audit'

/**
 * Atualização em LOTE de investimento por plataforma + ROAS mínimo (planilha do
 * Marcos, 06/07/2026) com recálculo completo:
 *   1. Client.investimentoMeta/Google/Tiktok + roasMinimo (valores exatos do lote).
 *   2. Client.faturamentoEsperado = investimento total × ROAS mínimo (regra
 *      canônica — mantém o invariante "ROAS esperado = faturamento ÷ investimento").
 *   3. Goal(ROAS, MONTHLY) e Goal(FATURAMENTO, MONTHLY) do mês corrente (upsert
 *      pela chave única, mesmo padrão de migrar-metas-faturamento).
 *   4. Sync mensal → semanal (weekly-goals-sync) + recálculo de saúde por cliente.
 *   5. Valida o mês corrente: realizado (fonte única) vs esperado pró-rata.
 *
 * Idempotente (upserts/updates com os mesmos valores). try/catch por cliente
 * (CLAUDE.md #7). NÃO inventa dado: cliente não encontrado ou sem snapshot é
 * sinalizado no resumo.
 */

type LoteItem = {
  nome: string           // como está na planilha
  aliases: string[]      // formas de casar com Client.name (contains, insensitive)
  meta: number
  google: number
  tiktok: number
  roas: number
}

// Valores EXATOS da planilha (print de 06/07/2026). Não alterar sem nova planilha.
const LOTE: LoteItem[] = [
  { nome: 'Michelle Rossi',       aliases: ['michelle rossi'],          meta: 12000, google: 1000, tiktok: 0, roas: 8 },
  { nome: 'Use Lazuli',           aliases: ['lazuli', 'lazulli'],       meta: 4000,  google: 0,    tiktok: 0, roas: 7 },
  { nome: 'Espaço Barbara Issas', aliases: ['barbara issas'],           meta: 7500,  google: 0,    tiktok: 0, roas: 10 },
  { nome: 'Bambola',              aliases: ['bambola'],                 meta: 3000,  google: 0,    tiktok: 0, roas: 7 },
  { nome: 'Lavinny',              aliases: ['lavinny'],                 meta: 6000,  google: 500,  tiktok: 0, roas: 8 },
  { nome: 'New Man',              aliases: ['new man'],                 meta: 10000, google: 3000, tiktok: 0, roas: 7 },
  { nome: 'Outlet Mauá',          aliases: ['outlet maua', 'outlet mauá'], meta: 15000, google: 3000, tiktok: 0, roas: 8 },
  { nome: 'My Muse',              aliases: ['my muse'],                 meta: 9000,  google: 0,    tiktok: 0, roas: 8 },
  { nome: 'Tayna Moda Feminina',  aliases: ['tayna'],                   meta: 5000,  google: 1000, tiktok: 0, roas: 7 },
]

export type LoteResumoRow = {
  cliente: string
  encontrado: boolean
  investimentoMeta: number
  investimentoGoogle: number
  investimentoTiktok: number
  investimentoTotal: number
  roasMinimo: number
  faturamentoEsperado: number
  realizadoMes: number | null
  esperadoProRata: number | null
  status: 'ACIMA' | 'DENTRO' | 'ABAIXO' | 'SEM_DADOS' | 'NAO_ENCONTRADO' | 'ERRO'
  observacao: string | null
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export async function atualizarInvestimentosLote(actor: {
  actorId: string
  actorRole: string
}): Promise<{ rows: LoteResumoRow[]; weeklySync: { synced: number } }> {
  const now = new Date()
  const { start: monthStart, end: monthEnd } = getMonthRange(now)
  // Fração do mês decorrida (p/ esperado pró-rata na validação).
  const fracaoMes = Math.min(1, Math.max(0.01, now.getDate() / monthEnd.getDate()))

  const activeClients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, businessType: true },
  })

  const rows: LoteResumoRow[] = []

  for (const item of LOTE) {
    const total = investimentoTotal(item.meta, item.google, item.tiktok)
    const faturamento = Math.round(item.roas * total * 100) / 100
    const base: LoteResumoRow = {
      cliente: item.nome,
      encontrado: false,
      investimentoMeta: item.meta,
      investimentoGoogle: item.google,
      investimentoTiktok: item.tiktok,
      investimentoTotal: total,
      roasMinimo: item.roas,
      faturamentoEsperado: faturamento,
      realizadoMes: null,
      esperadoProRata: null,
      status: 'NAO_ENCONTRADO',
      observacao: null,
    }

    try {
      // Localiza o cliente com confirmação: exatamente UM ativo casando o alias.
      const matches = activeClients.filter((c) =>
        item.aliases.some((a) => norm(c.name).includes(norm(a))),
      )
      if (matches.length === 0) {
        base.observacao = 'Cliente não encontrado entre os ativos — nada foi alterado.'
        rows.push(base)
        continue
      }
      if (matches.length > 1) {
        base.status = 'ERRO'
        base.observacao = `Ambíguo: ${matches.map((m) => m.name).join(' / ')} — nada foi alterado.`
        rows.push(base)
        continue
      }
      const client = matches[0]
      base.encontrado = true
      base.cliente = client.name

      // 1-2) Investimentos + ROAS mínimo + faturamento esperado (derivado).
      await prisma.client.update({
        where: { id: client.id },
        data: {
          investimentoMeta: item.meta,
          investimentoGoogle: item.google,
          investimentoTiktok: item.tiktok,
          roasMinimo: item.roas,
          faturamentoEsperado: faturamento,
        },
      })

      // 3) Metas do mês corrente (ROAS = eficiência; FATURAMENTO = crescimento).
      for (const [metric, target] of [
        ['ROAS', item.roas],
        ['FATURAMENTO', faturamento],
      ] as const) {
        await prisma.goal.upsert({
          where: {
            clientId_metric_period_startDate: {
              clientId: client.id,
              metric,
              period: 'MONTHLY',
              startDate: monthStart,
            },
          },
          update: { targetValue: target, endDate: monthEnd },
          create: {
            clientId: client.id,
            metric,
            period: 'MONTHLY',
            targetValue: target,
            startDate: monthStart,
            endDate: monthEnd,
          },
        })
      }

      // 4) Recalcula a saúde do cliente (SINC) com os dados novos.
      await recalculateClientHealth(client.id)

      // 5) Validação do mês: realizado (fonte única, MTD) vs esperado pró-rata.
      const realizado = await getRealizado(client.id, 'FATURAMENTO', 'MTD', client.businessType)
        .catch(() => null)
      const valor = realizado?.valor ?? null
      base.realizadoMes = valor
      base.esperadoProRata = Math.round(faturamento * fracaoMes * 100) / 100
      if (valor == null) {
        base.status = 'SEM_DADOS'
        base.observacao = 'Sem snapshot de faturamento no mês — verificar sincronização GA4/plataformas.'
      } else {
        const pace = base.esperadoProRata > 0 ? valor / base.esperadoProRata : 0
        base.status = pace >= 1.1 ? 'ACIMA' : pace >= 0.9 ? 'DENTRO' : 'ABAIXO'
        base.observacao = `Pace ${(pace * 100).toFixed(0)}% do esperado até hoje.`
      }
      rows.push(base)
    } catch (err) {
      base.status = 'ERRO'
      base.observacao = err instanceof Error ? err.message : String(err)
      rows.push(base)
    }
  }

  // Sync mensal → semanal (uma vez, cobre todos os clientes atualizados).
  let weeklySynced = 0
  try {
    const sync = await syncWeeklyGoalsFromMonthly()
    weeklySynced = sync.created + sync.updated
  } catch (err) {
    console.error('[atualizar-investimentos-lote] sync semanal falhou:', err)
  }

  await writeAuditLog({
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    action: 'client.atualizarInvestimentosLote',
    entityType: 'Client',
    entityId: 'bulk',
    metadata: {
      clientes: rows.map((r) => ({ cliente: r.cliente, status: r.status, faturamentoEsperado: r.faturamentoEsperado })),
    },
  })

  return { rows, weeklySync: { synced: weeklySynced } }
}
