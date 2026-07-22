import { NextRequest, NextResponse } from 'next/server'
import { syncAllMetaAccounts } from '@/services/meta-ads/sync'
import { syncAllGA4Accounts } from '@/services/ga4/sync'
import { syncAllGoogleAdsAccounts } from '@/services/google-ads/sync'
import { syncAllNuvemshopAccounts } from '@/services/nuvemshop/sync'
import { syncAllGa4SyncAccounts } from '@/services/ga4sync/sync'
import { recalculateAllClientsHealth } from '@/services/health-scorer'
import { detectOscillationsForAll } from '@/services/oscillation-detector'
import { scoreAllClientsChurnRisk } from '@/services/churn-scorer'
import { scoreAllClientsChurnRiskV2, ensureBacktestRerunTask } from '@/services/churn-scorer-v2'
import { checkBudgetWarnings } from '@/services/budget-monitor'
import { generateAllWeeklyReports } from '@/services/weekly-report-generator'
import { generateAllWeeklyChecklists } from '@/services/weekly-checklist-generator'
import { sendDailyDigest } from '@/services/notifications/daily-digest'
import { syncAsaasData } from '@/services/asaas/sync'
import { reconcileAsaasTasks } from '@/services/asaas-task-reconciler'
import { detectCriticalAccounts } from '@/services/critical-account-detector'
import { escalateStaleWarRooms } from '@/services/warroom-escalation'
import { monitorWarRooms } from '@/services/warroom-monitor'
import { checkInadimplencia } from '@/services/inadimplencia-checker'
import { checkLeadFollowups } from '@/services/lead-followup-checker'
import { escalateOverdueTasks, markOverdueTasks, checkValidationSla, alertOrphanedTasks } from '@/services/task-escalation'
import { prisma } from '@/lib/prisma'
import { detectSilentAtRiskClients } from '@/services/antichurn-monitor'
import { runRetentionWatchdog } from '@/services/retention-watchdog'
import { runPausedStaleMonitor } from '@/services/paused-stale-monitor'
import { runAlertSlaWatchdog } from '@/services/alert-sla-watchdog'
import { runChurnRadars } from '@/services/churn-radars'
import { runReportDeliveryTracker } from '@/services/report-delivery-tracker'
import { checkCheckins } from '@/services/checkin-monitor'
import { syncWeeklyGoalsFromMonthly } from '@/services/weekly-goals-sync'
import { checkContractExpiry } from '@/services/contract-expiry-checker'
import { flagExpiredContractsForRenewal } from '@/services/contract-renewal'
import { projetarMetasDoMes } from '@/services/meta-projection'
import { runTuesdayNpsRitual, runMondayFeedbackReset, runFridayFeedbackSweep } from '@/services/client-feedback-rituais'
import { isCronAuthorized } from '@/lib/cron-auth'
import { recordCronHeartbeat, recordCronProgress } from '@/lib/cron-heartbeat'

/**
 * GET /api/cron/daily  ← Vercel Cron triggers GET requests
 * POST /api/cron/daily ← manual/test trigger
 *
 * Master daily cron job. Runs at 11:00 UTC (08:00 BRT/São Paulo).
 * Auth: Vercel auto-sends "Authorization: Bearer {CRON_SECRET}".
 *       Manual calls may use "x-cron-secret: {CRON_SECRET}".
 */

function isAuthorized(request: NextRequest): boolean {
  return isCronAuthorized(request) // comparação timing-safe compartilhada
}

