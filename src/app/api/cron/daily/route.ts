import { NextRequest, NextResponse } from 'next/server'
import { syncAllMetaAccounts } from '@/services/meta-ads/sync'
import { syncAllGA4Accounts } from '@/services/ga4/sync'
import { syncAllGoogleAdsAccounts } from '@/services/google-ads/sync'
import { recalculateAllClientsHealth } from '@/services/health-scorer'
import { detectOscillationsForAll } from '@/services/oscillation-detector'
import { scoreAllClientsChurnRisk } from '@/services/churn-scorer'
import { checkBudgetWarnings } from '@/services/budget-monitor'
import { generateAllWeeklyReports } from '@/services/weekly-report-generator'
import { generateAllWeeklyChecklists } from '@/services/weekly-checklist-generator'

/**
 * POST /api/cron/daily
 *
 * Master daily cron job. Runs at 12:00 UTC (09:00 BRT).
 * Auth: x-cron-secret header only (no session required).
 *
 * Steps (each runs independently — one failing won't stop the others):
 *   1. Sync all Meta Ads accounts
 *   2. Sync all GA4 accounts
 *   3. Recalculate health scores for all active clients
 *   4. Run oscillation detection for all active clients
 *   5. Score churn risk for all active clients
 *   6. Check budget warnings (≥90% consumed)
 *   7. [Mondays only] Generate weekly reports and checklists
 *
 * Returns a JSON summary.
 */
export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get('x-cron-secret')
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isMonday = new Date().getDay() === 1

  const summary: Record<string, unknown> = {
    synced: { meta: { ok: false }, ga4: { ok: false }, googleAds: { ok: false } },
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

  return NextResponse.json({ ok: true, ...summary })
}
