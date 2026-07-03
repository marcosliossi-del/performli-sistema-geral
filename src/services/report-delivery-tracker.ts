/**
 * Report Delivery Tracker (FASE 1.2 — anti-churn / Bloco 5)
 *
 * Fecha o funil da prestação de contas semanal: gerado → enviado → entregue →
 * respondido. Antes, o WeeklyReport só sabia que o relatório foi GERADO; nunca
 * se o cliente RECEBEU ou RESPONDEU — a falha mais silenciosa da auditoria
 * docs/AUDITORIA_CHURN_SILENCIOSO.md.
 *
 * Roda no cron diário. Dois radares:
 *
 *   (A) firstReplyAt automático — para relatórios já marcados como enviados
 *       (sentAt não-nulo) e ainda sem resposta registrada, tenta detectar a
 *       primeira resposta do cliente na janela sentAt < msg <= sentAt+72h.
 *
 *       ⚠️ LACUNA DE DADO (documentada e propagada no retorno como
 *       `fonteRespostaAusente`): a ÚNICA tabela de mensagens por cliente hoje é
 *       ClientChatMessage — que é o chat INTERNO do Performli (message.userId =
 *       usuário DA AGÊNCIA, não o cliente). O webhook Z-API
 *       (src/app/api/webhooks/whatsapp/route.ts) IGNORA e NÃO persiste mensagens
 *       de contatos já cadastrados como Client (retorna cedo na linha do
 *       `if (client) return`). Ou seja, NÃO existe no banco nenhuma fonte de
 *       "mensagem recebida DO cliente". Por isso NÃO correlacionamos com o chat
 *       interno — isso geraria um falso "cliente respondeu" a partir de uma
 *       mensagem escrita pela própria agência. firstReplyAt só será preenchido
 *       automaticamente quando existir uma fonte real de inbound do cliente
 *       (ex.: persistir a resposta do cliente no webhook Z-API — Fase futura).
 *
 *   (B) Alerta de terça — relatório GERADO na última semana e ainda NÃO enviado
 *       ao cliente → Alert operacional por cliente. Dedupe semanal por tag no
 *       body (padrão do retention-watchdog). try/catch por cliente.
 *
 * Regras: try/catch POR cliente (falha em um não derruba os demais); dedupe
 * determinístico por tag; AutomationLog no fim.
 */

import { prisma } from '@/lib/prisma'
import { getWeekRange } from '@/lib/utils'

const DEDUP_DAYS = 7
const REPLY_WINDOW_HOURS = 72
const SENT_LOOKBACK_DAYS = 14

// Marcador no body — dedupe por MOTIVO dentro da janela (padrão retention-watchdog).
const TAG_NAO_ENVIADO = '[report:nao-enviado]'

export type ReportDeliveryResult = {
  // (A) rastreamento de resposta
  replyChecked: number
  replyMatched: number
  /**
   * true = não há no banco nenhuma fonte de mensagem RECEBIDA do cliente, então
   * firstReplyAt não pode ser preenchido automaticamente sem gerar falso positivo.
   * Ver bloco (A) no cabeçalho. O painel exibe "—" com tooltip enquanto isto for true.
   */
  fonteRespostaAusente: boolean
  // (B) alerta de não-enviado (só popula quando roda na terça)
  naoEnviadoChecked: number
  naoEnviadoAlerts: number
  failed: number
}

/**
 * Detecta se existe alguma fonte de mensagem RECEBIDA do cliente no schema.
 * Hoje sempre retorna false: ClientChatMessage é chat interno (autor = usuário
 * da agência) e o webhook Z-API não persiste inbound de clientes já cadastrados.
 * Isolado numa função para o dia em que a fonte existir bastar trocar aqui.
 */
function hasClientInboundSource(): boolean {
  return false
}