async function runDailySync() {
  const day           = new Date().getDay()
  const isSunday       = day === 0
  const isMonday       = day === 1
  const isTuesday      = day === 2
  const isFriday       = day === 5
  const isFirstOfMonth = new Date().getDate() === 1

  const summary: Record<string, unknown> = {
    synced: { meta: { ok: false }, ga4: { ok: false }, googleAds: { ok: false }, nuvemshop: { ok: false } },
    weeklyGoalsSync: isMonday ? { ok: false } : { ok: true, skipped: true },
    metaProjection: isFirstOfMonth ? { ok: false } : { ok: true, skipped: true },
    ga4sync: { ok: false },
    asaas: { ok: false },
    asaasReconcile: { ok: false },
    healthScores: { ok: false },
    alerts: { ok: false },
    churnRisk: { ok: false },
    antiChurnSilent: { ok: false },
    retentionWatchdog: { ok: false },
    alertSlaWatchdog: { ok: false },
    reportDelivery: { ok: false },
    checkins: { ok: false },
    budgetWarnings: { ok: false },
    criticalAccounts: { ok: false },
    warRoomEscalation: { ok: false },
    warRoomMonitor: { ok: false },
    inadimplencia: { ok: false },
    weeklyReports: isSunday ? { ok: false } : { ok: true, skipped: true },
    weeklyChecklists: isSunday ? { ok: false } : { ok: true, skipped: true },
    validationSla: { ok: false },
    orphanedTasks: { ok: false },
    contractExpiry:   { ok: false },
  }

  // ── Step 0: Asaas financeiro PRIMEIRO ──────────────────────────────────────
  // A DRE depende deste sync diário. Roda ANTES da cadeia pesada (syncs de
  // marketing + radares de churn): a função tem teto de 300s e, no fim da fila,
  // o Asaas era morto pelo timeout antes de rodar (última sync ficava dias
  // atrás). Financeiro é leve e independente — rodando primeiro, completa sempre.
  await recordCronProgress('Step 0')
  try {
    const asaasResult = await syncAsaasData()
    summary.asaas = { ok: true, ...asaasResult }
    await recordCronHeartbeat('ASAAS') // marca a última sincronização financeira bem-sucedida
  } catch (err) {
    summary.asaas = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  try {
    const reconcileResult = await reconcileAsaasTasks()
    summary.asaasReconcile = { ok: true, ...reconcileResult }
  } catch (err) {
    summary.asaasReconcile = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  try {
    const inadResult = await checkInadimplencia()
    summary.inadimplencia = { ok: true, ...inadResult }
  } catch (err) {
    summary.inadimplencia = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  // ── Step 1: Sync Meta Ads ──────────────────────────────────────────────────
  await recordCronProgress('Step 1')
  try {
    const metaResults = await syncAllMetaAccounts()
    ;(summary.synced as Record<string, unknown>).meta = { ok: true, accounts: metaResults.length }
  } catch (err) {
    ;(summary.synced as Record<string, unknown>).meta = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 2: Sync GA4 ───────────────────────────────────────────────────────
  await recordCronProgress('Step 2')
  try {
    const ga4Results = await syncAllGA4Accounts()
    ;(summary.synced as Record<string, unknown>).ga4 = { ok: true, accounts: ga4Results.length }
  } catch (err) {
    ;(summary.synced as Record<string, unknown>).ga4 = {
      ok: false, error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 2b: Sync Google Ads ───────────────────────────────────────────────
  await recordCronProgress('Step 2b')
  try {
    const gadsResults = await syncAllGoogleAdsAccounts()
    ;(summary.synced as Record<string, unknown>).googleAds = { ok: true, accounts: gadsResults.length }
  } catch (err) {
    ;(summary.synced as Record<string, unknown>).googleAds = {
      ok: false, error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 2c: Sync Nuvemshop ─────────────────────────────────────────────
  await recordCronProgress('Step 2c')
  try {
    const nuvemshopResults = await syncAllNuvemshopAccounts()
    ;(summary.synced as Record<string, unknown>).nuvemshop = { ok: true, accounts: nuvemshopResults.length }
  } catch (err) {
    ;(summary.synced as Record<string, unknown>).nuvemshop = {
      ok: false, error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 2c2: Sync GA4Sync (receita real de e-commerce → MetricSnapshot) ──
  // Roda DEPOIS de Nuvemshop e GA4 (depende do mapa loja↔cliente já existir).
  // Só persiste a receita diária autoritativa; a agregação que a consome é a
  // próxima fatia. try/catch isolado — não derruba o cron.
  await recordCronProgress('Step 2c2')
  try {
    const ga4syncResult = await syncAllGa4SyncAccounts()
    summary.ga4sync = {
      ok: true,
      synced: ga4syncResult.synced,
      skipped: ga4syncResult.skipped,
      failed: ga4syncResult.failed,
    }
  } catch (err) {
    summary.ga4sync = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  // ── Step 2d: Monday — sync weekly goals from monthly ─────────────────────
  // Runs every Monday so new weekly goals exist before health scores are computed.
  // Converts monthly goals → weekly (same target for rates, ÷4.33 for volumes).
  await recordCronProgress('Step 2d')
  if (isMonday) {
    try {
      const syncResult = await syncWeeklyGoalsFromMonthly()
      summary.weeklyGoalsSync = {
        ok: true,
        created: syncResult.created,
        updated: syncResult.updated,
        skipped: syncResult.skipped,
        total: syncResult.total,
      }
    } catch (err) {
      summary.weeklyGoalsSync = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  // ── Step 2e: Dia 1 do mês — projeção automática das metas do mês ─────────
  // Projeta a métrica-resultado de cada cliente (crescimento por tipo de
  // negócio), carrega as taxas do mês anterior e abre alerta de revisão.
  await recordCronProgress('Step 2e')
  if (isFirstOfMonth) {
    try {
      const projResult = await projetarMetasDoMes()
      summary.metaProjection = { ok: true, ...projResult }
    } catch (err) {
      summary.metaProjection = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  // ── Step 3: Recalculate health scores ─────────────────────────────────────
  await recordCronProgress('Step 3')
  try {
    const healthResult = await recalculateAllClientsHealth()
    summary.healthScores = {
      ok: true,
      clientsProcessed: healthResult.clientsProcessed,
      created: healthResult.totalCreated,
      updated: healthResult.totalUpdated,
    }
  } catch (err) {
    summary.healthScores = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 4: Oscillation detection ─────────────────────────────────────────
  await recordCronProgress('Step 4')
  try {
    const oscillationResult = await detectOscillationsForAll()
    summary.alerts = {
      ok: true,
      clientsProcessed: oscillationResult.clientsProcessed,
      totalAlerts: oscillationResult.totalAlerts,
    }
  } catch (err) {
    summary.alerts = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 5: Churn risk scoring ─────────────────────────────────────────────
  await recordCronProgress('Step 5')
  try {
    const churnResult = await scoreAllClientsChurnRisk()
    // v2 INFORMATIVO logo após o v1, no MESMO step: enriquece factors.v2 sem
    // tocar no score v1 nem disparar automação (FASE 1.4-PROVISÓRIA). Isolado
    // para que uma falha do v2 não invalide o resultado do v1.
    let churnV2: { enriched: number; failed: number } | { error: string }
    try {
      const v2Result = await scoreAllClientsChurnRiskV2()
      churnV2 = { enriched: v2Result.enriched, failed: v2Result.failed }
    } catch (errV2) {
      churnV2 = { error: errV2 instanceof Error ? errV2.message : String(errV2) }
    }
    // Mecanismo idempotente de reexecução do backtest (~out/2026).
    let backtestRerunTask: { created: boolean; reason: string } | { error: string }
    try {
      backtestRerunTask = await ensureBacktestRerunTask()
    } catch (errTask) {
      backtestRerunTask = { error: errTask instanceof Error ? errTask.message : String(errTask) }
    }
    summary.churnRisk = {
      ok: true,
      clientsProcessed: churnResult.clientsProcessed,
      avgScore: churnResult.avgScore,
      v2: churnV2,
      backtestRerunTask,
    }
  } catch (err) {
    summary.churnRisk = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 5a: Anti-churn — clientes em risco e silenciosos ─────────────────
  await recordCronProgress('Step 5a')
  try {
    const silentResult = await detectSilentAtRiskClients()
    summary.antiChurnSilent = {
      ok: true,
      checked: silentResult.checked,
      alerts: silentResult.alerts,
    }
  } catch (err) {
    summary.antiChurnSilent = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 5a2: Retention watchdog — escalação de retenção vencida + possível
  //             churn parado sem contato (o "não-evento" da retenção) ──────────
  await recordCronProgress('Step 5a2')
  try {
    const watchdogResult = await runRetentionWatchdog()
    summary.retentionWatchdog = { ok: true, ...watchdogResult }
  } catch (err) {
    summary.retentionWatchdog = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 5a2a: Monitor anti-esquecimento de clientes PAUSED (T-23) — pausa
  //             longa demais (>45d) vira limbo/churn não assumido. Dedupe
  //             semanal por cliente. try/catch isola falha do step. ────────────
  await recordCronProgress('Step 5a2a')
  try {
    const pausedStaleResult = await runPausedStaleMonitor()
    summary.pausedStaleMonitor = { ok: true, ...pausedStaleResult }
  } catch (err) {
    summary.pausedStaleMonitor = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 5a2b: Governança de alertas — SLA com dente + circuit breaker.
  //             Escala alertas não reconhecidos que estouraram o SLA e denuncia
  //             tipos de alerta "gritando demais" (ruído sem sinal). ───────────
  await recordCronProgress('Step 5a2b')
  try {
    const slaResult = await runAlertSlaWatchdog()
    summary.alertSlaWatchdog = { ok: true, ...slaResult }
  } catch (err) {
    summary.alertSlaWatchdog = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 5a4: Churn radars — suporte acumulado (#9), investimento caindo
  //             (#10), silêncio desacoplado (#11) e inadimplência → churn (#14).
  //             Cruza sinais que hoje passam batidos por estarem em tabelas
  //             separadas; cada radar isola falha por cliente. ─────────────────
  await recordCronProgress('Step 5a4')
  try {
    const churnRadarsResult = await runChurnRadars()
    summary.churnRadars = { ok: true, ...churnRadarsResult }
  } catch (err) {
    summary.churnRadars = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 5a3: Entrega do relatório semanal — funil gerado→enviado→respondido
  //             (A) firstReplyAt automático (quando houver fonte de inbound do
  //             cliente) + (B) terça: relatório gerado e NÃO enviado ao cliente. ─
  await recordCronProgress('Step 5a3')
  try {
    const deliveryResult = await runReportDeliveryTracker({ isTuesday })
    summary.reportDelivery = { ok: true, ...deliveryResult }
  } catch (err) {
    summary.reportDelivery = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 5b2: Check-ins — sem check-in + reprovado sem correção ───────────
  await recordCronProgress('Step 5b2')
  try {
    const checkinResult = await checkCheckins()
    summary.checkins = {
      ok: true,
      missingAlerts: checkinResult.missingAlerts,
      staleRejectedAlerts: checkinResult.staleRejectedAlerts,
      reincidenciaTasks: checkinResult.reincidenciaTasks,
      reincidenciaAlerts: checkinResult.reincidenciaAlerts,
      semValidacaoAlerts: checkinResult.semValidacaoAlerts,
    }
  } catch (err) {
    summary.checkins = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // (Asaas sync + conciliação + inadimplência foram movidos para o Step 0, no
  //  topo — antes eram mortos pelo timeout no fim da fila.)

  // ── Step 5d: CAP-01 — follow-up comercial de leads quentes sem contato ─────
  await recordCronProgress('Step 5d')
  try {
    const followupResult = await checkLeadFollowups()
    summary.leadFollowups = { ok: true, ...followupResult }
  } catch (err) {
    summary.leadFollowups = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  // ── Step 5d.5: Marca tarefas vencidas como ATRASADO (antes de escalar) ─────
  await recordCronProgress('Step 5d.5')
  try {
    const overdueResult = await markOverdueTasks()
    summary.markOverdue = { ok: true, ...overdueResult }
  } catch (err) {
    summary.markOverdue = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  // ── Step 5e: Escalonamento de tarefas atrasadas (2+ dias) ──────────────────
  await recordCronProgress('Step 5e')
  try {
    const escResult = await escalateOverdueTasks()
    summary.taskEscalation = { ok: true, ...escResult }
  } catch (err) {
    summary.taskEscalation = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  // ── Step 5e.1: SLA de validação da CS (T-13) — tarefa entregue parada na fila
  //             da CS há >= 3 dias volta ao radar via Alert operacional. ────────
  await recordCronProgress('Step 5e.1')
  try {
    const slaResult = await checkValidationSla()
    summary.validationSla = { ok: true, ...slaResult }
  } catch (err) {
    summary.validationSla = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  // ── Step 5e.2: Tarefas em responsável desativado (T-15) — dono inativo não
  //             age; cobra reatribuição via Alert (ou AutomationLog se sem cliente). ─
  await recordCronProgress('Step 5e.2')
  try {
    const orphanResult = await alertOrphanedTasks()
    summary.orphanedTasks = { ok: true, ...orphanResult }
  } catch (err) {
    summary.orphanedTasks = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  // ── Step 6: Budget warnings ────────────────────────────────────────────────
  await recordCronProgress('Step 6')
  try {
    const budgetResult = await checkBudgetWarnings()
    summary.budgetWarnings = {
      ok: true,
      clientsChecked: budgetResult.clientsChecked,
      warningsFired: budgetResult.warningsFired,
    }
  } catch (err) {
    summary.budgetWarnings = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 6b: Critical account protocol detection ──────────────────────────
  await recordCronProgress('Step 6b')
  try {
    const criticalResult = await detectCriticalAccounts()
    summary.criticalAccounts = {
      ok: true,
      clientsChecked: criticalResult.clientsChecked,
      alertsFired: criticalResult.alertsFired,
    }
  } catch (err) {
    summary.criticalAccounts = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 6c: War Room escalation (3 semanas em crítico → Marcos) ──────────
  await recordCronProgress('Step 6c')
  try {
    const escalationResult = await escalateStaleWarRooms()
    summary.warRoomEscalation = {
      ok: true,
      checked: escalationResult.checked,
      escalated: escalationResult.escalated,
    }
  } catch (err) {
    summary.warRoomEscalation = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 6d: War Room monitoring (critério de saída + revisão semanal) ────
  await recordCronProgress('Step 6d')
  try {
    const monitorResult = await monitorWarRooms()
    summary.warRoomMonitor = {
      ok: true,
      checked: monitorResult.checked,
      reviewAlerts: monitorResult.reviewAlerts,
      exitMetAlerts: monitorResult.exitMetAlerts,
      regressionAlerts: monitorResult.regressionAlerts,
      diagnosticoChaseTasks: monitorResult.diagnosticoChaseTasks,
    }
  } catch (err) {
    summary.warRoomMonitor = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 7: Sunday-only — weekly reports & checklists (semana Dom-Sab) ─────
  await recordCronProgress('Step 7')
  if (isSunday) {
    try {
      const reportResult = await generateAllWeeklyReports()
      summary.weeklyReports = {
        ok: true,
        clientsProcessed: reportResult.clientsProcessed,
        reportsGenerated: reportResult.reportsGenerated,
      }
    } catch (err) {
      summary.weeklyReports = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }

    try {
      const checklistResult = await generateAllWeeklyChecklists()
      summary.weeklyChecklists = {
        ok: true,
        managersProcessed: checklistResult.managersProcessed,
        totalItems: checklistResult.totalItems,
      }
    } catch (err) {
      summary.weeklyChecklists = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
      // T-21: a semana sem checklist não pode morrer em silêncio — registra a
      // falha para virar sinal (e habilitar a regeneração manual pelo seed).
      await prisma.automationLog
        .create({
          data: {
            status: 'FALHA',
            reason: `Geração do checklist semanal (domingo) falhou — regere manualmente em Ajustes › Semear operação: ${err instanceof Error ? err.message : String(err)}`,
          },
        })
        .catch(() => {})
    }
  }

  // ── Step 7a1: SEGUNDA — zeragem semanal do feedback negativo (C.2) ────────
  // ANTES de zerar, registra quem fechou a semana em risco (Alert +
  // Client.fechouSemanaEmRisco). Dedupe por dia. Roda cedo o suficiente na
  // segunda; independe do resultado-engine.
  await recordCronProgress('Step 7a1')
  if (isMonday) {
    try {
      const resetResult = await runMondayFeedbackReset()
      summary.feedbackReset = { ok: true, ...resetResult }
    } catch (err) {
      summary.feedbackReset = { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Step 7a2: TERÇA — ritual de preenchimento de NPS pela CS ──────────────
  await recordCronProgress('Step 7a2')
  if (isTuesday) {
    try {
      const npsRitual = await runTuesdayNpsRitual()
      summary.npsRitualTerca = { ok: true, ...npsRitual }
    } catch (err) {
      summary.npsRitualTerca = { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Step 7a3: SEXTA — varredura consolidada dos feedbacks da semana (C.3) ─
  await recordCronProgress('Step 7a3')
  if (isFriday) {
    try {
      const sweep = await runFridayFeedbackSweep()
      summary.feedbackSweepSexta = { ok: true, ...sweep }
    } catch (err) {
      summary.feedbackSweepSexta = { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Step 7b: Contract expiry check ───────────────────────────────────────
  await recordCronProgress('Step 7b')
  try {
    const expiryResult = await checkContractExpiry()
    summary.contractExpiry = { ok: true, alertsFired: expiryResult.alertsFired }
  } catch (err) {
    summary.contractExpiry = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  // ── Step 7c: Contrato vencido → RENOVAÇÃO + alerta (adendo FUNDACAO) ───────
  // Substitui a renovação silenciosa: contrato que vence entra em RENOVACAO e
  // gera alerta ao cliente; a conclusão vem na reativação ou no Jurídico.
  await recordCronProgress('Step 7c')
  try {
    const renewResult = await flagExpiredContractsForRenewal()
    summary.contractRenewal = { ok: true, ...renewResult }
  } catch (err) {
    summary.contractRenewal = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  // WhatsApp digest is sent by /api/cron/digest (runs at 08:30 BRT/São Paulo),
  // 30 minutes after this cron finishes — ensures fresh health scores are
  // available when the digest is built.

  // ── WATCHDOG (S1-007) camada 1: heartbeat da última execução ──────────────
  // Grava CRON_DAILY_LAST_RUN. A leitura (getCronHealth) alimenta o banner do
  // Cockpit, que avisa se esta rotina parar de rodar (dado velho ≠ dado atual).
  // NUNCA derruba o cron — recordCronHeartbeat trata seu próprio erro.
  await recordCronProgress('CONCLUÍDO')
  await recordCronHeartbeat('DAILY')

  return summary
}

// GET — Vercel Cron auto-trigger
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const summary = await runDailySync()
  return NextResponse.json({ ok: true, ...summary })
}

// POST — manual / test trigger (same logic)
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const summary = await runDailySync()
  return NextResponse.json({ ok: true, ...summary })
}
