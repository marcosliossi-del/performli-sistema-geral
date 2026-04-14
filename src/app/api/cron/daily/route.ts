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

/**
 * POST /api/cron/daily
 *
 * Master daily cron job. Runs at 12:00 UTC (09:00 BRT).
 * Auth: x-cron-secret header only (no session required).
 *
 * Steps (each runs independently — one failing won't stop the others):
 *   1. Sync all Meta Ads accounts
 *   2. Sync all GA4 accounts
 *   2b. Sync all Google Ads accounts
 *   2c. Sync all Nuvemshop accounts
 *   3. Recalculate health scores for all active clients
 *   4. Run oscillation detection for all active clients
 *   5. Score churn risk for all active clients
 *   6. Check budget warnings (≥90% consumed)
 *   7. [Mondays only] Generate weekly reports and checklists
 *
 * Returns a JSON summary.
 */
export async function POST(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET
  // Vercel triggers cron jobs with "Authorization: Bearer {CRON_SECRET}"
  // Manual/test calls may use "x-cron-secret: {CRON_SECRET}"
  const authHeader = request.headers.get('authorization')
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const customSecret = request.headers.get('x-cron-secret')
  const providedSecret = bearerSecret ?? customSecret

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isMonday = new Date().getDay() === 1

  const summary: Record<string, unknown> = {
    synced: { meta: { ok: false }, ga4: { ok: false }, googleAds: { ok: false }, nuvemshop: { ok: false } },
    healthScores: { ok: false },
    alerts: { ok: false },
    churnRisk: { ok: false },
    budgetWarnings: { ok: false },
    weeklyReports: isMonday ? { ok: false } : { ok: true, skipped: true },
    weeklyChecklists: isMonday ? { ok: false } : { ok: true, skipped: true },
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

  // ── Step 7: Monday-only — weekly reports & checklists ─────────────────────
  if (isMonday) {
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

  // ── Step 8: WhatsApp daily digest ─────────────────────────────────────────
  try {
    const digestResult = await sendDailyDigest()
    summary.whatsappDigest = digestResult.skipped
      ? { ok: true, skipped: true }
      : { ok: true, sent: digestResult.sent }
  } catch (err) {
    summary.whatsappDigest = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  return NextResponse.json({ ok: true, ...summary })
}