export async function runReportDeliveryTracker(
  opts: { isTuesday: boolean } = { isTuesday: false },
): Promise<ReportDeliveryResult> {
  const now = Date.now()
  const fonteRespostaAusente = !hasClientInboundSource()

  let replyChecked = 0
  let replyMatched = 0
  let naoEnviadoChecked = 0
  let naoEnviadoAlerts = 0
  let failed = 0

  // ── (A) firstReplyAt automático ────────────────────────────────────────────
  // Só executa a correlação se houver fonte REAL de inbound do cliente. Sem ela,
  // apenas contamos os candidatos e sinalizamos a lacuna — NUNCA inventamos
  // "respondido" a partir do chat interno da agência.
  const sentLookback = new Date(now - SENT_LOOKBACK_DAYS * 86_400_000)
  const pendingReply = await prisma.weeklyReport.findMany({
    where: {
      sentAt: { not: null, gte: sentLookback },
      firstReplyAt: null,
    },
    select: { id: true, clientId: true, sentAt: true },
  })
  replyChecked = pendingReply.length

  if (!fonteRespostaAusente) {
    // Caminho ATIVADO no futuro, quando existir inbound do cliente no banco.
    // Mantido fechado hoje (hasClientInboundSource === false) para não regredir.
    for (const r of pendingReply) {
      if (!r.sentAt) continue
      try {
        const windowEnd = new Date(r.sentAt.getTime() + REPLY_WINDOW_HOURS * 3_600_000)
        // NOTA: quando a fonte existir, substituir por consulta à tabela de
        // inbound do cliente (createdAt > sentAt && <= windowEnd, autoria = cliente).
        void windowEnd
      } catch (err) {
        failed++
        console.error(`[report-delivery-tracker] falha na resposta do relatório ${r.id}:`, err)
      }
    }
  }

  // ── (B) Alerta de terça — relatório gerado e NÃO enviado ao cliente ─────────
  if (opts.isTuesday) {
    const { start: lastWeekStart } = getWeekRange(new Date(now - 7 * 86_400_000))
    const windowStart = new Date(now - DEDUP_DAYS * 86_400_000)

    const naoEnviados = await prisma.weeklyReport.findMany({
      where: { weekStart: lastWeekStart, sentAt: null },
      select: { id: true, clientId: true, generatedAt: true, client: { select: { name: true } } },
    })
    naoEnviadoChecked = naoEnviados.length

    for (const wr of naoEnviados) {
      try {
        const dias = Math.max(1, Math.floor((now - new Date(wr.generatedAt).getTime()) / 86_400_000))
        const nome = wr.client?.name ?? 'cliente'

        const existing = await prisma.alert.findFirst({
          where: {
            clientId: wr.clientId,
            type: 'TASK_AUTOMATION',
            createdAt: { gte: windowStart },
            body: { contains: TAG_NAO_ENVIADO },
          },
          select: { id: true },
        })
        if (existing) continue

        await prisma.alert.create({
          data: {
            clientId: wr.clientId,
            type: 'TASK_AUTOMATION',
            title: `Relatório da semana gerado e NÃO enviado ao cliente há ${dias} dias: ${nome}`,
            body:
              `O relatório semanal deste cliente foi gerado há ${dias} dias e ainda não foi ` +
              `enviado — a prestação de contas não chegou ao cliente. Enviar hoje e marcar ` +
              `como enviado na página do cliente. ${TAG_NAO_ENVIADO}`,
          },
        })
        naoEnviadoAlerts++
      } catch (err) {
        failed++
        console.error(`[report-delivery-tracker] falha no relatório não-enviado do cliente ${wr.clientId}:`, err)
      }
    }
  }

  await prisma.automationLog
    .create({
      data: {
        status: 'SUCESSO',
        reason:
          `report-delivery-tracker — respostas verificadas ${replyChecked} / ` +
          `casadas ${replyMatched}${fonteRespostaAusente ? ' (fonte de resposta do cliente ausente no banco)' : ''} / ` +
          `não-enviados ${naoEnviadoChecked} / alertas ${naoEnviadoAlerts}`,
      },
    })
    .catch(() => {})

  return {
    replyChecked,
    replyMatched,
    fonteRespostaAusente,
    naoEnviadoChecked,
    naoEnviadoAlerts,
    failed,
  }
}
