import { NextRequest, NextResponse } from 'next/server'
import { syncAllMetaAccounts } from '@/services/meta-ads/sync'
import { syncAllGA4Accounts } from '@/services/ga4/sync'
import { syncAllGoogleAdsAccounts } from '@/services/google-ads/sync'
import { syncAllNuvemshopAccounts } from '@/services/nuvemshop/sync'
import { recalculateAllClientsHealth } from '@/services/health-scorer'
import { detectOscillationsForAll } from '@/services/oscillation-detector'
import { scoreAllClientsChurnRisk } from '@/services/churn-scorer'
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
import { escalateOverdueTasks, markOverdueTasks } from '@/services/task-escalation'
import { detectSilentAtRiskClients } from '@/services/antichurn-monitor'
import { runRetentionWatchdog } from '@/services/retention-watchdog'
import { runReportDeliveryTracker } from '@/services/report-delivery-tracker'
import { checkCheckins } from '@/services/checkin-monitor'
import { syncWeeklyGoalsFromMonthly } from '@/services/weekly-goals-sync'
import { checkContractExpiry } from '@/services/contract-expiry-checker'
import { renewExpiredContracts } from '@/services/contract-renewal'
import { projetarMetasDoMes } from '@/services/meta-projection'
import { runTuesdayNpsRitual, runMondayFeedbackReset, runFridayFeedbackSweep } from '@/services/client-feedback-rituais'
import { isCronAuthorized } from '@/lib/cron-auth'
import { recordCronHeartbeat } from '@/lib/cron-heartbeat'

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
    asaas: { ok: false },
    asaasReconcile: { ok: false },
    healthScores: { ok: false },
    alerts: { ok: false },
    churnRisk: { ok: false },
    antiChurnSilent: { ok: false },
    retentionWatchdog: { ok: false },
    reportDelivery: { ok: false },
    checkins: { ok: false },
    budgetWarnings: { ok: false },
    criticalAccounts: { ok: false },
    warRoomEscalation: { ok: false },
    warRoomMonitor: { ok: false },
    inadimplencia: { ok: false },
    weeklyReports: isSunday ? { ok: false } : { ok: true, skipped: true },
    weeklyChecklists: isSunday ? { ok: false } : { ok: true, skipped: true },
    contractExpiry:   { ok: false },
  }

  // ── Step 1: Sync Meta Ads ──────────────────────────────────────────────────
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
  try {
    const ga4Results = await syncAllGA4Accounts()
    ;(summary.synced as Record<string, unknown>).ga4 = { ok: true, accounts: ga4Results.length }
  } catch (err) {
    ;(summary.synced as Record<string, unknown>).ga4 = {
      ok: false, error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 2b: Sync Google Ads ───────────────────────────────────────────────
  try {
    const gadsResults = await syncAllGoogleAdsAccounts()
    ;(summary.synced as Record<string, unknown>).googleAds = { ok: true, accounts: gadsResults.length }
  } catch (err) {
    ;(summary.synced as Record<string, unknown>).googleAds = {
      ok: false, error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 2c: Sync Nuvemshop ─────────────────────────────────────────────
  try {
    const nuvemshopResults = await syncAllNuvemshopAccounts()
    ;(summary.synced as Record<string, unknown>).nuvemshop = { ok: true, accounts: nuvemshopResults.length }
  } catch (err) {
    ;(summary.synced as Record<string, unknown>).nuvemshop = {
      ok: false, error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 2d: Monday — sync weekly goals from monthly ─────────────────────
  // Runs every Monday so new weekly goals exist before health scores are computed.
  // Converts monthly goals → weekly (same target for rates, ÷4.33 for volumes).
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
  try {
    const churnResult = await scoreAllClientsChurnRisk()
    summary.churnRisk = {
      ok: true,
      clientsProcessed: churnResult.clientsProcessed,
      avgScore: churnResult.avgScore,
    }
  } catch (err) {
    summary.churnRisk = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 5a: Anti-churn — clientes em risco e silenciosos ─────────────────
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
  try {
    const watchdogResult = await runRetentionWatchdog()
    summary.retentionWatchdog = { ok: true, ...watchdogResult }
  } catch (err) {
    summary.retentionWatchdog = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 5a3: Entrega do relatório semanal — funil gerado→enviado→respondido
  //             (A) firstReplyAt automático (quando houver fonte de inbound do
  //             cliente) + (B) terça: relatório gerado e NÃO enviado ao cliente. ─
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
  try {
    const checkinResult = await checkCheckins()
    summary.checkins = {
      ok: true,
      missingAlerts: checkinResult.missingAlerts,
      staleRejectedAlerts: checkinResult.staleRejectedAlerts,
    }
  } catch (err) {
    summary.checkins = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 5b: Sync Asaas financial data ────────────────────────────────────
  try {
    const asaasResult = await syncAsaasData()
    summary.asaas = { ok: true, ...asaasResult }
  } catch (err) {
    summary.asaas = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  // ── Step 5b.1: Asaas — concilia faturas ↔ tasks de cobrança (após o sync) ──
  try {
    const reconcileResult = await reconcileAsaasTasks()
    summary.asaasReconcile = { ok: true, ...reconcileResult }
  } catch (err) {
    summary.asaasReconcile = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  // ── Step 5c: Inadimplência — régua de cobrança + cliente sem cobrança ─────
  try {
    const inadResult = await checkInadimplencia()
    summary.inadimplencia = { ok: true, ...inadResult }
  } catch (err) {
    summary.inadimplencia = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  // ── Step 5d: CAP-01 — follow-up comercial de leads quentes sem contato ─────
  try {
    const followupResult = await checkLeadFollowups()
    summary.leadFollowups = { ok: true, ...followupResult }
  } catch (err) {
    summary.leadFollowups = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  // ── Step 5d.5: Marca tarefas vencidas como ATRASADO (antes de escalar) ─────
  try {
    const overdueResult = await markOverdueTasks()
    summary.markOverdue = { ok: true, ...overdueResult }
  } catch (err) {
    summary.markOverdue = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  // ── Step 5e: Escalonamento de tarefas atrasadas (2+ dias) ──────────────────
  try {
    const escResult = await escalateOverdueTasks()
    summary.taskEscalation = { ok: true, ...escResult }
  } catch (err) {
    summary.taskEscalation = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  // ── Step 6: Budget warnings ────────────────────────────────────────────────
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
  try {
    const monitorResult = await monitorWarRooms()
    summary.warRoomMonitor = {
      ok: true,
      checked: monitorResult.checked,
      reviewAlerts: monitorResult.reviewAlerts,
      exitMetAlerts: monitorResult.exitMetAlerts,
      regressionAlerts: monitorResult.regressionAlerts,
    }
  } catch (err) {
    summary.warRoomMonitor = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Step 7: Sunday-only — weekly reports & checklists (semana Dom-Sab) ─────
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
    }
  }

  // ── Step 7a1: SEGUNDA — zeragem semanal do feedback negativo (C.2) ────────
  // ANTES de zerar, registra quem fechou a semana em risco (Alert +
  // Client.fechouSemanaEmRisco). Dedupe por dia. Roda cedo o suficiente na
  // segunda; independe do resultado-engine.
  if (isMonday) {
    try {
      const resetResult = await runMondayFeedbackReset()
      summary.feedbackReset = { ok: true, ...resetResult }
    } catch (err) {
      summary.feedbackReset = { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Step 7a2: TERÇA — ritual de preenchimento de NPS pela CS ──────────────
  if (isTuesday) {
    try {
      const npsRitual = await runTuesdayNpsRitual()
      summary.npsRitualTerca = { ok: true, ...npsRitual }
    } catch (err) {
      summary.npsRitualTerca = { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Step 7a3: SEXTA — varredura consolidada dos feedbacks da semana (C.3) ─
  if (isFriday) {
    try {
      const sweep = await runFridayFeedbackSweep()
      summary.feedbackSweepSexta = { ok: true, ...sweep }
    } catch (err) {
      summary.feedbackSweepSexta = { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Step 7b: Contract expiry check ───────────────────────────────────────
  try {
    const expiryResult = await checkContractExpiry()
    summary.contractExpiry = { ok: true, alertsFired: expiryResult.alertsFired }
  } catch (err) {
    summary.contractExpiry = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  // ── Step 7c: Renovação automática de contratos vencidos (cliente ativo) ───
  try {
    const renewResult = await renewExpiredContracts()
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
