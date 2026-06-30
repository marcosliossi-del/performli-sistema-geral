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
import { detectCriticalAccounts } from '@/services/critical-account-detector'
import { escalateStaleWarRooms } from '@/services/warroom-escalation'
import { monitorWarRooms } from '@/services/warroom-monitor'
import { checkInadimplencia } from '@/services/inadimplencia-checker'
import { detectSilentAtRiskClients } from '@/services/antichurn-monitor'
import { syncWeeklyGoalsFromMonthly } from '@/app/actions/goals'
import { checkContractExpiry } from '@/services/contract-expiry-checker'

/**
 * GET /api/cron/daily  ← Vercel Cron triggers GET requests
 * POST /api/cron/daily ← manual/test trigger
 *
 * Master daily cron job. Runs at 11:00 UTC (08:00 BRT/São Paulo).
 * Auth: Vercel auto-sends "Authorization: Bearer {CRON_SECRET}".
 *       Manual calls may use "x-cron-secret: {CRON_SECRET}".
 */

function isAuthorized(request: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret) return false
  const authHeader = request.headers.get('authorization')
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const customSecret = request.headers.get('x-cron-secret')
  return (bearerSecret ?? customSecret) === expectedSecret
}

async function runDailySync() {
  const day      = new Date().getDay()
  const isSunday = day === 0
  const isMonday = day === 1

  const summary: Record<string, unknown> = {
    synced: { meta: { ok: false }, ga4: { ok: false }, googleAds: { ok: false }, nuvemshop: { ok: false } },
    weeklyGoalsSync: isMonday ? { ok: false } : { ok: true, skipped: true },
    asaas: { ok: false },
    healthScores: { ok: false },
    alerts: { ok: false },
    churnRisk: { ok: false },
    antiChurnSilent: { ok: false },
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
      summary.weeklyGoalsSync = { ok: true, created: syncResult.created, total: syncResult.total }
    } catch (err) {
      summary.weeklyGoalsSync = {
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

  // ── Step 5b: Sync Asaas financial data ────────────────────────────────────
  try {
    const asaasResult = await syncAsaasData()
    summary.asaas = { ok: true, ...asaasResult }
  } catch (err) {
    summary.asaas = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  // ── Step 5c: Inadimplência — régua de cobrança + cliente sem cobrança ─────
  try {
    const inadResult = await checkInadimplencia()
    summary.inadimplencia = { ok: true, ...inadResult }
  } catch (err) {
    summary.inadimplencia = { ok: false, error: err instanceof Error ? err.message : String(err) }
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

  // ── Step 7b: Contract expiry check ───────────────────────────────────────
  try {
    const expiryResult = await checkContractExpiry()
    summary.contractExpiry = { ok: true, alertsFired: expiryResult.alertsFired }
  } catch (err) {
    summary.contractExpiry = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  // WhatsApp digest is sent by /api/cron/digest (runs at 08:30 BRT/São Paulo),
  // 30 minutes after this cron finishes — ensures fresh health scores are
  // available when the digest is built.

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
